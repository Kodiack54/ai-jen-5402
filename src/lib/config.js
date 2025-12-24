/**
 * Jen Configuration - Global (5402)
 */
module.exports = {
  PORT: process.env.JEN_PORT || 5402,
  TERMINAL_PORT: 5400,
  SUSAN_URL: process.env.SUSAN_URL || 'http://localhost:5403',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  BATCH_SIZE: 50,
  MIN_MESSAGES_FOR_SMART: 3,
  MAX_CONVERSATION_LENGTH: 15000
};
