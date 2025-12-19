/**
 * Validator Service
 * All validation filters and format conversion
 */

const { Logger } = require('../lib/logger');
const { isGarbage } = require('./patternExtractor');

const logger = new Logger('Jen:Validator');

/**
 * Garbage patterns for todo validation
 */
const GARBAGE_PATTERNS = [
  /\|/,                        // Table output
  /\{[^}]*$/,                  // Unclosed JSON
  /^[^{]*\}/,                  // Partial JSON end
  /\\"/,                       // Escaped quotes
  /"description":/,            // JSON field names
  /"status":/,
  /"created_at":/,
  /"server_path":/,
  /\[\d+\]/,                   // Array indices
  /match\[/,                   // Code
  /^\s*[\)\]\}\,\;]/,          // Starts with closing syntax
  /^\s*[a-f0-9-]{36}/i,        // UUID
  /sort_order/i,
  /completed_at/i,
  /External Claude/,           // Terminal markers
  /\x1b\[/,                    // ANSI codes
  /^\d+\|\w+/,                 // PM2 log prefix
  /^root@/,                    // Shell prompt
  /module\.exports/,           // Code
  /require\(/,                 // Code
  /function\s*\(/,             // Code
  /=>/,                        // Arrow functions
  /console\./,                 // Console calls
  /^\s*\/\//,                  // Comments
  /^\s*\*/,                    // Comment lines
  /localhost:/,                // URLs
  /127\.0\.0\.1/,              // IPs
  /\.(js|ts|json):/,           // File:line references
  /npm ERR/,                   // npm errors
  /WARN\s+/,                   // Log warnings
  /INFO\s+/,                   // Log info
  /DEBUG\s+/,                  // Log debug
  /^\s*at\s+/,                 // Stack traces
  /node_modules/,              // Node paths
  /webpack/i,                  // Build tools
  /rollup/i,
  /vite/i
];

/**
 * Validate a todo task
 */
function isValidTodo(task) {
  if (!task || typeof task !== 'string') return false;
  if (task.length < 5 || task.length > 200) return false;
  
  const trimmed = task.trim();
  if (!trimmed) return false;

  // Check against garbage patterns
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Todo rejected by pattern', { task: trimmed.slice(0, 50), pattern: pattern.toString() });
      return false;
    }
  }

  // Must have at least some alphabetic content
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < 5) return false;

  // Shouldn't be mostly special characters
  const specialCount = (trimmed.match(/[^a-zA-Z0-9\s]/g) || []).length;
  if (specialCount > trimmed.length * 0.3) return false;

  return true;
}

/**
 * Validate a discovery/knowledge item
 */
function isValidDiscovery(discovery) {
  if (!discovery) return false;
  
  const title = discovery.title || '';
  const insight = discovery.insight || '';
  
  if (title.length < 3 || insight.length < 10) return false;
  if (isGarbage(title) || isGarbage(insight)) return false;
  
  return true;
}

/**
 * Validate a problem/bug
 */
function isValidProblem(problem) {
  if (!problem) return false;
  
  const desc = problem.description || '';
  if (desc.length < 10) return false;
  if (isGarbage(desc)) return false;
  
  return true;
}

/**
 * Validate a decision
 */
function isValidDecision(decision) {
  if (!decision) return false;
  
  const what = decision.what || '';
  if (what.length < 5) return false;
  if (isGarbage(what)) return false;
  
  return true;
}

/**
 * Validate and normalize extraction output
 */
function validateExtraction(data) {
  if (!data) return getEmptyExtraction();

  const validated = {
    sessionSummary: {
      workType: data.sessionSummary?.workType || 'unknown',
      mainGoal: data.sessionSummary?.mainGoal || '',
      outcome: data.sessionSummary?.outcome || 'ongoing',
      keyInsight: data.sessionSummary?.keyInsight || ''
    },
    problems: (data.problems || []).filter(isValidProblem),
    decisions: (data.decisions || []).filter(isValidDecision),
    codeChanges: data.codeChanges || [],
    discoveries: (data.discoveries || []).filter(isValidDiscovery),
    todos: (data.todos || []).filter(t => isValidTodo(t.task)),
    completedItems: data.completedItems || [],
    dependencies: data.dependencies || [],
    continuity: {
      inProgress: data.continuity?.inProgress || '',
      nextSteps: data.continuity?.nextSteps || [],
      blockers: data.continuity?.blockers || [],
      questionsOpen: data.continuity?.questionsOpen || []
    }
  };

  logger.info('Validation complete', {
    todosIn: data.todos?.length || 0,
    todosOut: validated.todos.length,
    discoveriesIn: data.discoveries?.length || 0,
    discoveriesOut: validated.discoveries.length
  });

  return validated;
}

/**
 * Get empty extraction structure
 */
function getEmptyExtraction() {
  return {
    sessionSummary: { workType: 'unknown', mainGoal: '', outcome: 'ongoing', keyInsight: '' },
    problems: [],
    decisions: [],
    codeChanges: [],
    discoveries: [],
    todos: [],
    completedItems: [],
    dependencies: [],
    continuity: { inProgress: '', nextSteps: [], blockers: [], questionsOpen: [] }
  };
}

/**
 * Convert to Susan's expected format
 */
function toSusanFormat(data) {
  return {
    todos: (data.todos || []).map(t => ({
      title: t.task,
      description: t.context || '',
      priority: t.priority || 'medium',
      blockedBy: t.blockedBy || null,
      relatedTo: t.relatedTo || null
    })),

    completedTodos: (data.completedItems || []).map(c => ({
      title: c.task,
      verifiedBy: c.verifiedBy || ''
    })),

    decisions: (data.decisions || []).map(d => ({
      title: d.what,
      rationale: d.why || '',
      alternatives: d.alternatives || '',
      impact: d.impact || ''
    })),

    knowledge: (data.discoveries || []).map(d => ({
      category: d.category || 'general',
      title: d.title,
      summary: d.insight,
      applicability: d.applicability || ''
    })),

    codeChanges: data.codeChanges || [],

    bugs: (data.problems || []).filter(p => p.status !== 'fixed').map(p => ({
      title: p.description,
      severity: 'medium',
      status: p.status === 'unresolved' ? 'open' : 'in_progress',
      rootCause: p.rootCause || '',
      relatedFiles: p.relatedFiles || []
    })),

    sessionSummary: data.sessionSummary,
    continuity: data.continuity,
    dependencies: data.dependencies || []
  };
}

module.exports = {
  isValidTodo,
  isValidDiscovery,
  isValidProblem,
  isValidDecision,
  validateExtraction,
  toSusanFormat,
  getEmptyExtraction,
  GARBAGE_PATTERNS
};
