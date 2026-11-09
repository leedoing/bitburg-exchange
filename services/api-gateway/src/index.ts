import { createApp, forwardHeaders, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { activeCampaign, activeFaults, currentScenario, getState, startStatePolling } from '../../common/faults';
import { callJson, TimeoutError } from '../../common/http';
import { logger } from '../../common/logger';
import { bizTags, statsd } from '../../common/metrics';

const AUTH_URL = process.env.AUTH_URL ?? 'http://auth:3000';
const KYC_URL = process.env.KYC_URL ?? 'http://kyc:3000';
const WALLET_URL = process.env.WALLET_URL ?? 'http://wallet:3000';
const ORDER_URL = process.env.ORDER_URL ?? 'http://order:3000';

// Explicit routes so APM resource names read "POST /api/orders" instead of "POST".
const ROUTES: Array<[method: 'get' | 'post', path: string, target: string]> = [
  ['post', '/api/auth/signup', AUTH_URL],
  ['post', '/api/auth/login', AUTH_URL],
  ['post', '/api/kyc/verify', KYC_URL],
  ['post', '/api/wallet/deposit', WALLET_URL],
  ['get', '/api/wallet/deposit/:id', WALLET_URL],
  ['post', '/api/orders', ORDER_URL],
];

const CS_TOPICS = new Set(['deposit', 'kyc', 'order']);

const pool = createPool({ max: 2 });
startStatePolling(pool);

const app = createApp();

/** Public, secret-free view of the demo state (the web app tags RUM with demo.scenario from it). */
app.get('/api/demo/state', (_req, res) => {
  const s = getState();
  res.json({
    scenario: currentScenario(),
    faults: activeFaults().map((name) => ({ name, expiresAt: s.faults[name]?.expiresAt })),
    campaign: activeCampaign(),
  });
});

app.post('/api/cs/contact', (req, res) => {
  const topic = CS_TOPICS.has(req.body?.topic) ? req.body.topic : 'deposit';
  statsd.increment('bitsburg.cs.contact', 1, bizTags(req.ctx, { topic }));
  tagSpan({ 'cs.topic': topic });
  logger.info({ 'usr.id': req.ctx.userId, step: 'cs', 'cs.topic': topic }, `CS contact opened: ${topic}`);
  res.json({ ok: true, ticketId: `cs_${Date.now().toString(36)}` });
});

for (const [method, path, target] of ROUTES) {
  app[method](path, async (req, res, next) => {
    try {
      const upstream = await callJson(`${target}${req.originalUrl}`, {
        method: req.method,
        body: req.method === 'GET' ? undefined : req.body,
        headers: forwardHeaders(req),
        timeoutMs: 60_000,
      });
      res.status(upstream.status).json(upstream.data);
    } catch (err) {
      if (err instanceof TimeoutError) {
        logger.error({ path: req.path, 'usr.id': req.ctx.userId }, `Upstream timeout after ${err.waitedMs}ms`);
        return res.status(504).json({ error: 'upstream_timeout' });
      }
      next(err);
    }
  });
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

start(app);
