/**
 * Jen Processor Service
 * The brain of Jen - all pattern recognition, AI extraction, and validation
 * Supports BOTH legacy format AND new 20-bucket format
 */

const { Logger } = require('../lib/logger');
const db = require('../lib/db');
const config = require('../lib/config');
const patternExtractor = require('./patternExtractor');
const smartExtractor = require('./smartExtractor');
const smartPatterns = require('./smartPatterns');
const validator = require('./validator');
const susanClient = require('./susanClient');

const logger = new Logger('Jen:Processor');

/**
 * Initialize the processor
 */
async function initialize() {
  logger.info('Processor initialized');
  return true;
}

/**
 * Quick process - pattern matching only, no AI
 * Runs frequently to catch obvious patterns quickly
 */
async function quickProcess(batchSize = 50) {
  let processed = 0;
  let errors = 0;

  try {
    const { data: messages, error } = await db.from('dev_ai_staging')
      .select('*')
      .eq('processed', false)
      .order('captured_at', { ascending: true })
      .limit(batchSize);

    if (error) throw error;
    if (!messages || messages.length === 0) {
      return { processed: 0, errors: 0 };
    }

    const sessionGroups = groupBySession(messages);

    for (const [sessionId, sessionMessages] of Object.entries(sessionGroups)) {
      try {
        const patterns = patternExtractor.extract(sessionMessages);

        if (patterns.hasData) {
          await susanClient.sendQuickPatterns(sessionId, sessionMessages[0].project_path, patterns);
        }

        const ids = sessionMessages.map(m => m.id);
        await markProcessed(ids, 'quick');
        processed += sessionMessages.length;

      } catch (err) {
        logger.error('Quick process session failed', { sessionId, error: err.message });
        errors++;
      }
    }

  } catch (err) {
    logger.error('Quick process batch failed', { error: err.message });
    errors++;
  }

  return { processed, errors };
}

/**
 * Smart process - AI extraction
 * Runs less frequently for deep analysis
 */
async function smartProcess(batchSize = 50) {
  let processed = 0;
  let errors = 0;

  try {
    const { data: sessions, error } = await db.from('dev_ai_sessions')
      .select('id, project_path, started_at')
      .in('status', ['active', 'completed'])
      .eq('terminal_port', config.TERMINAL_PORT || 5400)
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      return { processed: 0, errors: 0 };
    }

    for (const session of sessions) {
      try {
        const { data: messages } = await db.from('dev_ai_staging')
          .select('*')
          .eq('session_id', session.id)
          .order('captured_at', { ascending: true });

        if (!messages || messages.length < config.MIN_MESSAGES_FOR_SMART) {
          continue;
        }

        const conversationText = messages
          .map(m => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n')
          .slice(0, config.MAX_CONVERSATION_LENGTH);

        const previousContext = await getPreviousContext(session.project_path);

        // Try FREE pattern extraction first
    const patternResult = smartPatterns.extract(messages);
    
    // If patterns found enough, use that (FREE)
    if (patternResult.items && patternResult.items.length >= 2) {
      logger.info('Using pattern extraction (FREE)', { sessionId: session.id,
        itemCount: patternResult.items.length 
      });
      const validated = validator.validateExtraction(patternResult);
      const susanData = validator.toSusanFormat(validated);
      await susanClient.sendExtraction(session.id, session.project_path, susanData);
      await storeSmartExtraction(session.id, patternResult, session.project_path);
      continue;
    }
    
    // Only call AI if patterns didn't find much (COSTS MONEY)
    logger.info('Falling back to AI extraction', { sessionId: session.id });
    const extraction = await smartExtractor.extract(conversationText, {
          projectPath: session.project_path,
          previousContext
        });

        if (extraction) {
          // Validate extraction (handles both formats)
          const validated = validator.validateExtraction(extraction);

          // Convert to Susan format
          const susanData = validator.toSusanFormat(validated);

          // Send to Susan
          await susanClient.sendExtraction(session.id, session.project_path, susanData);

          // Store smart extraction with bucket support
          await storeSmartExtraction(session.id, validated, session.project_path);

          processed++;
        }

      } catch (err) {
        logger.error("Smart process session failed", { sessionId: session.id, error: err.message });
        errors++;
      }
    }

  } catch (err) {
    logger.error('Smart process batch failed', { error: err.message });
    errors++;
  }

  return { processed, errors };
}

/**
 * Group messages by session ID
 */
function groupBySession(messages) {
  const groups = {};
  for (const msg of messages) {
    const key = msg.session_id || 'no-session';
    if (!groups[key]) groups[key] = [];
    groups[key].push(msg);
  }
  return groups;
}

/**
 * Mark messages as processed
 */
async function markProcessed(ids, processedBy) {
  try {
    for (const id of ids) {
      await db.from('dev_ai_staging')
        .update({ 
          processed: true, 
          processed_at: new Date().toISOString(),
          processed_by: processedBy
        })
        .eq('id', id);
    }
  } catch (err) {
    logger.error('Failed to mark processed', { error: err.message });
  }
}

/**
 * Get previous context for continuity
 */
async function getPreviousContext(projectPath) {
  try {
    const { data } = await db.from('dev_ai_smart_extractions')
      .select('continuity, session_summary')
      .eq('project_path', projectPath)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      const summary = data[0].session_summary;
      const continuity = data[0].continuity;
      return `Previous: ${summary?.mainGoal || 'Unknown'}\nIn progress: ${continuity?.inProgress || 'None'}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Store smart extraction - handles BOTH legacy and 20-bucket formats
 */
async function storeSmartExtraction(sessionId, extraction, projectPath) {
  try {
    // NEW FORMAT: items array with bucket field
    if (extraction.format === 'bucket' && extraction.items && Array.isArray(extraction.items)) {
      for (const item of extraction.items) {
        await db.from('dev_ai_smart_extractions').insert({
          session_id: sessionId,
          project_path: projectPath,
          bucket: item.bucket,
          category: item.bucket,  // Also store as category for backwards compat
          title: item.title,
          content: item.content || item.title,
          priority: 'medium',
          metadata: JSON.stringify({
            confidence: item.confidence,
            keywords: item.keywords,
            relatedFiles: item.relatedFiles,
            products: item.products || []  // ADDED: products for content-based routing
          }),
          status: 'pending',
          created_at: new Date().toISOString()
        });
      }
      
      logger.info('Stored bucket items', { 
        sessionId,
        count: extraction.items.length,
        buckets: [...new Set(extraction.items.map(i => i.bucket))]
      });
      return;
    }

    // LEGACY FORMAT: sessionSummary, problems, decisions, etc.
    await db.from('dev_ai_smart_extractions').insert({
      session_id: sessionId,
      project_path: extraction.sessionSummary?.projectPath || projectPath,
      session_summary: JSON.stringify(extraction.sessionSummary),
      continuity: JSON.stringify(extraction.continuity),
      problems: JSON.stringify(extraction.problems || []),
      decisions: JSON.stringify(extraction.decisions || []),
      discoveries: JSON.stringify(extraction.discoveries || []),
      dependencies: JSON.stringify(extraction.dependencies || []),
      status: 'pending',
      created_at: new Date().toISOString()
    });
    
    logger.debug('Stored legacy extraction', { sessionId });
  } catch (err) {
    logger.debug('Could not store smart extraction', { error: err.message });
  }
}

module.exports = {
  initialize,
  quickProcess,
  smartProcess
};
