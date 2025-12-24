/**
 * Smart Patterns - Regex-based extraction (FREE, no API)
 * Catches 80% of categorization without AI
 */

const { Logger } = require('../lib/logger');
const logger = new Logger('Jen:SmartPatterns');

// File path patterns
const FILE_PATH_PATTERNS = [
  /[A-Z]:\[^\s"'<>|]+/gi,                    // Windows paths
  /[A-Z]:\[^\s"'<>|]+/gi,                       // Windows paths alt
  /\/(?:var|home|usr|etc|www|opt)[\/\w\-\.]+/gi,  // Linux paths
  /\.\/[\w\-\.\/]+/g,                              // Relative paths
  /[\w\-]+\.(?:js|ts|jsx|tsx|json|md|css|html|sql|py|sh)/gi  // Files with extensions
];

// Code snippet patterns
const SNIPPET_PATTERNS = [
  //g,                               // Markdown code blocks
  /\bfunction\s+\w+\s*\([^)]*\)/g,                // Function definitions
  /\bconst\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,  // Arrow functions
  /\bclass\s+\w+/g,                                // Class definitions
  /\bimport\s+.*?from\s+['][^"]+[]/g,         // ES imports
  /\brequire\s*\(['][^"]+[]\)/g               // CommonJS requires
];

// Command patterns
const COMMAND_PATTERNS = [
  /\b(?:npm|yarn|pnpm)\s+(?:run\s+)?\w+/gi,
  /\bgit\s+\w+(?:\s+[\w\-\.\/]+)*/gi,
  /\bpm2\s+\w+/gi,
  /\bcurl\s+[^\n]+/gi,
  /\bssh\s+[^\n]+/gi,
  /\bnode\s+[^\n]+/gi
];

// Decision indicators
const DECISION_WORDS = [
  /\b(?:decided|choosing|went with|picked|selected|using|switched to)\b/gi,
  /\b(?:instead of|rather than|better to|should use|will use)\b/gi,
  /\b(?:the fix|the solution|the approach)\b/gi
];

// Todo indicators  
const TODO_WORDS = [
  /\b(?:TODO|FIXME|HACK|XXX)\b/g,
  /\b(?:need to|should|must|have to|gonna|going to)\s+\w+/gi,
  /\b(?:next step|later|tomorrow|eventually)\b/gi
];

// Journal/casual indicators
const JOURNAL_WORDS = [
  /\b(?:lol|haha|lmao|joke|kidding|funny)\b/gi,
  /\b(?:frustrated|annoying|stupid|dumb|argh|ugh)\b/gi,
  /\b(?:finally|phew|yay|woohoo|nice)\b/gi
];

// Work log indicators
const WORKLOG_WORDS = [
  /\b(?:fixed|updated|changed|modified|created|added|removed|deleted)\b/gi,
  /\b(?:works now|working|done|completed|finished)\b/gi,
  /\b(?:restarted|deployed|pushed|committed)\b/gi
];

// Actual bug indicators (strict)
const BUG_WORDS = [
  /\b(?:TypeError|ReferenceError|SyntaxError|Error):/gi,
  /\bstack trace\b/gi,
  /\bcrash(?:ed|ing|es)?\b/gi,
  /\bexception\b/gi,
  /\bsegfault\b/gi
];

/**
 * Extract and categorize using patterns only (FREE)
 */
function extract(messages) {
  const items = [];
  const fullText = messages.map(m => m.content || '').join('\n');
  
  // Extract file paths → File Structure
  for (const pattern of FILE_PATH_PATTERNS) {
    const matches = fullText.match(pattern) || [];
    matches.forEach(match => {
      if (match.length > 5 && !items.find(i => i.content === match)) {
        items.push({
          bucket: 'File Structure',
          title: 'File path mentioned',
          content: match.trim(),
          confidence: 0.9,
          source: 'pattern'
        });
      }
    });
  }
  
  // Extract code snippets → Snippets
  for (const pattern of SNIPPET_PATTERNS) {
    const matches = fullText.match(pattern) || [];
    matches.slice(0, 5).forEach(match => {
      if (match.length > 20) {
        items.push({
          bucket: 'Snippets',
          title: 'Code snippet',
          content: match.substring(0, 500),
          confidence: 0.95,
          source: 'pattern'
        });
      }
    });
  }
  
  // Extract commands → Reference
  for (const pattern of COMMAND_PATTERNS) {
    const matches = fullText.match(pattern) || [];
    matches.forEach(match => {
      items.push({
        bucket: 'Reference',
        title: 'Command used',
        content: match.trim(),
        confidence: 0.9,
        source: 'pattern'
      });
    });
  }
  
  // Check for decisions
  let decisionCount = 0;
  DECISION_WORDS.forEach(p => {
    decisionCount += (fullText.match(p) || []).length;
  });
  
  // Check for todos
  let todoCount = 0;
  TODO_WORDS.forEach(p => {
    todoCount += (fullText.match(p) || []).length;
  });
  
  // Check for journal/casual
  let journalCount = 0;
  JOURNAL_WORDS.forEach(p => {
    journalCount += (fullText.match(p) || []).length;
  });
  
  // Check for work log
  let worklogCount = 0;
  WORKLOG_WORDS.forEach(p => {
    worklogCount += (fullText.match(p) || []).length;
  });
  
  // Check for actual bugs (strict)
  let bugCount = 0;
  BUG_WORDS.forEach(p => {
    bugCount += (fullText.match(p) || []).length;
  });
  
  // Determine primary category for the batch
  const counts = {
    'Decisions': decisionCount,
    'Todos': todoCount,
    'Journal': journalCount,
    'Work Log': worklogCount,
    'Bugs Open': bugCount
  };
  
  const primary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .filter(([cat, count]) => count > 0)[0];
  
  if (primary && primary[1] > 0) {
    items.push({
      bucket: primary[0],
      title: 'Session activity',
      content: fullText.substring(0, 300),
      confidence: Math.min(0.7 + (primary[1] * 0.05), 0.95),
      source: 'pattern'
    });
  }
  
  logger.info('Pattern extraction complete', {
    itemCount: items.length,
    buckets: [...new Set(items.map(i => i.bucket))],
    counts
  });
  
  return {
    items,
    format: 'bucket',
    patternOnly: true,
    sessionSummary: null,
    newKeywords: []
  };
}

module.exports = { extract };
