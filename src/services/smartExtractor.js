/**
 * Smart Extractor v3.0 - Contextual Extraction with Substance
 *
 * KEY PRINCIPLES:
 * 1. Process FULL conversation as one unit
 * 2. Extract DISTINCT, SYNTHESIZED items - NOT fragments
 * 3. Require WHO/WHAT/WHY context for substance items
 * 4. Deduplicate - multiple mentions = ONE item
 * 5. Quality over quantity
 */

const { Logger } = require('../lib/logger');
const config = require('../lib/config');

const logger = new Logger('Jen:SmartExtractor');

// The 20 bucket categories
const BUCKETS = [
  'Bugs Open', 'Bugs Fixed', 'Todos', 'Journal', 'Work Log', 'Ideas',
  'Decisions', 'Lessons', 'System Breakdown', 'How-To Guide', 'Schematic',
  'Reference', 'Naming Conventions', 'File Structure', 'Database Patterns',
  'API Patterns', 'Component Patterns', 'Quirks & Gotchas', 'Snippets', 'Other'
];

// Structure buckets - can be literal pass-through from code blocks
const STRUCTURE_BUCKETS = [
  'Database Patterns', 'File Structure', 'API Patterns',
  'Component Patterns', 'Naming Conventions', 'Snippets', 'Schematic'
];

// Substance buckets - require WHO/WHAT/WHY context
const SUBSTANCE_BUCKETS = [
  'Bugs Open', 'Bugs Fixed', 'Todos', 'Ideas', 'Decisions',
  'Lessons', 'System Breakdown', 'How-To Guide', 'Journal',
  'Work Log', 'Reference', 'Quirks & Gotchas', 'Other'
];

/**
 * Extract insights using AI with contextual understanding
 */
async function extract(conversationText, options = {}) {
  const { projectPath, sessionCwd } = options;

  try {
    const prompt = buildExtractionPrompt(conversationText, projectPath, sessionCwd);
    const response = await callOpenAI(prompt);
    const parsed = parseJsonSafe(response);

    if (parsed) {
      parsed.format = 'bucket';

      // Validate buckets
      if (parsed.items) {
        parsed.items = parsed.items.filter(item => {
          if (!BUCKETS.includes(item.bucket)) {
            logger.warn('Invalid bucket, mapping to Other', { bucket: item.bucket });
            item.bucket = 'Other';
          }
          return true;
        });
      }

      logger.info('Contextual extraction complete', {
        itemCount: parsed.items?.length || 0,
        buckets: [...new Set(parsed.items?.map(i => i.bucket) || [])],
        project: parsed.detectedProject || 'unknown'
      });
      return parsed;
    }

    logger.warn('Extraction returned no data');
    return null;

  } catch (err) {
    logger.error('Extraction failed', { error: err.message });
    return null;
  }
}

/**
 * Build contextual extraction prompt
 */
function buildExtractionPrompt(conversationText, projectPath, sessionCwd) {
  const cwd = sessionCwd || projectPath || 'Unknown';

  return `You are Jen, an AI that extracts MEANINGFUL, COMPLETE items from development conversations.

SESSION WORKING DIRECTORY: ${cwd}

## CRITICAL: CONTEXTUAL EXTRACTION

You are reading a FULL conversation. Your job is to:
1. UNDERSTAND the conversation as a whole
2. IDENTIFY distinct topics/items discussed
3. SYNTHESIZE complete thoughts from back-and-forth fragments
4. Extract items with FULL CONTEXT

## WHAT NOT TO DO - FRAGMENTS ARE GARBAGE

BAD (fragments - DO NOT extract these):
- "Found it"
- "Error"
- "Fixed"
- "The count was wrong"
- "Need to add caching"

These are USELESS without context. DO NOT extract individual messages.

## WHAT TO DO - SYNTHESIZE COMPLETE ITEMS

Read the FULL conversation. If you see:
"""
USER: The dashboard counts are wrong
ASSISTANT: Looking at the API...
USER: Found it
ASSISTANT: The query was counting all items instead of flagged ones
USER: Fixed it by adding the WHERE clause
"""

Extract ONE complete bug:
{
  "bucket": "Bugs Fixed",
  "title": "Dashboard counts incorrect - API counting all items",
  "content": "The /api/ai-extractions endpoint was counting ALL items instead of just flagged ones. Root cause: missing WHERE status='flagged' clause. Fixed by adding status filter to the query.",
  "project": "kodiack-dashboard"
}

## SUBSTANCE REQUIREMENTS

For Bugs, Todos, Ideas, Lessons, Decisions, How-To Guides:
- WHAT: What is the item about? (specific, not vague)
- WHY: Why does it matter? What problem does it solve?
- CONTEXT: Enough detail that someone else could understand it

If you cannot answer WHAT and WHY with specifics, DO NOT EXTRACT IT.

## STRUCTURE ITEMS (can be more literal)

For Database Patterns, File Structure, API Patterns, Snippets:
- These often come from code blocks
- Can be more literal/direct
- Still need to be complete (not fragments)

## DEDUPLICATION

If the same topic is discussed multiple times, that is ONE item:
- 5 messages about the same bug = 1 bug entry
- 3 mentions of the same todo = 1 todo entry
- Multiple back-and-forth about one idea = 1 idea entry

## PROJECT DETECTION

Look at the conversation context to determine the project:
- File paths mentioned (e.g., /var/www/Studio/ai-team/ai-jen-5402)
- Folder names (kodiack-dashboard, ai-chad, nextbidder)
- System names discussed
- The session working directory: ${cwd}

## THE 20 BUCKETS

- Bugs Open: Active bugs with error details + reproduction steps
- Bugs Fixed: Resolved bugs with problem + cause + solution
- Todos: Tasks to do with WHAT + WHY + WHERE
- Journal: Session narrative (what happened overall)
- Work Log: Technical accomplishments (what was done)
- Ideas: Suggestions with enough context to understand the concept
- Decisions: Choices made with reasoning
- Lessons: Insights learned with the context that led to them
- System Breakdown: Architecture explanations, how systems work
- How-To Guide: Step-by-step instructions (must be complete)
- Schematic: Diagrams, flows, visual structures
- Reference: Useful lookup info
- Naming Conventions: Naming patterns/rules
- File Structure: Folder organization
- Database Patterns: Schema, queries, table structures
- API Patterns: Endpoint patterns
- Component Patterns: UI patterns
- Quirks & Gotchas: Weird behaviors with explanation
- Snippets: Useful code (must be complete, working code)
- Other: Valuable items that do not fit elsewhere

## CONVERSATION TO ANALYZE:

${conversationText}

## EXTRACTION OUTPUT

Return JSON:
{
  "detectedProject": "project-name-from-context",
  "items": [
    {
      "bucket": "ONE_OF_20_BUCKETS",
      "title": "Clear, specific title (max 100 chars)",
      "content": "Complete description with full context. Someone reading this should understand the WHAT and WHY without needing to see the original conversation.",
      "keywords": ["specific", "relevant", "keywords"],
      "confidence": 0.8
    }
  ],
  "sessionSummary": {
    "mainGoal": "What was the session trying to accomplish",
    "outcome": "success or partial or blocked or ongoing",
    "keyItems": 3
  }
}

## QUALITY RULES

1. FEWER is BETTER - 5 quality items beats 50 fragments
2. Each item must be SELF-CONTAINED - understandable on its own
3. NO fragments - if you cannot synthesize a complete thought, skip it
4. DEDUPLICATE - same topic = one item
5. If unsure, DO NOT extract - quality over quantity
6. If no meaningful content, return {"items": [], "detectedProject": null, "sessionSummary": null}`;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt) {
  const apiKey = config.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Jen, an AI that extracts COMPLETE, SYNTHESIZED items from conversations. You NEVER extract fragments. You understand the full context and create items that stand on their own. Quality over quantity. Always respond with valid JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 4000
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
 * Safely parse JSON from AI response
 */
function parseJsonSafe(response) {
  if (!response) return null;

  try {
    return JSON.parse(response);
  } catch (e) {
    logger.debug('Direct parse failed, trying cleanup');
  }

  // Try markdown code block
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) {}
  }

  // Try to find JSON object
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (e) {}
  }

  return null;
}

module.exports = {
  extract,
  buildExtractionPrompt,
  parseJsonSafe,
  BUCKETS,
  STRUCTURE_BUCKETS,
  SUBSTANCE_BUCKETS
};
