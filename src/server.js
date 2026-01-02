require("dotenv").config({ path: __dirname + "/../.env" });
/**
 * Jen 5402 - The Scrubber
 * Processes raw captured data from Chad, cleans/extracts/validates, sends to Susan
 */

const express = require('express');
const cors = require('cors');
const { Logger } = require('./lib/logger');
const config = require('./lib/config');
const processor = require('./services/processor-v6');
const healthRoutes = require('./routes/health');
const bucketsRoutes = require('./routes/buckets');

const logger = new Logger('Jen');
const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/', healthRoutes);
app.use('/', bucketsRoutes);

// Processing intervals
const QUICK_PROCESS_INTERVAL = 30 * 60 * 1000;  // 30 minutes      // 30 seconds - pattern matching
const SMART_PROCESS_INTERVAL = 30 * 60 * 1000;  // 30 minutes  // 5 minutes - AI extraction
const BATCH_SIZE = 50;

let isProcessing = false;

/**
 * Quick process - pattern matching only, no AI
 */
async function runQuickProcess() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    logger.info('Starting quick process cycle');
    const result = await processor.quickProcess(BATCH_SIZE);
    logger.info('Quick process complete', { processed: result.processed, errors: result.errors });
  } catch (err) {
    logger.error('Quick process failed', { error: err.message });
  } finally {
    isProcessing = false;
  }
}

/**
 * Smart process - AI extraction
 */
async function runSmartProcess() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    logger.info('Starting SMART process cycle');
    const result = await processor.smartProcess(BATCH_SIZE);
    logger.info('SMART process complete', { processed: result.processed, errors: result.errors });
  } catch (err) {
    logger.error('SMART process failed', { error: err.message });
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the server
 */
async function start() {
  const port = config.PORT || 5407;

  // Initialize processor
  await processor.initialize();

  // Start processing loops
  setTimeout(runQuickProcess, 5000);
  setInterval(runQuickProcess, QUICK_PROCESS_INTERVAL);

  setTimeout(runSmartProcess, 15000);
  setInterval(runSmartProcess, SMART_PROCESS_INTERVAL);

  app.listen(port, () => {
    logger.info('Jen The Scrubber ready', { port, pid: process.pid });
  });
}

start().catch(err => {
  logger.error('Startup failed', { error: err.message });
  process.exit(1);
});
