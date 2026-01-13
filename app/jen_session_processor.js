/**
 * Jen Session Processor - moves active sessions to processed
 * 
 * DOES:
 *  - Find sessions with status='active' AND processed_at IS NULL
 *  - Set processed_at=NOW(), processed_by='jen-session-processor'
 *
 * DOES NOT:
 *  - Touch dev_transcripts_raw
 *  - Set status='cleaned' (that broke things before)
 *  - Touch any other tables
 *
 * Env:
 *  - DATABASE_URL (required)
 *  - JEN_POLL_SECONDS (default 60)
 *  - JEN_BATCH_SIZE (default 50)
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://kodiack_admin:K0d1ack_Pr0d_2025_Rx9@127.0.0.1:9432/kodiack_ai';
const POLL_SECONDS = parseInt(process.env.JEN_POLL_SECONDS || '60', 10);
const BATCH_SIZE = parseInt(process.env.JEN_BATCH_SIZE || '50', 10);

const pool = new Pool({ connectionString: DATABASE_URL });

async function processBatch() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Claim active, unprocessed sessions with SKIP LOCKED
    const claimResult = await client.query(`
      SELECT id FROM dev_ai_sessions
      WHERE status = 'active' AND processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `, [BATCH_SIZE]);

    const ids = claimResult.rows.map(r => r.id);

    if (ids.length > 0) {
      // Mark as processed (but do NOT change status to 'cleaned')
      await client.query(`
        UPDATE dev_ai_sessions
        SET processed_at = NOW(), processed_by = 'jen-session-processor'
        WHERE id = ANY($1::uuid[])
      `, [ids]);

      console.log(`[Jen Session] Processed ${ids.length} sessions`);
    }

    await client.query('COMMIT');
    return ids.length;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Jen Session] ERROR:', err.message);
    return 0;
  } finally {
    client.release();
  }
}

async function loop() {
  console.log(`[Jen Session] Starting - poll=${POLL_SECONDS}s batch=${BATCH_SIZE}`);

  while (true) {
    await processBatch();
    await new Promise(r => setTimeout(r, POLL_SECONDS * 1000));
  }
}

process.on('SIGINT', async () => {
  console.log('[Jen Session] SIGINT - shutting down');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Jen Session] SIGTERM - shutting down');
  await pool.end();
  process.exit(0);
});

loop().catch(e => {
  console.error('[Jen Session] Fatal:', e.message);
  process.exit(1);
});
