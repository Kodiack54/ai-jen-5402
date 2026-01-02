/**
 * Jen Processor v3.0 - Contextual Extraction with Substance
 *
 * ARCHITECTURE:
 * 1. Get session with project_id (cwd/path)
 * 2. Run smartPatterns for STRUCTURE items (literal pass-through)
 * 3. Run smartExtractor for SUBSTANCE items (contextual AI synthesis)
 * 4. Use session path for project detection (primary)
 * 5. Write items to destination tables with status='flagged'
 *
 * QUALITY > QUANTITY
 */

const { Logger } = require('../lib/logger');
const db = require('../lib/db');
const config = require('../lib/config');
const smartExtractor = require('./smartExtractor');
const structureExtractor = require('./structureExtractor');

const { extractFilePathsFromContent, detectProjectFromContentPaths } = require('./contentProjectDetector');
const logger = new Logger('Jen:Processor');

// 20 buckets → destination tables
const BUCKET_TO_TABLE = {
  'Bugs Open': 'dev_ai_bugs',
  'Bugs Fixed': 'dev_ai_bugs',
  'Todos': 'dev_ai_todos',
  'Journal': 'dev_ai_journal',
  'Work Log': 'dev_ai_journal',
  'Ideas': 'dev_ai_knowledge',
  'Decisions': 'dev_ai_decisions',
  'Lessons': 'dev_ai_lessons',
  'System Breakdown': 'dev_ai_docs',
  'How-To Guide': 'dev_ai_docs',
  'Schematic': 'dev_ai_docs',
  'Reference': 'dev_ai_docs',
  'Naming Conventions': 'dev_ai_conventions',
  'File Structure': 'dev_ai_conventions',
  'Database Patterns': 'dev_ai_conventions',
  'API Patterns': 'dev_ai_conventions',
  'Component Patterns': 'dev_ai_conventions',
  'Quirks & Gotchas': 'dev_ai_knowledge',
  'Snippets': 'dev_ai_snippets',
  'Other': 'dev_ai_knowledge'
};

// Project path → UUID cache
let projectPathCache = {};

/**
 * Initialize - load project path mappings
 */
async function initialize() {
  await loadProjectCache();
  logger.info('Processor initialized', { projectCount: Object.keys(projectPathCache).length });
  return true;
}

/**
 * Load project slugs for path matching
 */
async function loadProjectCache() {
  try {
    const { data: projects } = await db.from('dev_projects')
      .select('id, name, slug, parent_id, client_id, is_parent');

    if (projects) {
      projectPathCache = {};
      for (const p of projects) {
        // Skip parent projects - they are containers, items should go to children
        if (p.is_parent) continue;

        // Cache by slug and name variations
        const slug = (p.slug || '').toLowerCase();
        const name = (p.name || '').toLowerCase();

        if (slug) projectPathCache[slug] = p;
        if (name) projectPathCache[name] = p;

        // Also cache without port numbers (ai-jen-5402 → ai-jen)
        const slugNoPort = slug.replace(/-\d{4}$/, '');
        if (slugNoPort !== slug) projectPathCache[slugNoPort] = p;
      }
    }
  } catch (err) {
    logger.error('Failed to load project cache', { error: err.message });
  }
}

/**
 * Process active sessions - main entry point
 */
async function process(batchSize = 20) {
  let processed = 0;
  let errors = 0;
  let itemCount = 0;

  try {
    // Get active sessions WITH project_id (the cwd/path)
    const { data: sessions, error } = await db.from('dev_ai_sessions')
      .select('id, started_at, project_id, raw_content')
      .eq('status', 'active')
      .order('started_at', { ascending: true })
      .limit(batchSize);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      return { processed: 0, errors: 0, items: 0 };
    }

    logger.info('Processing sessions', { count: sessions.length });

    for (const session of sessions) {
      try {
        const result = await processSession(session);
        if (result.success) {
          processed++;
          itemCount += result.items;
        }
      } catch (err) {
        logger.error('Session failed', { sessionId: session.id, error: err.message });
        errors++;
      }
    }

  } catch (err) {
    logger.error('Process batch failed', { error: err.message });
    errors++;
  }

  logger.info('Process complete', { processed, errors, items: itemCount });
  return { processed, errors, items: itemCount };
}

/**
 * Process a single session
 */
async function processSession(session) {
  // Use raw_content directly if available, otherwise get from staging
  let conversationText = session.raw_content;

  if (!conversationText || conversationText.length < 100) {
    // Fall back to staging table
    const { data: messages } = await db.from('dev_ai_staging')
      .select('*')
      .eq('session_id', session.id)
      .order('captured_at', { ascending: true });

    if (!messages || messages.length < 3) {
      await markSessionProcessed(session.id, 0);
      return { success: false, items: 0, reason: 'not enough content' };
    }

    conversationText = messages
      .map(m => (m.role || 'unknown').toUpperCase() + ': ' + (m.content || ''))
      .join('\n\n');
  }

  // v3.6: Content-based project detection from file paths BEFORE slicing
  const rawContent = session.raw_content || conversationText;
  const contentForPaths = rawContent.length > 200000 ? rawContent.slice(-150000) : rawContent;

  // Limit to 50k chars for AI (after path extraction)
  // For long sessions (>100k), use LAST 50k chars to get recent work
  if (conversationText.length > 100000) {
    conversationText = conversationText.slice(-50000);
  } else {
    conversationText = conversationText.slice(0, 50000);
  }
  const contentPaths = extractFilePathsFromContent(contentForPaths);
  const contentProjectId = await detectProjectFromContentPaths(contentPaths, session.project_id, db, projectPathCache, logger);
  if (contentProjectId) {
    logger.info('Reassigning session to content-detected project', { sessionId: session.id, from: session.project_id, to: contentProjectId });
    await db.from('dev_ai_sessions').update({ project_id: contentProjectId }).eq('id', session.id);
    session.project_id = contentProjectId;
  }


  // Detect project from session path FIRST
  const projectUuids = detectProjectFromPath(session.project_id);

  logger.info('Session processing', {
    sessionId: session.id,
    sessionPath: session.project_id,
    detectedProject: projectUuids.project_id ? 'found' : 'null',
    contentLength: conversationText.length
  });

  // Collect all items
  let allItems = [];

  // 1. STRUCTURE items - literal pass-through (FREE)
  const structureItems = structureExtractor.extract(conversationText, session.project_id);
  if (structureItems && structureItems.length > 0) {
    allItems.push(...structureItems);
    logger.info('Structure items found', { count: structureItems.length });
  }

  // 2. SUBSTANCE items - contextual AI extraction
  // Always run this for quality extraction
  const substanceResult = await smartExtractor.extract(conversationText, {
    sessionCwd: session.project_id,
    projectPath: session.project_id
  });

  if (substanceResult && substanceResult.items) {
    // AI may also detect project
    if (substanceResult.detectedProject && !projectUuids.project_id) {
      const aiProject = detectProjectFromPath(substanceResult.detectedProject);
      if (aiProject.project_id) {
        projectUuids.project_id = aiProject.project_id;
        projectUuids.client_id = aiProject.client_id;
        projectUuids.parent_id = aiProject.parent_id;
      }
    }

    allItems.push(...substanceResult.items);
    logger.info('Substance items found', { count: substanceResult.items.length });
  }

  if (allItems.length === 0) {
    await markSessionProcessed(session.id, 0);
    return { success: true, items: 0 };
  }

  // Deduplicate items by content similarity
  allItems = deduplicateItems(allItems);

  // Write items to destination tables
  let itemsWritten = 0;
  for (const item of allItems) {
    const success = await writeItem(item, session.id, projectUuids);
    if (success) itemsWritten++;
  }

  await markSessionProcessed(session.id, itemsWritten);

  logger.info('Session complete', {
    sessionId: session.id,
    items: itemsWritten,
    buckets: [...new Set(allItems.map(i => i.bucket))]
  });

  return { success: true, items: itemsWritten };
}

/**
 * Detect project UUID from path/cwd
 */
function detectProjectFromPath(pathOrCwd) {
  const result = { client_id: null, parent_id: null, project_id: null };

  if (!pathOrCwd) return result;

  // v3.6 FIX: If input is already a UUID, use it directly
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(pathOrCwd)) {
    result.project_id = pathOrCwd;
    return result;
  }

  // Normalize path
  const path = pathOrCwd.toLowerCase().replace(/\\/g, '/');

  // Extract potential project name from path
  // e.g., "C:/Projects/Studio/kodiack-studio" → "kodiack-studio"
  // e.g., "/var/www/Studio/ai-team/ai-jen-5402" → "ai-jen-5402"
  const parts = path.split('/').filter(Boolean);

  // Try each part from end to beginning
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];

    // Try exact match
    if (projectPathCache[part]) {
      const project = projectPathCache[part];
      result.project_id = project.id;
      result.client_id = project.client_id;
      result.parent_id = project.parent_id;
      return result;
    }

    // Try without port number
    const partNoPort = part.replace(/-\d{4}$/, '');
    if (projectPathCache[partNoPort]) {
      const project = projectPathCache[partNoPort];
      result.project_id = project.id;
      result.client_id = project.client_id;
      result.parent_id = project.parent_id;
      return result;
    }

    // Try partial match (kodiack-studio → kodiack-dashboard)
    for (const [key, project] of Object.entries(projectPathCache)) {
      if (key.includes(part) || part.includes(key)) {
        result.project_id = project.id;
        result.client_id = project.client_id;
        result.parent_id = project.parent_id;
        return result;
      }
    }
  }

  return result;
}

/**
 * Deduplicate items by title/content similarity
 */
function deduplicateItems(items) {
  const seen = new Map();

  return items.filter(item => {
    // For structure items (generic titles like "Directory Tree"), use content hash
    // For substance items, use title
    const isStructure = item.isStructure || ['Database Patterns', 'File Structure', 'API Patterns', 'Component Patterns', 'Naming Conventions', 'Snippets', 'Schematic'].includes(item.bucket);

    let keyPart;
    if (isStructure) {
      // Use first 100 chars of content for structure items
      keyPart = (item.content || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100);
    } else {
      keyPart = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    }
    const key = item.bucket + ':' + keyPart;

    if (seen.has(key)) {
      // If duplicate, keep the one with more content
      const existing = seen.get(key);
      if ((item.content || '').length > (existing.content || '').length) {
        seen.set(key, item);
      }
      return false;
    }

    seen.set(key, item);
    return true;
  });
}

/**
 * Write item to destination table
 */
async function writeItem(item, sessionId, uuids) {
  const table = BUCKET_TO_TABLE[item.bucket] || 'dev_ai_knowledge';

  const baseRecord = {
    client_id: uuids.client_id,
    parent_id: uuids.parent_id,
    project_id: uuids.project_id,
    bucket: item.bucket,
    keywords: JSON.stringify(item.keywords || []),
    source_session_id: sessionId,
    status: 'flagged',
    created_at: new Date().toISOString()
  };

  try {
    if (table === 'dev_ai_todos') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title
      });
    }
    else if (table === 'dev_ai_bugs') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title,
        severity: 'medium'
      });
    }
    else if (table === 'dev_ai_knowledge') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        content: item.content || item.title,
        category: item.bucket
      });
    }
    else if (table === 'dev_ai_docs') {
      const docTypeMap = {
        'System Breakdown': 'breakdown',
        'How-To Guide': 'howto',
        'Schematic': 'schematic',
        'Reference': 'reference'
      };
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        content: item.content || item.title,
        doc_type: docTypeMap[item.bucket] || 'reference'
      });
    }
    else if (table === 'dev_ai_conventions') {
      const convTypeMap = {
        'Naming Conventions': 'naming',
        'File Structure': 'structure',
        'Database Patterns': 'database',
        'API Patterns': 'api',
        'Component Patterns': 'component'
      };
      await db.from(table).insert({
        ...baseRecord,
        name: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title,
        convention_type: convTypeMap[item.bucket] || 'other'
      });
    }
    else if (table === 'dev_ai_snippets') {
      await db.from(table).insert({
        ...baseRecord,
        content: item.content || item.title,
        snippet_type: 'extracted'
      });
    }
    else if (table === 'dev_ai_decisions') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title
      });
    }
    else if (table === 'dev_ai_lessons') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title
      });
    }
    else if (table === 'dev_ai_journal') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        content: item.content || item.title,
        entry_type: item.bucket === 'Work Log' ? 'work_log' : 'journal'
      });
    }

    return true;
  } catch (err) {
    logger.error('Failed to write item', { table, bucket: item.bucket, error: err.message });
    return false;
  }
}

/**
 * Mark session as processed
 */
async function markSessionProcessed(sessionId, itemCount) {
  try {
    await db.from('dev_ai_sessions')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        items_extracted: itemCount
      })
      .eq('id', sessionId);
  } catch (err) {
    logger.error('Failed to mark session processed', { error: err.message });
  }
}

// Compatibility exports
const quickProcess = () => process(10);
const smartProcess = () => process(20);

module.exports = {
  initialize,
  process,
  quickProcess,
  smartProcess,
  detectProjectFromPath,
  deduplicateItems
};
