/**
 * Validator Service
 * All validation filters and format conversion
 * Supports both legacy format AND new 20-bucket format
 */

const { Logger } = require('../lib/logger');
const { isGarbage } = require('./patternExtractor');

const logger = new Logger('Jen:Validator');

// The 20 valid buckets for new format
const VALID_BUCKETS = [
  'Bugs Open', 'Bugs Fixed', 'Todos', 'Journal', 'Work Log', 'Ideas',
  'Decisions', 'Lessons', 'System Breakdown', 'How-To Guide', 'Schematic',
  'Reference', 'Naming Conventions', 'File Structure', 'Database Patterns',
  'API Patterns', 'Component Patterns', 'Quirks & Gotchas', 'Snippets', 'Other'
];

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
 * Check if text matches garbage patterns
 */
function isGarbageText(text) {
  if (!text || typeof text !== 'string') return true;
  if (text.length < 5 || text.length > 2000) return true;
  
  const trimmed = text.trim();
  if (!trimmed) return true;

  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < 5) return true;

  const specialCount = (trimmed.match(/[^a-zA-Z0-9\s]/g) || []).length;
  if (specialCount > trimmed.length * 0.4) return true;

  return false;
}

/**
 * Validate a todo task
 */
function isValidTodo(task) {
  if (!task || typeof task !== 'string') return false;
  if (task.length < 5 || task.length > 200) return false;
  
  const trimmed = task.trim();
  if (!trimmed) return false;

  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      logger.debug('Todo rejected by pattern', { task: trimmed.slice(0, 50), pattern: pattern.toString() });
      return false;
    }
  }

  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (alphaCount < 5) return false;

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
 * Validate a bucket item (NEW 20-bucket format)
 */
function isValidBucketItem(item) {
  if (!item) return false;
  
  // Must have valid bucket
  if (!item.bucket || !VALID_BUCKETS.includes(item.bucket)) {
    logger.debug('Invalid bucket', { bucket: item.bucket });
    return false;
  }
  
  // Must have title
  if (!item.title || item.title.length < 3) return false;
  
  // Check for garbage
  if (isGarbageText(item.title)) {
    logger.debug('Bucket item title is garbage', { title: item.title?.slice(0, 50) });
    return false;
  }
  
  // Content can be empty for some buckets, but if present check it
  if (item.content && isGarbageText(item.content)) {
    logger.debug('Bucket item content is garbage', { content: item.content?.slice(0, 50) });
    return false;
  }
  
  return true;
}

/**
 * Validate and normalize extraction output
 * Handles BOTH legacy format AND new 20-bucket format
 */
function validateExtraction(data) {
  if (!data) return getEmptyExtraction();

  // NEW FORMAT: Check if data has 'items' array with bucket field
  if (data.items && Array.isArray(data.items)) {
    return validateBucketExtraction(data);
  }

  // LEGACY FORMAT: problems, decisions, todos, discoveries etc
  return validateLegacyExtraction(data);
}

/**
 * Validate NEW 20-bucket format extraction
 */
function validateBucketExtraction(data) {
  const validItems = (data.items || []).filter(isValidBucketItem);
  
  // Log bucket distribution
  const bucketCounts = {};
  validItems.forEach(item => {
    bucketCounts[item.bucket] = (bucketCounts[item.bucket] || 0) + 1;
  });
  
  logger.info('Validation complete (20-bucket format)', {
    itemsIn: data.items?.length || 0,
    itemsOut: validItems.length,
    buckets: bucketCounts,
    newKeywords: data.newKeywords?.length || 0
  });

  return {
    format: 'bucket',  // Flag to indicate new format
    items: validItems,
    sessionSummary: data.sessionSummary || null,
    newKeywords: data.newKeywords || []
  };
}

/**
 * Validate LEGACY format extraction
 */
function validateLegacyExtraction(data) {
  const validated = {
    format: 'legacy',  // Flag to indicate legacy format
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

  logger.info('Validation complete (legacy format)', {
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
    format: 'legacy',
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
 * Handles BOTH legacy and new 20-bucket formats
 */
function toSusanFormat(data) {
  // NEW FORMAT: 20-bucket items - convert to legacy format for Susan
  if (data.format === 'bucket' || (data.items && Array.isArray(data.items))) {
    const todos = [];
    const knowledge = [];
    const bugs = [];
    const decisions = [];
    
    for (const item of (data.items || [])) {
      const entry = {
        title: item.title,
        content: item.content || item.title,
        bucket: item.bucket
      };
      
      switch (item.bucket) {
        case 'Todos':
          todos.push({ title: item.title, description: item.content || '', priority: 'medium' });
          break;
        case 'Bugs Open':
          bugs.push({ title: item.title, severity: 'medium', status: 'open' });
          break;
        case 'Decisions':
          decisions.push({ title: item.title, rationale: item.content || '' });
          break;
        case 'Work Log':
        case 'Journal':
        case 'Lessons':
        case 'Reference':
        case 'How-To Guide':
        case 'Snippets':
        case 'File Structure':
          knowledge.push({ category: item.bucket, title: item.title, summary: item.content || item.title });
          break;
        default:
          knowledge.push({ category: item.bucket || 'general', title: item.title, summary: item.content || item.title });
      }
    }
    
    return {
      format: 'legacy',
      todos,
      completedTodos: [],
      decisions,
      knowledge,
      bugs,
      codeChanges: [],
      sessionSummary: data.sessionSummary,
      continuity: data.continuity,
      dependencies: []
    };
  }

  // LEGACY FORMAT (unchanged)
  return {
    format: 'legacy',
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
  isValidBucketItem,
  isGarbageText,
  validateExtraction,
  validateBucketExtraction,
  validateLegacyExtraction,
  toSusanFormat,
  getEmptyExtraction,
  GARBAGE_PATTERNS,
  VALID_BUCKETS
};
