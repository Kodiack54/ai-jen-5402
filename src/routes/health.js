/**
 * Health routes
 */
const express = require('express');
const router = express.Router();
const db = require('../lib/db');

router.get('/health', async (req, res) => {
  try {
    const dbOk = await db.ping();
    res.json({ 
      status: 'ok', 
      service: 'jen-5402',
      role: 'The Scrubber',
      database: dbOk ? 'connected' : 'disconnected'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

router.get('/api/status', async (req, res) => {
  try {
    const { data: pending } = await db.from('dev_ai_staging')
      .select('id')
      .eq('processed', false);
    
    res.json({
      status: 'ok',
      pendingMessages: pending?.length || 0
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
