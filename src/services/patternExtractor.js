/**
 * Pattern Extractor
 * Quick pattern matching - no AI, just regex
 */

const { Logger } = require('../lib/logger');
const logger = new Logger('Jen:PatternExtractor');

/**
 * Extract all patterns from messages
 */
function extract(messages) {
  const keywords = extractKeywords(messages);
  const files = extractFileMentions(messages);
  const todos = extractTodoMentions(messages);
  const errors = extractErrorMentions(messages);
  const commands = extractCommandMentions(messages);

  return {
    keywords,
    files,
    todos,
    errors,
    commands,
    hasData: keywords.length > 0 || files.length > 0 || todos.length > 0 || errors.length > 0,
    messageCount: messages.length,
    extractedAt: new Date().toISOString()
  };
}

/**
 * Extract keywords - TODO, FIXME, BUG, status words
 */
function extractKeywords(messages) {
  const keywords = new Set();
  const patterns = [
    /\b(TODO|FIXME|BUG|HACK|NOTE|XXX|IMPORTANT)\b/gi,
    /\b(error|warning|failed|success|completed|fixed|broken)\b/gi,
    /\b(created?|modified?|deleted?|updated?|added?|removed?)\b/gi,
    /\b(deployed?|merged?|committed?|pushed?|pulled?)\b/gi
  ];

  for (const msg of messages) {
    const content = msg.content || '';
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      matches.forEach(m => keywords.add(m.toLowerCase()));
    }
  }

  return Array.from(keywords);
}

/**
 * Extract file mentions - paths with extensions
 */
function extractFileMentions(messages) {
  const files = new Set();
  const pattern = /[\w\-\.\/\\]+\.(js|ts|tsx|jsx|json|css|scss|md|py|sql|env|yaml|yml|sh|html|vue|svelte)\b/gi;

  for (const msg of messages) {
    const content = msg.content || '';
    const matches = content.match(pattern) || [];
    matches.forEach(f => {
      // Clean up the path
      const cleaned = f.replace(/^[\.\/\\]+/, '').trim();
      if (cleaned.length > 3) files.add(cleaned);
    });
  }

  return Array.from(files);
}

/**
 * Extract todo mentions - task-like phrases
 */
function extractTodoMentions(messages) {
  const todos = [];
  const patterns = [
    /(?:TODO|TASK|NEED TO|SHOULD|MUST|HAVE TO)[\s:]+([^\n.]{10,100})/gi,
    /(?:next step|next:?|then)[\s:]+([^\n.]{10,100})/gi,
    /(?:don't forget|remember to)[\s:]+([^\n.]{10,100})/gi
  ];

  for (const msg of messages) {
    const content = msg.content || '';
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      while ((match = pattern.exec(content)) !== null) {
        const task = match[1].trim();
        if (isValidTask(task)) {
          todos.push(task);
        }
      }
    }
  }

  return [...new Set(todos)].slice(0, 10);
}

/**
 * Extract error mentions
 */
function extractErrorMentions(messages) {
  const errors = [];
  const patterns = [
    /(?:error|failed|exception|crash)[\s:]+([^\n]{10,150})/gi,
    /(?:cannot|could not|unable to)[\s]+([^\n]{10,100})/gi,
    /(?:TypeError|ReferenceError|SyntaxError|Error)[\s:]+([^\n]{10,150})/gi
  ];

  for (const msg of messages) {
    const content = msg.content || '';
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const error = match[1].trim();
        if (error.length > 10 && !isGarbage(error)) {
          errors.push(error);
        }
      }
    }
  }

  return [...new Set(errors)].slice(0, 5);
}

/**
 * Extract command mentions - CLI commands
 */
function extractCommandMentions(messages) {
  const commands = new Set();
  const patterns = [
    /(?:npm|yarn|pnpm)\s+(run\s+)?\w+/gi,
    /(?:git)\s+\w+/gi,
    /(?:pm2)\s+\w+/gi,
    /(?:psql|postgres|pg_dump)/gi,
    /(?:curl|wget)\s+/gi
  ];

  for (const msg of messages) {
    const content = msg.content || '';
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      matches.forEach(c => commands.add(c.trim()));
    }
  }

  return Array.from(commands).slice(0, 10);
}

/**
 * Check if a task string is valid (not garbage)
 */
function isValidTask(task) {
  if (!task || task.length < 5 || task.length > 200) return false;
  return !isGarbage(task);
}

/**
 * Check if string is garbage (terminal output, JSON, etc.)
 */
function isGarbage(str) {
  const garbagePatterns = [
    /\|/,                        // Table output
    /\{[^}]*$/,                  // Unclosed JSON
    /^[^{]*\}/,                  // Partial JSON end
    /\\"/,                       // Escaped quotes
    /"description":/,            // JSON field names
    /"status":/,
    /"created_at":/,
    /\[\d+\]/,                   // Array indices
    /^\s*[\)\]\}\,\;]/,          // Starts with closing syntax
    /^\s*[a-f0-9-]{36}/i,        // UUID
    /sort_order/i,
    /completed_at/i,
    /External Claude/,           // Terminal markers
    /\x1b\[/,                    // ANSI codes
    /^\d+\|\w+/,                 // PM2 log prefix
    /^root@/,                    // Shell prompt
    /^\s*$/                      // Empty/whitespace
  ];

  for (const pattern of garbagePatterns) {
    if (pattern.test(str)) return true;
  }

  return false;
}

module.exports = {
  extract,
  extractKeywords,
  extractFileMentions,
  extractTodoMentions,
  extractErrorMentions,
  extractCommandMentions,
  isValidTask,
  isGarbage
};
