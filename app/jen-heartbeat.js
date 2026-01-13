/**
 * Jen Heartbeat - keeps Jen alive and reports status
 * 
 * DOES:
 *  - Logs heartbeat every HEARTBEAT_SECONDS
 *  - Reports Jen is alive to ops/monitoring
 *
 * DOES NOT:
 *  - Touch any data tables
 */

const HEARTBEAT_SECONDS = parseInt(process.env.JEN_HEARTBEAT_SECONDS || '30', 10);

console.log(`[Jen Heartbeat] Starting - interval ${HEARTBEAT_SECONDS}s`);

setInterval(() => {
  console.log(`[Jen Heartbeat] alive at ${new Date().toISOString()}`);
}, HEARTBEAT_SECONDS * 1000);

process.on('SIGINT', () => {
  console.log('[Jen Heartbeat] SIGINT - shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Jen Heartbeat] SIGTERM - shutting down');
  process.exit(0);
});
