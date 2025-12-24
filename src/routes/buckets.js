/**
 * Buckets API - Returns counts for all flagged categories
 * Used by Session Hub to display real-time bucket counts
 */
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// Bucket category definitions
const BUCKET_CATEGORIES = {
  knowledge: ['Work Log', 'Ideas', 'Decisions', 'Lessons'],
  docs: ['System Breakdown', 'How-To Guide', 'Schematic', 'Reference'],
  conventions: ['Naming Conventions', 'File Structure', 'Database Patterns', 'API Patterns', 'Component Patterns', 'Quirks & Gotchas'],
  bugs: ['Open', 'Fixed']
};

router.get('/api/buckets', async (req, res) => {
  try {
    const buckets = {};

    // Knowledge categories
    for (const cat of BUCKET_CATEGORIES.knowledge) {
      const { data } = await db.from('dev_ai_knowledge')
        .select('id')
        .eq('category', cat);
      buckets[cat] = data?.length || 0;
    }

    // Docs categories  
    for (const cat of BUCKET_CATEGORIES.docs) {
      const { data } = await db.from('dev_ai_docs')
        .select('id')
        .eq('doc_type', cat);
      buckets[cat] = data?.length || 0;
    }

    // Todos (total pending)
    const { data: todos } = await db.from('dev_ai_todos')
      .select('id')
      .eq('status', 'pending');
    buckets['Todos'] = todos?.length || 0;

    // Conventions categories
    for (const cat of BUCKET_CATEGORIES.conventions) {
      const { data } = await db.from('dev_ai_conventions')
        .select('id')
        .eq('category', cat);
      buckets[cat] = data?.length || 0;
    }

    // Bug reports
    const { data: openBugs } = await db.from('dev_ai_bugs')
      .select('id')
      .eq('status', 'open');
    buckets['Bugs Open'] = openBugs?.length || 0;

    const { data: fixedBugs } = await db.from('dev_ai_bugs')
      .select('id')
      .eq('status', 'fixed');
    buckets['Bugs Fixed'] = fixedBugs?.length || 0;

    // Timeline/Journal
    const { data: journal } = await db.from('dev_ai_journal')
      .select('id');
    buckets['Journal'] = journal?.length || 0;

    // Snippets
    const { data: snippets } = await db.from('dev_ai_snippets')
      .select('id');
    buckets['Snippets'] = snippets?.length || 0;

    res.json({
      success: true,
      buckets,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Jen] Buckets error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      buckets: {} 
    });
  }
});

module.exports = router;
