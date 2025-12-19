/**
 * Jen Configuration
 */
module.exports = {
  PORT: process.env.JEN_PORT || 5407,
  SUSAN_URL: process.env.SUSAN_URL || 'http://localhost:5403',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Processing settings
  BATCH_SIZE: 50,
  MIN_MESSAGES_FOR_SMART: 3,
  MAX_CONVERSATION_LENGTH: 15000
};
