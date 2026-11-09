import { createApp, randInt, sleep, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { fault, startStatePolling } from '../../common/faults';
import { logger } from '../../common/logger';

const MAX_HOLD_MS = 15_000;

const pool = createPool({ max: 2 });
startStatePolling(pool);

/** Under deposit_delay each deposit gets a 30-90s confirmation deadline. */
const deadlines = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, t] of deadlines) if (t < cutoff) deadlines.delete(id);
}, 60_000).unref();

const app = createApp();

app.post('/bank/transfer-confirm', async (req, res) => {
  const depositId = String(req.body?.depositId ?? 'unknown');
  const delayed = fault('deposit_delay');
  tagSpan({ 'deposit.id': depositId, 'demo.fault': delayed ? 'deposit_delay' : 'none' });

  if (!delayed && !deadlines.has(depositId)) {
    await sleep(randInt(3000, 8000));
    return res.json({ status: 'confirmed', depositId });
  }

  if (!deadlines.has(depositId)) deadlines.set(depositId, Date.now() + randInt(30_000, 90_000));
  const remaining = deadlines.get(depositId)! - Date.now();
  await sleep(Math.max(0, Math.min(remaining, MAX_HOLD_MS)));
  if (deadlines.get(depositId)! <= Date.now()) {
    deadlines.delete(depositId);
    return res.json({ status: 'confirmed', depositId });
  }
  logger.info({ step: 'deposit', 'deposit.id': depositId }, 'Bank transfer confirmation still processing');
  res.json({ status: 'pending', depositId });
});

start(app);
