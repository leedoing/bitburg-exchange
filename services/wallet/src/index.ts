import { randomBytes } from 'crypto';
import { createApp, forwardHeaders, RequestContext, sleep, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { currentScenario, startStatePolling } from '../../common/faults';
import { callJson, TimeoutError } from '../../common/http';
import { logger } from '../../common/logger';
import { bizTags, statsd } from '../../common/metrics';

const BANK_URL = process.env.BANK_GATEWAY_URL ?? 'http://bank-gateway-mock:3000';
const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 60;

const pool = createPool({ max: 8 });
startStatePolling(pool);

async function confirmDeposit(depositId: string, amountKrw: number, ctx: RequestContext, headers: Record<string, string>) {
  const started = Date.now();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const bank = await callJson<{ status: 'confirmed' | 'pending' }>(`${BANK_URL}/bank/transfer-confirm`, {
        body: { depositId, amountKrw },
        headers,
        timeoutMs: 60_000,
      });
      if (bank.data?.status === 'confirmed') {
        const waitMs = Date.now() - started;
        await pool.query("UPDATE deposits SET status = 'completed', completed_at = now() WHERE id = $1", [depositId]);
        statsd.increment('bitsburg.deposit.completed', 1, bizTags(ctx));
        logger.info(
          { 'usr.id': ctx.userId, step: 'deposit', 'deposit.id': depositId, 'deposit.amount_krw': amountKrw, 'deposit.wait_ms': waitMs },
          'Deposit completed',
        );
        return;
      }
      logger.warn(
        { 'usr.id': ctx.userId, step: 'deposit', 'deposit.id': depositId, 'deposit.amount_krw': amountKrw, retry: attempt },
        `Bank confirmation pending, retry ${attempt}`,
      );
    } catch (err) {
      const msg = err instanceof TimeoutError ? err.message : (err as Error).message;
      logger.warn({ 'usr.id': ctx.userId, step: 'deposit', 'deposit.id': depositId, retry: attempt, err: msg }, `Bank confirmation pending, retry ${attempt}`);
    }
    await sleep(RETRY_DELAY_MS);
  }
  logger.error({ 'usr.id': ctx.userId, step: 'deposit', 'deposit.id': depositId }, 'Bank confirmation gave up');
}

/** Keeps a stray typo from skewing deposit sums on dashboards. Must match apps/web Deposit page. */
const MAX_DEPOSIT_KRW = 100_000_000;

const app = createApp();

app.post('/api/wallet/deposit', async (req, res, next) => {
  try {
    const amountKrw = Math.round(Number(req.body?.amountKrw));
    if (!Number.isFinite(amountKrw) || amountKrw <= 0 || amountKrw > MAX_DEPOSIT_KRW) return res.status(400).json({ error: 'invalid_amount' });
    const depositId = `dep_${randomBytes(6).toString('hex')}`;
    const userId = req.ctx.userId ?? 'anonymous';
    await pool.query(
      'INSERT INTO deposits (id, user_id, amount_krw, app_version, platform, campaign) VALUES ($1, $2, $3, $4, $5, $6)',
      [depositId, userId, amountKrw, req.ctx.appVersion, req.ctx.platform, req.ctx.campaign],
    );
    statsd.increment('bitsburg.deposit.requested', 1, bizTags(req.ctx));
    statsd.distribution('bitsburg.deposit.amount_krw', amountKrw, bizTags(req.ctx));
    tagSpan({ 'deposit.id': depositId, 'deposit.amount_krw': amountKrw });
    logger.info({ 'usr.id': userId, step: 'deposit', 'deposit.id': depositId, 'deposit.amount_krw': amountKrw }, 'Deposit requested');
    const ctx = { ...req.ctx };
    const headers = forwardHeaders(req);
    void confirmDeposit(depositId, amountKrw, ctx, headers).catch((err) =>
      logger.error({ err, 'deposit.id': depositId }, 'Deposit confirmation crashed'),
    );
    res.json({ depositId, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/wallet/deposit/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, status, amount_krw, EXTRACT(EPOCH FROM (COALESCE(completed_at, now()) - created_at)) * 1000 AS wait_ms FROM deposits WHERE id = $1',
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    const d = rows[0];
    tagSpan({ 'deposit.id': d.id, 'deposit.status': d.status, 'deposit.amount_krw': Number(d.amount_krw) });
    res.json({ depositId: d.id, status: d.status, amountKrw: Number(d.amount_krw), waitMs: Math.round(Number(d.wait_ms)) });
  } catch (err) {
    next(err);
  }
});

/** Longest current wait among pending deposits (last 10 minutes), every 10 seconds. */
setInterval(async () => {
  try {
    const { rows } = await pool.query(
      "SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (now() - created_at))), 0) AS s, COUNT(*) AS n FROM deposits WHERE status = 'pending' AND created_at > now() - interval '10 minutes'",
    );
    statsd.gauge('bitsburg.deposit.pending_seconds', Math.round(Number(rows[0].s)), { scenario: currentScenario() });
    statsd.gauge('bitsburg.deposit.pending_count', Number(rows[0].n), { scenario: currentScenario() });
  } catch (err) {
    logger.warn({ err }, 'Failed to compute pending deposits');
  }
}, 10_000).unref();

start(app);
