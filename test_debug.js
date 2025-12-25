require('dotenv').config();
const { from } = require('./src/lib/db');

(async () => {
  const { data: sessions } = await from('dev_ai_sessions')
    .select('id, status, terminal_port')
    .eq('status', 'active')
    .eq('terminal_port', 5400)
    .limit(1);
  
  if (!sessions || sessions.length === 0) {
    console.log('No active sessions for port 5400');
    process.exit(0);
  }
  
  const sessionId = sessions[0].id;
  console.log('Session:', sessionId);
  
  const { data: messages, error } = await from('dev_ai_staging')
    .select('id, role')
    .eq('session_id', sessionId);
  
  console.log('Messages found:', messages ? messages.length : 0);
  if (error) console.log('Error:', error);
  process.exit(0);
})();
