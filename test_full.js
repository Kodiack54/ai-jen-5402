require('dotenv').config();
const { from } = require('./src/lib/db');
const smartPatterns = require('./src/services/smartPatterns');
const uuidDetector = require('./src/services/uuidDetector');

const BUCKET_TO_TABLE = {
  'Bugs Open': 'dev_ai_bugs',
  'Bugs Fixed': 'dev_ai_bugs',
  'Todos': 'dev_ai_todos',
  'Journal': 'dev_ai_journal',
  'Work Log': 'dev_ai_journal',
  'Ideas': 'dev_ai_knowledge',
  'Decisions': 'dev_ai_decisions',
  'Lessons': 'dev_ai_lessons',
  'System Breakdown': 'dev_ai_docs',
  'How-To Guide': 'dev_ai_docs',
  'Schematic': 'dev_ai_docs',
  'Reference': 'dev_ai_docs',
  'Naming Conventions': 'dev_ai_conventions',
  'File Structure': 'dev_ai_conventions',
  'Database Patterns': 'dev_ai_conventions',
  'API Patterns': 'dev_ai_conventions',
  'Component Patterns': 'dev_ai_conventions',
  'Quirks & Gotchas': 'dev_ai_knowledge',
  'Snippets': 'dev_ai_snippets',
  'Other': 'dev_ai_knowledge'
};

async function writeItem(item, sessionId, uuids) {
  const table = BUCKET_TO_TABLE[item.bucket] || 'dev_ai_knowledge';

  const baseRecord = {
    client_id: uuids.client_id,
    parent_id: uuids.parent_id,
    project_id: uuids.project_id,
    bucket: item.bucket,
    keywords: JSON.stringify(item.keywords || []),
    source_session_id: sessionId,
    status: 'flagged',
    created_at: new Date().toISOString()
  };

  try {
    if (table === 'dev_ai_todos') {
      const { error } = await from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title
      });
      if (error) throw error;
    }
    else if (table === 'dev_ai_knowledge') {
      const { error } = await from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        content: item.content || item.title,
        category: item.bucket
      });
      if (error) throw error;
    }
    else if (table === 'dev_ai_docs') {
      const docTypeMap = {
        'System Breakdown': 'breakdown',
        'How-To Guide': 'howto',
        'Schematic': 'schematic',
        'Reference': 'reference'
      };
      const { error } = await from(table).insert({
        ...baseRecord,
        title: (item.title || item.content || '').substring(0, 200),
        content: item.content || item.title,
        doc_type: docTypeMap[item.bucket] || 'reference'
      });
      if (error) throw error;
    }
    else if (table === 'dev_ai_conventions') {
      const convTypeMap = {
        'Naming Conventions': 'naming',
        'File Structure': 'structure',
        'Database Patterns': 'database',
        'API Patterns': 'api',
        'Component Patterns': 'component'
      };
      const { error } = await from(table).insert({
        ...baseRecord,
        name: (item.title || item.content || '').substring(0, 200),
        description: item.content || item.title,
        convention_type: convTypeMap[item.bucket] || 'other'
      });
      if (error) throw error;
    }
    console.log('  Written to', table, '- bucket:', item.bucket);
    return true;
  } catch (err) {
    console.error('  FAILED to write to', table, ':', err.message);
    return false;
  }
}

(async () => {
  console.log('=== FULL END-TO-END TEST ===\n');
  
  await uuidDetector.loadCache();
  
  // Get first active session
  const { data: sessions } = await from('dev_ai_sessions')
    .select('id, started_at')
    .eq('status', 'active')
    .eq('terminal_port', 5400)
    .limit(1);
  
  if (!sessions || sessions.length === 0) {
    console.log('No active sessions');
    process.exit(0);
  }
  
  const session = sessions[0];
  console.log('1. Session:', session.id);
  
  // Get messages from staging
  const { data: messages } = await from('dev_ai_staging')
    .select('*')
    .eq('session_id', session.id)
    .order('captured_at', { ascending: true });
  
  console.log('2. Messages:', messages?.length || 0);
  
  // Build conversation text
  const conversationText = messages
    .map(m => (m.role || 'unknown').toUpperCase() + ': ' + (m.content || ''))
    .join('\n\n')
    .slice(0, 50000);
  
  // Pattern extraction
  let extraction = smartPatterns.extract(messages);
  console.log('3. Extracted items:', extraction?.items?.length || 0);
  
  // UUID detection
  const uuids = await uuidDetector.detect(conversationText);
  console.log('4. Detected UUIDs:');
  console.log('   client_id:', uuids.client_id || 'NULL');
  console.log('   parent_id:', uuids.parent_id || 'NULL');
  console.log('   project_id:', uuids.project_id || 'NULL');
  
  // Write items (limit to 3 for test)
  console.log('\n5. Writing items to destination tables...');
  let written = 0;
  for (const item of extraction.items.slice(0, 3)) {
    const success = await writeItem(item, session.id, uuids);
    if (success) written++;
  }
  
  console.log('\n6. Written:', written, 'items');
  
  // Verify by querying
  console.log('\n7. Verifying items written with UUIDs...');
  const { data: verifyTodos } = await from('dev_ai_todos')
    .select('id, title, client_id, project_id, status')
    .eq('status', 'flagged')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('   Flagged todos:', verifyTodos?.length || 0);
  if (verifyTodos && verifyTodos.length > 0) {
    console.log('   Sample:', JSON.stringify(verifyTodos[0], null, 2));
  }
  
  const { data: verifyDocs } = await from('dev_ai_docs')
    .select('id, title, client_id, project_id, status')
    .eq('status', 'flagged')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('   Flagged docs:', verifyDocs?.length || 0);
  
  const { data: verifyConv } = await from('dev_ai_conventions')
    .select('id, name, client_id, project_id, status')
    .eq('status', 'flagged')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('   Flagged conventions:', verifyConv?.length || 0);
  
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
})();
