/**
 * Susan Client
 * Sends clean processed data to Susan
 */

const { Logger } = require('../lib/logger');
const config = require('../lib/config');

const logger = new Logger('Jen:SusanClient');

const SUSAN_URL = config.SUSAN_URL || 'http://localhost:5403';

/**
 * Send quick patterns to Susan
 */
async function sendQuickPatterns(sessionId, projectPath, patterns) {
  try {
    const response = await fetch(`${SUSAN_URL}/api/quick-parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        projectPath,
        quickData: patterns,
        parsedAt: new Date().toISOString(),
        source: 'jen-5407'
      })
    });

    if (!response.ok) {
      throw new Error(`Susan responded with ${response.status}`);
    }

    logger.debug('Quick patterns sent to Susan', { sessionId, patterns: Object.keys(patterns).length });
    return await response.json();
  } catch (err) {
    logger.warn('Failed to send quick patterns to Susan', { error: err.message });
    return null;
  }
}

/**
 * Send full extraction to Susan
 */
async function sendExtraction(sessionId, projectPath, extraction) {
  try {
    const response = await fetch(`${SUSAN_URL}/api/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        projectPath,
        extraction,
        catalogedAt: new Date().toISOString(),
        source: 'jen-5407'
      })
    });

    if (!response.ok) {
      throw new Error(`Susan responded with ${response.status}`);
    }

    logger.info('Extraction sent to Susan', {
      sessionId,
      todos: extraction.todos?.length || 0,
      knowledge: extraction.knowledge?.length || 0
    });

    return await response.json();
  } catch (err) {
    logger.error('Failed to send extraction to Susan', { error: err.message });
    return null;
  }
}

/**
 * Send individual todo to Susan
 */
async function sendTodo(projectPath, todo) {
  try {
    const response = await fetch(`${SUSAN_URL}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath,
        title: todo.title,
        description: todo.description,
        priority: todo.priority || 'medium',
        source: 'jen-5407'
      })
    });

    if (!response.ok) {
      throw new Error(`Susan responded with ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    logger.warn('Failed to send todo to Susan', { error: err.message, todo: todo.title });
    return null;
  }
}

/**
 * Send knowledge item to Susan
 */
async function sendKnowledge(projectPath, knowledge) {
  try {
    const response = await fetch(`${SUSAN_URL}/api/remember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath,
        title: knowledge.title,
        summary: knowledge.summary,
        category: knowledge.category || 'general',
        importance: 7,
        source: 'jen-5407'
      })
    });

    if (!response.ok) {
      throw new Error(`Susan responded with ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    logger.warn('Failed to send knowledge to Susan', { error: err.message, title: knowledge.title });
    return null;
  }
}

/**
 * Check Susan health
 */
async function checkHealth() {
  try {
    const response = await fetch(`${SUSAN_URL}/health`, { timeout: 5000 });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = {
  sendQuickPatterns,
  sendExtraction,
  sendTodo,
  sendKnowledge,
  checkHealth
};
