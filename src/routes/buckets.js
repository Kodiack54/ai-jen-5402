/**
 * Buckets API - Returns counts for all bucket categories
 * Used by Session Hub to display real-time bucket counts
 */
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

router.get('/api/buckets', async (req, res) => {
  try {
    const buckets = {};

    // Knowledge - uses 'bucket' field
    const knowledgeBuckets = ['Ideas', 'Quirks & Gotchas', 'Other'];
    for (const bucket of knowledgeBuckets) {
      const { data } = await db.from('dev_ai_knowledge')
        .select('id')
        .eq('bucket', bucket);
      buckets[bucket] = data?.length || 0;
    }

    // Docs - uses 'bucket' field  
    const docBuckets = ['System Breakdown', 'How-To Guide', 'Schematic', 'Reference'];
    for (const bucket of docBuckets) {
      const { data } = await db.from('dev_ai_docs')
        .select('id')
        .eq('bucket', bucket);
      buckets[bucket] = data?.length || 0;
    }

    // Conventions - uses 'bucket' field
    const convBuckets = ['Naming Conventions', 'File Structure', 'Database Patterns', 'API Patterns', 'Component Patterns'];
    for (const bucket of convBuckets) {
      const { data } = await db.from('dev_ai_conventions')
        .select('id')
        .eq('bucket', bucket);
      buckets[bucket] = data?.length || 0;
    }

    // Todos - count by status
    const { data: todos } = await db.from('dev_ai_todos')
      .select('id')
      .eq('status', 'flagged');
    buckets['Todos'] = todos?.length || 0;

    // Bugs - uses is_open flag
    const { data: openBugs } = await db.from('dev_ai_bugs')
      .select('id')
      .eq('is_open', true);
    buckets['Bugs Open'] = openBugs?.length || 0;

    const { data: fixedBugs } = await db.from('dev_ai_bugs')
      .select('id')
      .eq('is_open', false);
    buckets['Bugs Fixed'] = fixedBugs?.length || 0;

    // Journal - uses 'bucket' field
    const journalBuckets = ['Journal', 'Work Log'];
    for (const bucket of journalBuckets) {
      const { data } = await db.from('dev_ai_journal')
        .select('id')
        .eq('bucket', bucket);
      buckets[bucket] = data?.length || 0;
    }

    // Decisions
    const { data: decisions } = await db.from('dev_ai_decisions')
      .select('id');
    buckets['Decisions'] = decisions?.length || 0;

    // Lessons
    const { data: lessons } = await db.from('dev_ai_lessons')
      .select('id');
    buckets['Lessons'] = lessons?.length || 0;

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
