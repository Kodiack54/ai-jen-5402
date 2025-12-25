require('dotenv').config();
const { from } = require('./src/lib/db');
const smartPatterns = require('./src/services/smartPatterns');
const uuidDetector = require('./src/services/uuidDetector');

(async () => {
  await uuidDetector.loadCache();
  
  // Get first active session
  const { data: sessions } = await from('dev_ai_sessions')
    .select('id, started_at')
    .eq('status', 'active')
    .eq('terminal_port', 5400)
    .limit(1);
  
  if (!sessions || sessions.length === 0) {
    console.log('No sessions');
    process.exit(0);
  }
  
  const session = sessions[0];
  console.log('Processing session:', session.id);
  
  // Get messages from staging
  const { data: messages } = await from('dev_ai_staging')
    .select('*')
    .eq('session_id', session.id)
    .order('captured_at', { ascending: true });
  
  console.log('Messages:', messages ? messages.length : 0);
  
  if (!messages || messages.length < 3) {
    console.log('Not enough messages');
    process.exit(0);
  }
  
  // Build conversation text
  const conversationText = messages
    .map(m => (m.role || 'unknown').toUpperCase() + ': ' + (m.content || ''))
    .join('\n\n')
    .slice(0, 50000);
  
  console.log('Conversation length:', conversationText.length);
  
  // Try pattern extraction
  let extraction = smartPatterns.extract(messages);
  console.log('Pattern extraction items:', extraction?.items?.length || 0);
  
  if (extraction && extraction.items && extraction.items.length > 0) {
    console.log('Sample item:', JSON.stringify(extraction.items[0], null, 2));
  }
  
  // Detect UUIDs
  const uuids = await uuidDetector.detect(conversationText);
  console.log('Detected UUIDs:', JSON.stringify(uuids, null, 2));
  
  process.exit(0);
})();
