/**
 * Smart Extractor - AI-powered extraction with 20 bucket categories
 * Uses OpenAI to deeply understand conversations and flag items
 *
 * v2.0: Added NextBid product family awareness for business/architecture discussions
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

// NextBid Product Family - for intelligent tagging
const PRODUCT_FAMILY = {
  'NextBid': {
    description: 'Government procurement platform for SERVICES (20+ tradelines)',
    keywords: ['nextbid', 'services', 'tradeline', 'procurement', 'service contract']
  },
  'NextBidder': {
    description: 'Government procurement platform for GOODS (auction-style)',
    keywords: ['nextbidder', 'auction', 'goods', 'bidding', 'bid on items']
  },
  'NextBid Sources': {
    description: 'Puppeteer scrapers for discovering government entity sources (350+ in CA alone)',
    keywords: ['sources', 'scraper', 'puppeteer', 'entity', 'authenticate', 'discovery']
  },
  'NextBid Portals': {
    description: 'User interface - CRM, Dispatch, Accounting, AI Proposals, Opportunity Matching',
    keywords: ['portal', 'crm', 'dispatch', 'accounting', 'proposal', 'opportunity', 'user interface']
  },
  'NextTech': {
    description: 'Field worker mobile app - clock in/out, view jobs, close work orders',
    keywords: ['nexttech', 'field worker', 'mobile app', 'clock in', 'work order', 'dispatch']
  },
  'NextTask': {
    description: 'Gamification layer - quests for data entry that feed the AI proposal engine',
    keywords: ['nexttask', 'quest', 'gamification', 'points', 'game', 'upload invoice', 'competitor bid']
  }
};

/**
 * Extract insights using AI with 20 bucket categories
 */
async function extract(conversationText, options = {}) {
  const { projectPath, previousContext } = options;

  try {
    const prompt = buildExtractionPrompt(conversationText, projectPath, previousContext);
    const response = await callOpenAI(prompt);
    const parsed = parseJsonSafe(response);

    if (parsed) {
      // Mark as new bucket format so processor uses 20-bucket storage
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

      logger.info('Smart extraction successful', {
        itemCount: parsed.items?.length || 0,
        buckets: [...new Set(parsed.items?.map(i => i.bucket) || [])],
        products: [...new Set(parsed.items?.flatMap(i => i.products || []) || [])],
        newKeywords: parsed.newKeywords?.length || 0
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
 * Build the extraction prompt with 20 bucket categories and product awareness
 */
function buildExtractionPrompt(conversationText, projectPath, previousContext) {
  return `You are Jen, an AI assistant that extracts and categorizes development session content.

PROJECT: ${projectPath || 'Unknown'}

## BRAINSTORMING & NEW PROJECT IDEASWhen Michael mentions potential NEW projects (not NextBid family):- Travel app, finance app, other client projects, side projects- Flag as "Ideas" with keywords: ["new-project", "brainstorm", "potential"]- These are VALUABLE - capture the concept even if vague- Tag with product name if mentioned (e.g., "Travel App", "Finance App")## PRODUCT FAMILY KNOWLEDGE
You work at Kodiack Studios which builds the NextBid ecosystem for government procurement:

**NextBid** - Platform for government SERVICE contracts (20+ tradelines like plumbing, electrical, HVAC)
**NextBidder** - Platform for government GOODS contracts (auction-style bidding on physical items)
**NextBid Sources** - Puppeteer scrapers that discover/authenticate government entity sources (350+ in CA)
**NextBid Portals** - User interface: CRM, Dispatch, Accounting, AI-powered proposal writing
**NextTech** - Field worker mobile app: clock in/out, view jobs, close work orders
**NextTask** - Gamification layer that turns data entry into quests that feed the AI proposal engine

When conversations discuss these products, their architecture, business model, or design:
- Flag as "System Breakdown" or "Ideas" - NOT Work Log
- Tag the specific product(s) in the keywords
- These are HIGH VALUE knowledge items

${previousContext ? `PREVIOUS SESSION CONTEXT:\n${previousContext}\n` : ''}

CONVERSATION TO ANALYZE:
${conversationText}

FLAG each extracted item with ONE of these 20 bucket categories:
- Bugs Open (ONLY actual software bugs with error messages/stack traces)
- Bugs Fixed (problems solved in this session)
- Todos (tasks to do later, next steps)
- Journal (session narrative, what happened)
- Work Log (what was accomplished - technical tasks)
- Ideas (suggestions, potential improvements, brainstorms)
- Decisions (choices made and why)
- Lessons (things learned, insights)
- System Breakdown (architecture explanations, how systems work, PRODUCT DESIGN DISCUSSIONS)
- How-To Guide (step-by-step instructions)
- Schematic (diagrams, flows, visual explanations)
- Reference (useful info to look up later)
- Naming Conventions (naming patterns, rules)
- File Structure (folder organization)
- Database Patterns (DB schema, queries)
- API Patterns (endpoint patterns)
- Component Patterns (UI component patterns)
- Quirks & Gotchas (weird behaviors, gotchas)
- Snippets (useful code snippets)
- Other (doesn't fit elsewhere)

Extract as JSON (MUST be valid JSON):
{
  "items": [
    {
      "bucket": "ONE_OF_THE_20_BUCKETS",
      "title": "Short title (max 100 chars)",
      "content": "The actual content/description",
      "confidence": 0.0-1.0,
      "keywords": ["relevant", "keywords"],
      "products": ["NextBid", "NextTask"],
      "relatedFiles": ["file/paths/if/any.js"]
    }
  ],
  "sessionSummary": {
    "mainGoal": "What was the session about",
    "outcome": "success|partial|blocked|ongoing",
    "keyTakeaway": "Most important thing"
  },
  "newKeywords": ["new_terms", "discovered_that_should_be_learned"]
}

CRITICAL CATEGORIZATION RULES:
1. PRODUCT DISCUSSIONS = System Breakdown or Ideas (NOT Work Log)
   - "NextBid is for services, NextBidder is for goods" = System Breakdown
   - "We could add gamification to get users to enter data" = Ideas
   - "I want to build a flywheel effect" = System Breakdown or Ideas

2. BUSINESS/ARCHITECTURE explanations are HIGH VALUE - extract them fully
   - How products connect to each other
   - Why systems are designed a certain way
   - User flows, data flows, business logic

3. Work Log is for TECHNICAL TASKS only:
   - "Fixed the bug in line 42"
   - "Updated the database schema"
   - "Ran npm install"

4. Tag WHICH PRODUCT is being discussed in the "products" array
5. THE FORGE FALLBACK - When you cannot clearly categorize a topic:   - If it is a vague idea, concept, or brainstorm - use "Ideas" bucket   - Add "forge" to the keywords array   - These go to The Forge where ideas are heated, shaped, discarded, reforged   - Better to capture vaguely than to miss potential value   - Examples: random app ideas, game concepts, half-baked thoughts, feature experiments

5. If someone explains how a product works, that's System Breakdown with confidence 0.9+

RULES:
- Only extract MEANINGFUL items, skip noise/garbage
- Each item gets exactly ONE bucket from the list above
- Use high confidence (0.8+) when clear, lower when uncertain
- Extract product names in the products array when relevant
- If no meaningful content, return {"items": [], "sessionSummary": null, "newKeywords": []}`;
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
        { role: 'system', content: 'You are Jen, an AI that extracts and categorizes development session content. You have deep knowledge of the NextBid product family. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
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
    // Try direct parse first
    return JSON.parse(response);
  } catch (e) {
    logger.debug('Direct parse failed, trying cleanup', { error: e.message });
  }

  // Try to extract JSON from markdown code blocks
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      logger.debug('Markdown JSON parse failed', { error: e.message });
    }
  }

  // Try to find JSON object in response
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (e) {
      logger.debug('Object extraction failed', { error: e.message });
    }
  }

  return null;
}

/**
 * Clean JSON response (remove trailing commas, etc.)
 */
function cleanJsonResponse(str) {
  return str
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim();
}

/**
 * Detect which products are mentioned in text
 */
function detectProducts(text) {
  const mentioned = [];
  const textLower = text.toLowerCase();

  for (const [product, info] of Object.entries(PRODUCT_FAMILY)) {
    for (const keyword of info.keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        if (!mentioned.includes(product)) {
          mentioned.push(product);
        }
        break;
      }
    }
  }

  return mentioned;
}

module.exports = {
  extract,
  buildExtractionPrompt,
  parseJsonSafe,
  cleanJsonResponse,
  detectProducts,
  BUCKETS,
  PRODUCT_FAMILY
};

// Potential new project keywords - for brainstorming capture
const NEW_PROJECT_SIGNALS = [
  'app idea', 'new project', 'thinking about building', 'could build',
  'potential app', 'side project', 'another company', 'new client',
  'travel app', 'finance app', 'i have planned', 'want to build',
  'brainstorm', 'what if we', 'could create', 'might build'
];
