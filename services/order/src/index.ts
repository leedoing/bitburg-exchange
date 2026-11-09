import type { Pool } from 'pg';
import { createApp, forwardHeaders, randInt, sleep, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { fault, onStateChange, startStatePolling } from '../../common/faults';
import { callJson, TimeoutError } from '../../common/http';
import { logger } from '../../common/logger';
import { bizTags, statsd } from '../../common/metrics';

const MATCHING_URL = process.env.MATCHING_URL ?? 'http://matching-engine:3000';
const NORMAL_POOL_SIZE = Number(process.env.ORDER_DB_POOL_SIZE ?? 10);
const SPIKE_POOL_SIZE = 3;
const POOL_WAIT_TIMEOUT_MS = 2500;
const SLOW_POOL_WAIT_MS = 500;
const SYMBOLS = new Set(['BITS', 'DOGE2', 'WOOF', 'PUPS']);

const statePool = createPool({ max: 2 });
let ordersPool: Pool = createPool({ max: NORMAL_POOL_SIZE, connectionTimeoutMillis: POOL_WAIT_TIMEOUT_MS });
let poolSize = NORMAL_POOL_SIZE;

onStateChange(() => {
  const wanted = fault('listing_spike') ? SPIKE_POOL_SIZE : NORMAL_POOL_SIZE;
  if (wanted === poolSize) return;
  const old = ordersPool;
  ordersPool = createPool({ max: wanted, connectionTimeoutMillis: POOL_WAIT_TIMEOUT_MS });
  poolSize = wanted;
  logger.info({ 'db.pool_size': wanted }, `Order DB pool resized to ${wanted}`);
  setTimeout(() => void old.end(), 30_000).unref();
});
startStatePolling(statePool);

class PoolExhaustedError extends Error {
  constructor(public readonly waitedMs: number) {
    super(`Order DB pool exhausted, waited ${waitedMs}ms`);
  }
}

async function saveOrder(userId: string, symbol: string, amountKrw: number, price: number) {
  const pool = ordersPool;
  const waitStart = Date.now();
  let client;
  try {
    client = await pool.connect();
  } catch {
    throw new PoolExhaustedError(Date.now() - waitStart);
  }
  const waitedMs = Date.now() - waitStart;
  try {
    // listing_spike: every query holds its connection a little longer.
    if (fault('listing_spike')) await client.query('SELECT pg_sleep($1)', [randInt(80, 250) / 1000]);
    await client.query(
      "INSERT INTO orders (user_id, symbol, side, amount_krw, price, status) VALUES ($1, $2, 'buy', $3, $4, 'filled')",
      [userId, symbol, amountKrw, price],
    );
  } finally {
    client.release();
  }
  return waitedMs;
}

/** Keeps a stray typo from skewing trade-value sums on dashboards. Must match apps/web Trade page. */
const MAX_ORDER_KRW = 100_000_000;

const app = createApp();

app.post('/api/orders', async (req, res) => {
  const symbol = SYMBOLS.has(req.body?.symbol) ? req.body.symbol : 'BITS';
  const amountKrw = Math.round(Number(req.body?.amountKrw));
  const userId = req.ctx.userId ?? 'anonymous';
  const started = Date.now();
  if (!Number.isFinite(amountKrw) || amountKrw <= 0 || amountKrw > MAX_ORDER_KRW) return res.status(400).json({ error: 'invalid_amount' });

  const tags = bizTags(req.ctx, { symbol });
  const logBase = { 'usr.id': userId, step: 'trade', 'order.symbol': symbol, 'order.amount_krw': amountKrw, 'order.side': 'buy' };
  statsd.increment('bitsburg.order.placed', 1, tags);
  tagSpan({ 'order.symbol': symbol, 'order.amount_krw': amountKrw, 'order.side': 'buy' });

  try {
    await sleep(randInt(20, 200));
    const match = await callJson<{ price: number }>(`${MATCHING_URL}/match`, {
      body: { symbol, amountKrw, side: 'buy' },
      headers: forwardHeaders(req),
      timeoutMs: 3000,
    });
    const waitedMs = await saveOrder(userId, symbol, amountKrw, match.data.price);
    if (waitedMs > SLOW_POOL_WAIT_MS) logger.warn({ ...logBase, 'db.pool_wait_ms': waitedMs }, `Order DB pool exhausted, waited ${waitedMs}ms`);
    const latencyMs = Date.now() - started;
    statsd.increment('bitsburg.order.filled', 1, tags);
    statsd.distribution('bitsburg.order.amount_krw', amountKrw, tags);
    tagSpan({ 'order.latency_ms': latencyMs, 'db.pool_wait_ms': waitedMs });
    logger.info({ ...logBase, 'order.latency_ms': latencyMs, 'order.price': match.data.price }, 'Order filled');
    res.json({ status: 'filled', symbol, amountKrw, price: match.data.price, latencyMs });
  } catch (err) {
    const latencyMs = Date.now() - started;
    const reason = err instanceof PoolExhaustedError ? 'db_pool_exhausted' : err instanceof TimeoutError ? 'matching_timeout' : 'internal_error';
    statsd.increment('bitsburg.order.failed', 1, { ...tags, reason });
    tagSpan({ 'order.latency_ms': latencyMs, 'order.reason': reason, error: true });
    const msg = err instanceof PoolExhaustedError ? err.message : `Order failed: ${(err as Error).message}`;
    logger.error({ ...logBase, 'order.latency_ms': latencyMs, 'order.reason': reason }, msg);
    res.status(503).json({ status: 'failed', reason, latencyMs });
  }
});

start(app);
