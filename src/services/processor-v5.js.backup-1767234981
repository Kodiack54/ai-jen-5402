/**
 * SuperJen Processor v5.3 - Structure Auto-Assignment + Usage Logging
 *
 * CHANGES in v5.3:
 * - Structure items (Database, API, File) auto-assigned to projects via path detection
 * - Uses server_path from dev_projects table - NO HARDCODING
 * - Matches paths against database, sorted by specificity (longest first)
 * - Structure extraction is FREE (regex) and assigns project before Claude runs
 *
 * CHANGES in v5.2:
 * - Added usage logging to dev_ai_usage table
 * - Tracks input/output tokens, cost, duration
 * - Uses 'continuity' field to identify team member ('jen')
 *
 * CHANGES in v5.1:
 * - Claude now assigns project_id based on path + content context
 * - Parent projects list included in prompt
 */

const Anthropic = require('@anthropic-ai/sdk');
const { Logger } = require('../lib/logger');
const db = require('../lib/db');
const config = require('../lib/config');

const logger = new Logger('SuperJen:Processor');

// Claude client
let anthropic = null;

function getClient() {
  if (!anthropic) {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    logger.info('Claude client initialized');
  }
  return anthropic;
}

// Claude pricing (per 1M tokens) - Dec 2024
const CLAUDE_PRICING = {
  'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
};

/**
 * Calculate cost from tokens
 */
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING['claude-3-5-haiku-20241022'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Log AI usage to dev_ai_usage table
 * All team members use this same table, identified by 'continuity' field
 */
async function logUsage({
  model,
  inputTokens,
  outputTokens,
  durationMs,
  success = true,
  errorMessage = null,
  taskType = 'extraction',
  teamMember = 'jen'
}) {
  try {
    const costUsd = calculateCost(model, inputTokens, outputTokens);
    const totalTokens = inputTokens + outputTokens;

    const { error } = await db.from('dev_ai_usage').insert({
      service: 'anthropic',
      model: model,
      task_type: taskType,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
      success: success,
      error_message: errorMessage,
      user_id: null,
      project_id: null,
      continuity: teamMember
    });

    if (error) {
      logger.error('Failed to log usage', { error: error.message });
      return null;
    }

    logger.info('Usage logged', {
      member: teamMember,
      model,
      tokens: totalTokens,
      cost: `$${costUsd.toFixed(4)}`,
      duration: `${durationMs}ms`
    });

    return { costUsd, inputTokens, outputTokens, totalTokens };
  } catch (err) {
    logger.error('Usage logging error', { error: err.message });
    return null;
  }
}

// 20 buckets ΓåÆ 9 destination tables
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

// Project caches
let allProjects = [];        // ALL projects (parents + children) for path matching
let parentProjects = [];     // Only parents (for Claude prompt)
let projectLookup = {};      // by UUID
let projectBySlug = {};      // by slug
let projectPaths = [];       // { path: string, project: object } sorted by path length desc

/**
 * Initialize - load all projects
 */
async function initialize() {
  await loadProjects();
  logger.info('SuperJen initialized', {
    totalProjects: allProjects.length,
    parentProjects: parentProjects.length,
    pathsLoaded: projectPaths.length
  });
  return true;
}

/**
 * Load ALL projects for path matching + parent projects for Claude prompt
 */
async function loadProjects() {
  try {
    // Load ALL projects (parents + children) for path matching
    // Include droplet info for inheritance when auto-creating children
    const { data: projects } = await db.from('dev_projects')
      .select('id, name, slug, client_id, server_path, local_path, parent_id, is_parent, droplet_name, droplet_ip, port_dev')
      .eq('is_active', true);

    if (projects) {
      allProjects = projects.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        client_id: p.client_id,
        server_path: p.server_path,
        local_path: p.local_path,
        parent_id: p.parent_id,
        is_parent: p.is_parent,
        droplet_name: p.droplet_name,
        droplet_ip: p.droplet_ip,
        port_dev: p.port_dev
      }));

      // Filter for parent projects (for Claude prompt)
      parentProjects = allProjects.filter(p => !p.parent_id);

      projectLookup = {};
      projectBySlug = {};
      projectPaths = [];

      for (const p of allProjects) {
        projectLookup[p.id] = p;
        projectBySlug[p.slug] = p;

        // Build path matching list from BOTH server_path AND local_path
        if (p.server_path) {
          projectPaths.push({
            path: p.server_path.toLowerCase().replace(/\\/g, '/'),
            project: p,
            type: 'server'
          });
        }
        if (p.local_path) {
          projectPaths.push({
            path: p.local_path.toLowerCase().replace(/\\/g, '/'),
            project: p,
            type: 'local'
          });
        }
      }

      // Sort by path length descending (most specific first)
      // This ensures child projects (longer paths) match before parents
      projectPaths.sort((a, b) => b.path.length - a.path.length);

      logger.info('Loaded projects', {
        total: allProjects.length,
        parents: parentProjects.length,
        paths: projectPaths.length
      });
    }
  } catch (err) {
    logger.error('Failed to load projects', { error: err.message });
  }
}

/**
 * Get project list formatted for Claude
 */
function getProjectListForPrompt() {
  return parentProjects.map(p => `- ${p.name} (id: ${p.id})`).join('\n');
}

/**
 * Extract project folder name from a path
 * e.g., "C:\Projects\Studio\kodiack-dashboard-5500\src\app" -> "kodiack-dashboard-5500"
 * e.g., "/var/www/Studio/ai-team/ai-chad-5401/src" -> "ai-chad-5401"
 * Returns the full path to the project folder, preserving Windows/Unix format
 */
function extractProjectFolder(path) {
  if (!path) return null;

  const isWindows = isWindowsPath(path);
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  // Look for common project parent folders
  const projectParents = ['projects', 'studio', 'ai-team', 'premier_group', 'www', 'var'];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].toLowerCase();
    if (projectParents.includes(seg)) {
      // Next segment is likely the project folder
      const projectFolder = segments[i + 1];
      if (projectFolder && !projectFolder.startsWith('.') && projectFolder.length > 2) {
        // Build path preserving original format
        let fullPath;
        if (isWindows) {
          // Windows: C:/Projects/Studio/project-name
          fullPath = segments.slice(0, i + 2).join('/');
        } else {
          // Unix: /var/www/Studio/project-name
          fullPath = '/' + segments.slice(0, i + 2).join('/');
        }
        return {
          name: projectFolder,
          fullPath: fullPath
        };
      }
    }
  }

  return null;
}

/**
 * Extract port number from folder name like "ai-chad-5401" -> 5401
 */
function extractPortFromFolderName(folderName) {
  const portMatch = folderName.match(/(\d{4,5})$/);
  return portMatch ? parseInt(portMatch[1], 10) : null;
}

/**
 * Detect if a path is Windows (local) or Unix (server)
 */
function isWindowsPath(path) {
  return /^[a-z]:/i.test(path) || path.includes('\\');
}

/**
 * Auto-create a CHILD project when a new path is discovered
 * Inherits client_id, droplet_name, droplet_ip from parent
 * Extracts dev_port from folder name if present (e.g., "ai-chad-5401" -> 5401)
 * Sets local_path for Windows paths, server_path for Unix paths
 * @param {string} folderName - The folder name (e.g., "ai-dave-5408")
 * @param {string} fullPath - The full path (Windows or Unix)
 * @param {object} parentProject - The parent project to create under
 */
async function autoCreateProject(folderName, fullPath, parentProject) {
  const slug = folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const name = folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // If no parent, we can't inherit - log warning and skip
  if (!parentProject) {
    logger.warn('Cannot auto-create project without parent', { folderName, fullPath });
    return null;
  }

  // Extract port from folder name if present (e.g., "ai-chad-5401" -> 5401)
  const portDev = extractPortFromFolderName(folderName);

  // Determine if this is a Windows (local) or Unix (server) path
  const isLocal = isWindowsPath(fullPath);
  const normalizedPath = fullPath.replace(/\\/g, '/');

  try {
    const { data, error } = await db.from('dev_projects').insert({
      name: name,
      slug: slug,
      server_path: isLocal ? null : normalizedPath,  // Unix path
      local_path: isLocal ? normalizedPath : null,   // Windows path
      parent_id: parentProject.id,              // Link to parent
      client_id: parentProject.client_id,       // Inherit from parent
      droplet_name: parentProject.droplet_name, // Inherit from parent
      droplet_ip: parentProject.droplet_ip,     // Inherit from parent
      table_prefix: slug.replace(/-/g, '_') + '_', // Generate from slug
      port_dev: portDev,                        // Extract from folder name
      is_parent: false,                         // This is a child
      is_active: true,
      created_at: new Date().toISOString()
    }).select('id, name, slug, client_id, server_path, local_path, parent_id, is_parent, droplet_name, droplet_ip, port_dev').single();

    if (error) {
      logger.warn('Failed to auto-create child project', { slug, parent: parentProject.name, error: error.message });
      return null;
    }

    // Add to in-memory caches
    const project = {
      id: data.id,
      name: data.name,
      slug: data.slug,
      client_id: data.client_id,
      server_path: data.server_path,
      local_path: data.local_path,
      parent_id: data.parent_id,
      is_parent: data.is_parent,
      droplet_name: data.droplet_name,
      droplet_ip: data.droplet_ip,
      port_dev: data.port_dev
    };

    allProjects.push(project);
    projectLookup[project.id] = project;
    projectBySlug[project.slug] = project;

    // Add the new path to projectPaths for future matching
    projectPaths.push({
      path: normalizedPath.toLowerCase(),
      project: project,
      type: isLocal ? 'local' : 'server'
    });
    projectPaths.sort((a, b) => b.path.length - a.path.length);

    logger.info('Auto-created child project', {
      name,
      slug,
      path: normalizedPath,
      pathType: isLocal ? 'local' : 'server',
      portDev,
      parentName: parentProject.name,
      inheritedClientId: parentProject.client_id,
      inheritedDroplet: parentProject.droplet_name
    });
    return { project_id: project.id, client_id: project.client_id };

  } catch (err) {
    logger.error('Auto-create child project failed', { error: err.message });
    return null;
  }
}

/**
 * Find a parent project by walking UP the path
 * @param {string} normalizedPath - The normalized path (lowercase, forward slashes)
 * @returns {object|null} - The parent project or null
 */
function findParentByWalkingUp(normalizedPath) {
  const segments = normalizedPath.split('/').filter(Boolean);

  // Walk up from the full path, checking each level
  for (let i = segments.length - 1; i >= 0; i--) {
    const testPath = '/' + segments.slice(0, i + 1).join('/');

    // Check against all project paths
    for (const { path: projectPath, project } of projectPaths) {
      if (testPath === projectPath || testPath.endsWith(projectPath)) {
        // Found a match - this is the parent
        return { project, matchedPath: testPath };
      }
    }
  }

  return null;
}

/**
 * Detect project UUID from a file path (for structure auto-assignment)
 * Uses server_path from dev_projects table - auto-creates child if needed
 */
async function detectProjectFromPath(path) {
  if (!path) return null;

  // Normalize the input path
  const normalized = path.toLowerCase().replace(/\\/g, '/');

  // 1. EXACT/CONTAINS MATCH: Check against existing project server_paths
  // (sorted by length, most specific first - children match before parents)
  for (const { path: projectPath, project } of projectPaths) {
    if (normalized.includes(projectPath)) {
      // Skip parent projects - only assign to children
      if (project.is_parent) continue;
      return { project_id: project.id, client_id: project.client_id };
    }
  }

  // 2. SLUG MATCH: Try matching slug in path segments
  const segments = normalized.split('/').filter(Boolean);
  for (const seg of segments) {
    // Direct slug match
    if (projectBySlug[seg] && !projectBySlug[seg].is_parent) {
      const project = projectBySlug[seg];
      return { project_id: project.id, client_id: project.client_id };
    }

    // Partial match: path has "security" but slug is "31001-security"
    // Check if any slug ENDS with the segment (after a dash or port number)
    for (const [slug, project] of Object.entries(projectBySlug)) {
      // Match: slug ends with "-segment" (e.g., "31001-security" ends with "-security")
      if ((slug.endsWith('-' + seg) || slug.endsWith('_' + seg)) && !project.is_parent) {
        return { project_id: project.id, client_id: project.client_id };
      }
      // Match: segment without common prefixes matches slug
      const slugWithoutPort = slug.replace(/^\d+-/, ''); // Remove port prefix like "31001-"
      if (slugWithoutPort === seg && !project.is_parent) {
        return { project_id: project.id, client_id: project.client_id };
      }
    }
  }

  // 3. AUTO-DISCOVERY: Walk up to find parent, then create child
  const folderInfo = extractProjectFolder(path);
  if (folderInfo) {
    // Check if slug already exists
    const existingSlug = folderInfo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (projectBySlug[existingSlug] && !projectBySlug[existingSlug].is_parent) {
      const project = projectBySlug[existingSlug];
      return { project_id: project.id, client_id: project.client_id };
    }

    // Walk UP the path to find a parent project
    const parentResult = findParentByWalkingUp(normalized);

    if (parentResult) {
      // Found a parent - create child project under it
      logger.info('Found parent for auto-discovery', {
        newFolder: folderInfo.name,
        parentName: parentResult.project.name,
        parentPath: parentResult.matchedPath
      });

      return await autoCreateProject(folderInfo.name, folderInfo.fullPath, parentResult.project);
    } else {
      // No parent found - log warning but don't create orphan
      logger.warn('No parent project found for path', {
        path: normalized,
        folder: folderInfo.name
      });
    }
  }

  return null;
}

/**
 * Main entry point - process active sessions
 */
async function process(batchSize = 20) {
  let processed = 0;
  let errors = 0;
  let itemCount = 0;

  try {
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
        logger.error('Session failed', { id: session.id, error: err.message });
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
 * Extract the REAL project path (cwd) from session content
 * The session.project_id field is often wrong - cwd in the JSON is correct
 */
function extractCwdFromContent(content) {
  // Look for "cwd":"C:\\Projects\\..." pattern in JSONL content
  const cwdMatch = content.match(/"cwd"\s*:\s*"([^"]+)"/);
  if (cwdMatch) {
    // Unescape the path (\\Projects -> \Projects)
    return cwdMatch[1].replace(/\\\\/g, '/').replace(/\\/g, '/');
  }
  return null;
}

/**
 * Process a single session
 */
async function processSession(session) {
  let content = session.raw_content || '';

  if (content.length < config.MIN_CONTENT_LENGTH) {
    await markSessionProcessed(session.id, 0);
    return { success: false, items: 0, reason: 'content too short' };
  }

  // Extract REAL project path from content (cwd field in JSONL)
  const realProjectPath = extractCwdFromContent(content) || session.project_id;

  if (content.length > 100000) {
    content = content.slice(-50000);
  } else if (content.length > 50000) {
    content = content.slice(0, 50000);
  }

  logger.info('Processing session', {
    id: session.id,
    path: realProjectPath,
    contentLen: content.length
  });

  const allItems = [];

  // 1. PASS-THROUGH: Structure extraction (free - regex, auto-assigns project)
  const structureItems = await extractStructure(content, realProjectPath);
  allItems.push(...structureItems);

  if (structureItems.length > 0) {
    logger.info('Structure items', { count: structureItems.length });
  }

  // 2. SMART: Claude AI extraction with project detection
  const smartItems = await extractWithClaude(content, realProjectPath);
  allItems.push(...smartItems);

  if (smartItems.length > 0) {
    logger.info('Smart items', { count: smartItems.length });
  }

  if (allItems.length === 0) {
    await markSessionProcessed(session.id, 0);
    return { success: true, items: 0 };
  }

  const uniqueItems = deduplicateItems(allItems);

  let itemsWritten = 0;
  for (const item of uniqueItems) {
    const success = await writeItem(item, session.id);
    if (success) itemsWritten++;
  }

  await markSessionProcessed(session.id, itemsWritten);

  logger.info('Session complete', {
    id: session.id,
    items: itemsWritten,
    buckets: [...new Set(uniqueItems.map(i => i.bucket))]
  });

  return { success: true, items: itemsWritten };
}

/**
 * PASS-THROUGH: Extract structure items (free - regex)
 * Auto-assigns project based on session path - auto-creates projects if needed
 */
async function extractStructure(content, sessionPath) {
  const items = [];
  const projectInfo = await detectProjectFromPath(sessionPath);

  // SQL Schema detection
  const sqlMatches = content.match(/CREATE TABLE[\s\S]{10,500}?;/gi) || [];
  const alterMatches = content.match(/ALTER TABLE[\s\S]{10,300}?;/gi) || [];

  for (const sql of [...sqlMatches, ...alterMatches]) {
    const tableMatch = sql.match(/(?:CREATE|ALTER) TABLE (?:IF NOT EXISTS )?["']?(\w+)["']?/i);
    if (tableMatch) {
      items.push({
        bucket: 'Database Patterns',
        title: `Schema: ${tableMatch[1]}`,
        content: sql.trim(),
        keywords: ['sql', 'schema', tableMatch[1].toLowerCase()],
        project_id: projectInfo?.project_id || null,
        client_id: projectInfo?.client_id || null
      });
    }
  }

  // API endpoint detection
  const apiPatterns = [
    /(?:GET|POST|PUT|PATCH|DELETE)\s+[\/][\w\-\/\{\}:]+/gi,
    /router\.(get|post|put|patch|delete)\s*\(['"][\w\-\/\{\}:]+['"]/gi,
    /app\.(get|post|put|patch|delete)\s*\(['"][\w\-\/\{\}:]+['"]/gi
  ];

  for (const pattern of apiPatterns) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      const endpoint = match.replace(/router\.|app\.|['"\(\)]/g, '');
      if (endpoint.length > 3) {
        items.push({
          bucket: 'API Patterns',
          title: `Endpoint: ${endpoint.slice(0, 50)}`,
          content: match,
          keywords: ['api', 'endpoint', 'route'],
          project_id: projectInfo?.project_id || null,
          client_id: projectInfo?.client_id || null
        });
      }
    }
  }

  // File structure detection - Windows and Unix paths
  // STRICT: Must have proper path structure AND file extension
  // Only project directories - NOT system paths
  const filePathPatterns = [
    /[A-Z]:\\Projects\\[\w.-]+(?:\\[\w.-]+)+\.\w{1,10}/gi,  // Windows: C:\Projects\...\file.ext
    /\/var\/www\/[\w.-]+(?:\/[\w.-]+)+\.\w{1,10}/gi,        // Unix: /var/www/project/file.ext (projects only)
  ];

  const seenPaths = new Set();
  for (const pattern of filePathPatterns) {
    const matches = content.match(pattern) || [];
    for (const filePath of matches) {
      const normalized = filePath.toLowerCase().replace(/\\/g, '/');
      if (seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);

      // Skip system/garbage paths
      if (/node_modules|__pycache__|\.git|\.next|dist\/|build\/|\.cache/.test(filePath)) continue;

      const fileName = filePath.split(/[\/\\]/).pop();
      const ext = fileName?.split('.').pop()?.toLowerCase();

      // Skip non-code files
      if (['log', 'tmp', 'cache', 'lock', 'map', 'svg', 'png', 'jpg', 'gif', 'ico'].includes(ext)) continue;

      // Skip if filename looks like garbage (too short, has weird chars, or is just numbers)
      if (!fileName || fileName.length < 3 || /^[\d\s→]+$/.test(fileName)) continue;

      // Must have valid code file extension
      const validExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'md', 'sql', 'sh', 'css', 'html', 'vue', 'go', 'rs', 'java', 'php', 'rb', 'yml', 'yaml', 'env', 'config'];
      if (!validExts.includes(ext)) continue;

      // Detect project from this specific path, fall back to session path
      const pathProject = await detectProjectFromPath(filePath) || projectInfo;

      // SKIP if no project could be determined - don't create orphan entries
      if (!pathProject?.project_id) {
        logger.debug('Skipping structure item - no project detected', { path: filePath });
        continue;
      }

      items.push({
        bucket: 'File Structure',
        title: fileName,
        content: filePath,
        keywords: ['file', ext || 'unknown', fileName?.replace(/\.\w+$/, '') || 'file'],
        project_id: pathProject.project_id,
        client_id: pathProject.client_id || null
      });
    }
  }

  if (items.length > 0) {
    logger.info('Structure extraction', {
      count: items.length,
      sessionPath,
      projectAssigned: projectInfo?.project_id ? 'yes' : 'no'
    });
  }

  return items;
}

/**
 * SMART: Claude AI extraction + usage logging
 */
async function extractWithClaude(content, sessionPath) {
  const client = getClient();
  const projectList = getProjectListForPrompt();
  const startTime = Date.now();

  const systemPrompt = `You are SuperJen, extracting development items from coding sessions.

YOU HAVE THE FULL CONVERSATION - USE IT:
When someone says "that's not working" or "this broke" - you can see WHAT they were working on.
Include the COMPLETE context: the file, the feature, the actual error, what was tried.
Don't summarize into corporate bullet points. Capture the real situation.

CATEGORIZE CORRECTLY:
- Bugs Open: Something is BROKEN. Include: what's broken, where, what error, what was tried
- Bugs Fixed: Something WAS broken, now fixed. Include: what was wrong, how it was fixed
- Todos: Something NEEDS TO BE DONE (not broken, just incomplete). Include: what exactly, where, why
- Ideas: Suggestions for future. Include: the idea and reasoning
- Lessons: Something LEARNED. Include: what was learned, what mistake led to it
- Decisions: A choice was made. Include: what was decided and why
- Work Log: What was accomplished in the session
- Journal: General session notes

DO NOT:
- Make up details that aren't in the conversation
- Guess at errors or file names if not mentioned
- Extract vague items like "continue development" or "work on feature"
- Summarize away the useful details

IF THE CONTEXT IS CLEAR FROM THE CONVERSATION - INCLUDE IT
IF THE CONTEXT IS NOT CLEAR - SKIP IT (don't guess)

PROJECT DETECTION:
Assign each item to one of these projects based on path and content:
${projectList}

If you cannot determine the project, use null for project_id.

Respond ONLY with valid JSON array. Each item MUST have:
- bucket: One of [Todos, Bugs Open, Bugs Fixed, Ideas, Decisions, Lessons, Work Log, Journal]
- title: Short descriptive title (max 100 chars)
- content: FULL details with complete context from the conversation
- keywords: Array of 2-5 relevant keywords
- project_id: UUID from the project list above, or null if uncertain

If nothing worth extracting, return empty array: []`;

  try {
    const response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: config.MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Extract actionable items from this coding session.

Session path: ${sessionPath || 'Unknown'}

Session content:
${content}

Remember:
1. Quality over quantity - only extract specific, actionable items
2. MUST include project_id for each item (use the UUIDs from the project list)
Return JSON array only.`
        }
      ]
    });

    const durationMs = Date.now() - startTime;

    // LOG USAGE - This is the key addition in v5.2
    if (response.usage) {
      await logUsage({
        model: response.model || config.CLAUDE_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs: durationMs,
        success: true,
        taskType: 'extraction',
        teamMember: 'jen'
      });
    }

    const responseText = response.content[0].text;

    try {
      let jsonText = responseText;

      // Try to extract JSON from code blocks first
      if (responseText.includes('```')) {
        const match = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonText = match[1];
      }

      // If not in code block, try to find JSON array in the response
      // Claude sometimes adds explanation text before/after the JSON
      if (!jsonText.trim().startsWith('[')) {
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonText = arrayMatch[0];
        }
      }

      const items = JSON.parse(jsonText.trim());

      if (!Array.isArray(items)) {
        logger.warn('Claude returned non-array', { response: responseText.slice(0, 200) });
        return [];
      }

      return items.filter(item => {
        if (!item.bucket || !item.title) return false;
        if (!BUCKET_TO_TABLE[item.bucket]) return false;
        if (item.title.length < 10) return false;

        if (item.project_id && !projectLookup[item.project_id]) {
          logger.warn('Invalid project_id from Claude', { project_id: item.project_id });
          item.project_id = null;
        }

        const vague = ['continue', 'working on', 'progress', 'stuff', 'things', 'some'];
        if (vague.some(v => item.title.toLowerCase().includes(v))) return false;
        return true;
      }).slice(0, 10);

    } catch (parseErr) {
      logger.error('JSON parse failed', { error: parseErr.message, response: responseText.slice(0, 500) });
      return [];
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Log failed call too
    await logUsage({
      model: config.CLAUDE_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: durationMs,
      success: false,
      errorMessage: err.message,
      taskType: 'extraction',
      teamMember: 'jen'
    });

    logger.error('Claude extraction failed', { error: err.message });
    return [];
  }
}

/**
 * Deduplicate items by title similarity
 */
function deduplicateItems(items) {
  const seen = new Map();

  return items.filter(item => {
    // For structure items, use content (file path) since titles are just filenames
    // which can be duplicated across folders (e.g., multiple "index.js")
    const STRUCTURE_BUCKETS = ['File Structure', 'Database Patterns', 'API Patterns', 'Component Patterns', 'Naming Conventions', 'Snippets', 'Schematic'];
    const isStructure = STRUCTURE_BUCKETS.includes(item.bucket);
    const keySource = isStructure ? (item.content || '') : (item.title || '');
    const key = item.bucket + ':' + keySource.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100);

    if (seen.has(key)) {
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
async function writeItem(item, sessionId) {
  const table = BUCKET_TO_TABLE[item.bucket] || 'dev_ai_knowledge';

  // Use item's client_id if already set (from structure extraction), otherwise lookup
  let client_id = item.client_id || null;
  if (!client_id && item.project_id && projectLookup[item.project_id]) {
    client_id = projectLookup[item.project_id].client_id;
  }

  let status = 'active';
  if (table === 'dev_ai_todos') {
    status = 'unassigned';
  } else if (table === 'dev_ai_bugs') {
    status = 'open';
  } else if (['dev_ai_knowledge', 'dev_ai_docs', 'dev_ai_journal', 'dev_ai_decisions', 'dev_ai_lessons'].includes(table)) {
    status = 'pending';
  } else if (['dev_ai_conventions', 'dev_ai_snippets'].includes(table)) {
    status = 'active';
  }

  const baseRecord = {
    client_id: client_id,
    project_id: item.project_id || null,
    bucket: item.bucket,
    keywords: JSON.stringify(item.keywords || []),
    source_session_id: sessionId,
    status: status,
    created_at: new Date().toISOString()
  };

  try {
    if (table === 'dev_ai_todos') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || '').substring(0, 200),
        description: item.content || item.title
      });
    }
    else if (table === 'dev_ai_bugs') {
      // Note: status is set in baseRecord ('open' for bugs)
      // Bugs Fixed bucket gets status 'resolved'
      const bugStatus = item.bucket === 'Bugs Fixed' ? 'resolved' : 'open';
      await db.from(table).insert({
        ...baseRecord,
        status: bugStatus,
        title: (item.title || '').substring(0, 200),
        description: item.content || item.title,
        severity: 'medium'
      });
    }
    else if (table === 'dev_ai_knowledge') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || '').substring(0, 200),
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
        title: (item.title || '').substring(0, 200),
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
        name: (item.title || '').substring(0, 200),
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
        title: (item.title || '').substring(0, 200),
        description: item.content || item.title
      });
    }
    else if (table === 'dev_ai_lessons') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || '').substring(0, 200),
        description: item.content || item.title,
        what_was_tried: item.what_was_tried || item.content || item.title  // Required NOT NULL
      });
    }
    else if (table === 'dev_ai_journal') {
      await db.from(table).insert({
        ...baseRecord,
        title: (item.title || '').substring(0, 200),
        content: item.content || item.title,
        entry_type: item.bucket === 'Work Log' ? 'work_log' : 'journal'
      });
    }

    return true;
  } catch (err) {
    logger.error('Write failed', { table, bucket: item.bucket, error: err.message });
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
    logger.error('Failed to mark processed', { error: err.message });
  }
}

const quickProcess = () => process(10);
const smartProcess = () => process(20);

module.exports = {
  initialize,
  process,
  quickProcess,
  smartProcess,
  extractStructure,
  extractWithClaude,
  deduplicateItems,
  logUsage,
  calculateCost
};
