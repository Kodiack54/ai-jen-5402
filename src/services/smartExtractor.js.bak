/**
 * Smart Extractor - AI-powered extraction
 * Uses OpenAI to deeply understand conversations
 */

const { Logger } = require('../lib/logger');
const config = require('../lib/config');

const logger = new Logger('Jen:SmartExtractor');

/**
 * Extract insights using AI
 */
async function extract(conversationText, options = {}) {
  const { projectPath, previousContext } = options;

  try {
    const prompt = buildExtractionPrompt(conversationText, projectPath, previousContext);
    const response = await callOpenAI(prompt);
    const parsed = parseJsonSafe(response);

    if (parsed) {
      logger.info('Smart extraction successful', {
        workType: parsed.sessionSummary?.workType,
        todos: parsed.todos?.length || 0,
        discoveries: parsed.discoveries?.length || 0
      });
      return parsed;
    }

    logger.warn('Smart extraction returned no data');
    return null;

  } catch (err) {
    logger.error('Smart extraction failed', { error: err.message });
    return null;
  }
}

/**
 * Build the extraction prompt
 */
function buildExtractionPrompt(conversationText, projectPath, previousContext) {
  return `You are Jen, an AI assistant specialized in understanding development conversations.
Your job is to extract MEANINGFUL information that helps the team understand what happened and why.

PROJECT: ${projectPath || 'Unknown'}

${previousContext ? `PREVIOUS SESSION CONTEXT:\n${previousContext}\n` : ''}

CONVERSATION TO ANALYZE:
${conversationText}

EXTRACTION INSTRUCTIONS:
Think deeply about this conversation. Don't just list surface-level items.
Ask yourself:
- What was the developer trying to accomplish? (the goal)
- What problems did they encounter? (the obstacles)
- What solutions were found? (the breakthroughs)
- What decisions were made and WHY? (the reasoning)
- What's still unfinished? (the continuity)

Extract as JSON (MUST be valid JSON with no trailing commas):

{
  "sessionSummary": {
    "workType": "feature|bugfix|refactor|research|config|deployment|planning",
    "mainGoal": "What was the primary objective of this session?",
    "outcome": "success|partial|blocked|ongoing",
    "keyInsight": "The most important thing learned or accomplished"
  },
  "problems": [
    {
      "description": "What went wrong or was challenging",
      "rootCause": "Why it happened (if discovered)",
      "solution": "How it was fixed (if fixed)",
      "status": "fixed|workaround|unresolved",
      "relatedFiles": ["files involved"]
    }
  ],
  "decisions": [
    {
      "what": "The decision made",
      "why": "The reasoning behind it",
      "alternatives": "What other options were considered",
      "impact": "What this affects going forward"
    }
  ],
  "codeChanges": [
    {
      "file": "path/to/file",
      "action": "created|modified|deleted|renamed",
      "purpose": "WHY this change was made",
      "details": "Key changes"
    }
  ],
  "discoveries": [
    {
      "category": "architecture|pattern|gotcha|optimization|security|integration",
      "title": "Short title",
      "insight": "What was learned",
      "applicability": "When this knowledge is useful"
    }
  ],
  "todos": [
    {
      "task": "What needs to be done",
      "context": "Why it's needed",
      "priority": "high|medium|low",
      "blockedBy": "What blocking this if anything",
      "relatedTo": "Related feature or component"
    }
  ],
  "completedItems": [
    {
      "task": "What was finished",
      "verifiedBy": "How we know it is done"
    }
  ],
  "continuity": {
    "inProgress": "What is actively being worked on",
    "nextSteps": ["Logical next actions"],
    "blockers": ["What is preventing progress"],
    "questionsOpen": ["Unanswered questions"]
  }
}

CRITICAL: Return ONLY valid JSON. No markdown, no comments, no trailing commas.`;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt) {
  const apiKey = config.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Clean up JSON response from AI
 */
function cleanJsonResponse(text) {
  let jsonStr = text;

  // Extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = text.slice(start, end + 1);
    }
  }

  // Fix common AI JSON mistakes
  jsonStr = jsonStr
    .replace(/,(\s*[\]\}])/g, '$1')           // Remove trailing commas
    .replace(/\/\/.*$/gm, '')                  // Remove comments
    .replace(/[\x00-\x1F\x7F]/g, ' ')          // Remove control chars
    .replace(/\n/g, ' ')                       // Flatten newlines
    .replace(/\t/g, ' ');                      // Flatten tabs

  return jsonStr.trim();
}

/**
 * Parse JSON with multiple fallback strategies
 */
function parseJsonSafe(text) {
  if (!text) return null;

  // Strategy 1: Direct parse
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    logger.debug('Direct parse failed', { error: e.message });
  }

  // Strategy 2: Clean and parse
  try {
    const cleaned = cleanJsonResponse(text);
    return JSON.parse(cleaned);
  } catch (e) {
    logger.debug('Cleaned parse failed', { error: e.message });
  }

  // Strategy 3: Regex extraction fallback
  try {
    return extractWithRegex(text);
  } catch (e) {
    logger.debug('Regex extraction failed', { error: e.message });
  }

  return null;
}

/**
 * Extract data using regex as last resort
 */
function extractWithRegex(text) {
  const result = {
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

  // Extract todos
  const todoMatches = [...text.matchAll(/"task"\s*:\s*"([^"]+)"/g)];
  for (const match of todoMatches) {
    if (match[1].length > 5 && match[1].length < 200) {
      result.todos.push({ task: match[1], priority: 'medium', context: '' });
    }
  }

  // Extract discoveries
  const insightMatches = [...text.matchAll(/"insight"\s*:\s*"([^"]+)"/g)];
  const titleMatches = [...text.matchAll(/"title"\s*:\s*"([^"]+)"/g)];
  for (let i = 0; i < insightMatches.length; i++) {
    result.discoveries.push({
      title: titleMatches[i]?.[1] || 'Discovery',
      insight: insightMatches[i][1],
      category: 'general'
    });
  }

  // Extract main goal
  const goalMatch = text.match(/"mainGoal"\s*:\s*"([^"]+)"/);
  if (goalMatch) result.sessionSummary.mainGoal = goalMatch[1];

  // Extract key insight
  const keyMatch = text.match(/"keyInsight"\s*:\s*"([^"]+)"/);
  if (keyMatch) result.sessionSummary.keyInsight = keyMatch[1];

  // Extract work type
  const typeMatch = text.match(/"workType"\s*:\s*"([^"]+)"/);
  if (typeMatch) result.sessionSummary.workType = typeMatch[1];

  const hasData = result.todos.length > 0 ||
                  result.discoveries.length > 0 ||
                  result.sessionSummary.mainGoal;

  return hasData ? result : null;
}

module.exports = {
  extract,
  buildExtractionPrompt,
  parseJsonSafe,
  cleanJsonResponse
};
