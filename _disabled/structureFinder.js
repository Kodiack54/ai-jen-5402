/**
 * Structure Finder - OpenAI-powered path/pattern detection
 * Uses GPT-4o-mini (cheap) to find file paths, tables, endpoints
 * Feeds results to structureExtractor regex for final extraction
 * 
 * NO SEMANTIC EXTRACTION - that's Opus's job in real-time
 */

const OpenAI = require('openai');
const { Logger } = require('../lib/logger');

const logger = new Logger('Jen:StructureFinder');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const STRUCTURE_PROMPT = `You are a code structure detector. Your ONLY job is to find and list:

1. FILE PATHS - Any file or folder paths mentioned (Windows or Unix)
2. DATABASE TABLES - Table names from SQL or ORM references  
3. API ENDPOINTS - Routes, URLs, API paths
4. PORT NUMBERS - Any service ports mentioned
5. FUNCTION/CLASS NAMES - Key code identifiers

DO NOT:
- Summarize or explain anything
- Extract ideas, decisions, or lessons
- Add commentary or context
- Make up paths that aren't explicitly in the text

Output as JSON array:
[
  {"type": "file", "value": "path/to/file.ts"},
  {"type": "table", "value": "table_name"},
  {"type": "endpoint", "value": "GET /api/users"},
  {"type": "port", "value": "5402"},
  {"type": "function", "value": "processSession"}
]

Only include items EXPLICITLY mentioned in the conversation. If nothing found, return [].`;

/**
 * Find structure patterns in content using OpenAI
 * Returns raw findings for structureExtractor to process
 */
async function findPatterns(content) {
  if (!content || content.length < 100) {
    return [];
  }

  // Truncate to 30k chars for cost efficiency
  const truncated = content.length > 30000 
    ? content.slice(-30000)  // Use last 30k (most recent)
    : content;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: STRUCTURE_PROMPT },
        { role: 'user', content: truncated }
      ],
      max_tokens: 2000,
      temperature: 0.1  // Low temp for accuracy
    });

    const text = response.choices[0]?.message?.content || '[]';
    
    // Parse JSON response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('No JSON array in response');
      return [];
    }

    const patterns = JSON.parse(jsonMatch[0]);
    
    logger.info('Structure patterns found', { 
      count: patterns.length,
      byType: patterns.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1;
        return acc;
      }, {})
    });

    return patterns;

  } catch (err) {
    logger.error('OpenAI structure find failed', { error: err.message });
    return [];
  }
}

/**
 * Convert AI findings to structure items
 */
function patternsToItems(patterns, sessionPath) {
  const items = [];

  for (const p of patterns) {
    switch (p.type) {
      case 'file':
        items.push({
          bucket: 'File Structure',
          convention_type: 'structure',
          name: p.value.split(/[\/\\]/).pop() || p.value,
          description: p.value,
          keywords: ['file', p.value.split('.').pop()],
          isStructure: true
        });
        break;
        
      case 'table':
        items.push({
          bucket: 'Database Patterns',
          convention_type: 'database',
          name: `Table: ${p.value}`,
          description: `Database table: ${p.value}`,
          keywords: ['table', 'database', p.value],
          isStructure: true
        });
        break;
        
      case 'endpoint':
        items.push({
          bucket: 'API Patterns',
          convention_type: 'api',
          name: p.value,
          description: `API endpoint: ${p.value}`,
          keywords: ['api', 'endpoint', ...p.value.split(/[\s\/]/).filter(Boolean)],
          isStructure: true
        });
        break;
        
      case 'port':
        items.push({
          bucket: 'API Patterns',
          convention_type: 'api',
          name: `Port ${p.value}`,
          description: `Service port: ${p.value}`,
          keywords: ['port', p.value],
          isStructure: true
        });
        break;
        
      case 'function':
        items.push({
          bucket: 'Component Patterns',
          convention_type: 'component',
          name: p.value,
          description: `Function/Class: ${p.value}`,
          keywords: ['function', 'code', p.value],
          isStructure: true
        });
        break;
    }
  }

  return items;
}

/**
 * Main entry - find and convert structure patterns
 */
async function extract(content, sessionPath) {
  const patterns = await findPatterns(content);
  return patternsToItems(patterns, sessionPath);
}

module.exports = {
  findPatterns,
  patternsToItems,
  extract
};
