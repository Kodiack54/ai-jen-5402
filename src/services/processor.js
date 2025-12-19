/**
 * Jen Processor Service
 * The brain of Jen - all pattern recognition, AI extraction, and validation
 */

const { Logger } = require('../lib/logger');
const db = require('../lib/db');
const config = require('../lib/config');
const patternExtractor = require('./patternExtractor');
const smartExtractor = require('./smartExtractor');
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
    // Get unprocessed messages from staging
    const { data: messages, error } = await db.from('dev_ai_staging')
      .select('*')
      .eq('processed', false)
      .order('captured_at', { ascending: true })
      .limit(batchSize);

    if (error) throw error;
    if (!messages || messages.length === 0) {
      return { processed: 0, errors: 0 };
    }

    // Group messages by session
    const sessionGroups = groupBySession(messages);

    for (const [sessionId, sessionMessages] of Object.entries(sessionGroups)) {
      try {
        // Run pattern extraction
        const patterns = patternExtractor.extract(sessionMessages);

        if (patterns.hasData) {
          // Send quick patterns to Susan
          await susanClient.sendQuickPatterns(sessionId, sessionMessages[0].project_path, patterns);
        }

        // Mark as processed (quick parse done)
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
    // Get messages that need SMART processing
    // Look for sessions with enough messages
    const { data: sessions, error } = await db.from('dev_ai_sessions')
      .select('id, project_path, started_at')
      .in('status', ['active', 'completed'])
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      return { processed: 0, errors: 0 };
    }

    for (const session of sessions) {
      try {
        // Get messages for this session from staging
        const { data: messages } = await db.from('dev_ai_staging')
          .select('*')
          .eq('session_id', session.id)
          .order('captured_at', { ascending: true });

        if (!messages || messages.length < config.MIN_MESSAGES_FOR_SMART) {
          continue;
        }

        // Build conversation text
        const conversationText = messages
          .map(m => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n')
          .slice(0, config.MAX_CONVERSATION_LENGTH);

        // Get previous context
        const previousContext = await getPreviousContext(session.project_path);

        // Run SMART extraction
        const extraction = await smartExtractor.extract(conversationText, {
          projectPath: session.project_path,
          previousContext
        });

        if (extraction) {
          // Validate extraction
          const validated = validator.validateExtraction(extraction);

          // Convert to Susan format
          const susanData = validator.toSusanFormat(validated);

          // Send to Susan
          await susanClient.sendExtraction(session.id, session.project_path, susanData);

          // Store smart extraction
          await storeSmartExtraction(session.id, validated);

          processed++;
        }

      } catch (err) {
        logger.error('Smart process session failed', { sessionId: session.id, error: err.message });
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
 * Store smart extraction
 */
async function storeSmartExtraction(sessionId, extraction) {
  try {
    await db.from('dev_ai_smart_extractions').insert({
      session_id: sessionId,
      project_path: extraction.sessionSummary?.projectPath,
      session_summary: JSON.stringify(extraction.sessionSummary),
      continuity: JSON.stringify(extraction.continuity),
      problems: JSON.stringify(extraction.problems || []),
      decisions: JSON.stringify(extraction.decisions || []),
      discoveries: JSON.stringify(extraction.discoveries || []),
      dependencies: JSON.stringify(extraction.dependencies || []),
      created_at: new Date().toISOString()
    });
  } catch (err) {
    logger.debug('Could not store smart extraction', { error: err.message });
  }
}

module.exports = {
  initialize,
  quickProcess,
  smartProcess
};
