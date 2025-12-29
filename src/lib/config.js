/**
 * SuperJen Configuration - Global (5402)
 * v5.0 - Claude AI with guardrails
 */
module.exports = {
  PORT: process.env.JEN_PORT || 5402,
  TERMINAL_PORT: 5400,
  SUSAN_URL: process.env.SUSAN_URL || 'http://localhost:5403',
  
  // AI Settings - Claude for quality extraction
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
  MAX_TOKENS: parseInt(process.env.MAX_TOKENS) || 4000,
  
  // Legacy OpenAI (keep for fallback)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Processing
  BATCH_SIZE: 5,
  MIN_CONTENT_LENGTH: 500,
  MAX_CONVERSATION_LENGTH: 50000
};
