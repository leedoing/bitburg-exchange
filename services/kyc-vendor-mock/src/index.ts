import { createApp, randInt, sleep, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { fault, startStatePolling } from '../../common/faults';
import { logger } from '../../common/logger';

const APPROVAL_RATE = 0.92;

const pool = createPool({ max: 2 });
startStatePolling(pool);

const app = createApp();

app.post('/vendor/:flow(v1|v2)/check', async (req, res) => {
  const flow = req.params.flow;
  const slow = flow === 'v2' ? fault('kyc_vendor_slow') : undefined;
  let delayMs = randInt(1000, 3000);
  if (slow) {
    // intensity is the share of requests that hang past the kyc service's 20s timeout.
    delayMs = Math.random() < slow.intensity ? randInt(21_000, 25_000) : randInt(8000, 15_000);
  }
  tagSpan({ 'kyc.flow': flow, 'vendor.delay_ms': delayMs, 'demo.fault': slow ? 'kyc_vendor_slow' : 'none' });
  if (slow) logger.warn({ step: 'kyc', 'kyc.flow': flow, 'vendor.delay_ms': delayMs }, `Vendor ${flow} check slowed by ${delayMs}ms`);
  await sleep(delayMs);
  const result = Math.random() < APPROVAL_RATE ? 'approved' : 'rejected';
  res.json({ result, flow, checkedInMs: delayMs });
});

start(app);
