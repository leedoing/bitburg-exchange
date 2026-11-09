import { createApp, randInt, sleep, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { startStatePolling } from '../../common/faults';
import { logger } from '../../common/logger';
import { bizTags, statsd } from '../../common/metrics';

const pool = createPool({ max: 5 });
startStatePolling(pool);

const app = createApp();
const TIERS = new Set(['new', 'regular', 'vip']);

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    await sleep(randInt(60, 170));
    const { rows } = await pool.query<{ n: string }>("SELECT nextval('user_seq') AS n");
    const n = Number(rows[0].n);
    const userId = `u_${String(n).padStart(6, '0')}`;
    const tier = TIERS.has(req.body?.tier) ? req.body.tier : 'new';
    const name = `데모회원${n}`;
    await pool.query('INSERT INTO users (id, name, tier) VALUES ($1, $2, $3)', [userId, name, tier]);
    statsd.increment('bitsburg.signup.completed', 1, bizTags(req.ctx));
    tagSpan({ 'usr.id': userId, 'usr.tier': tier });
    logger.info({ 'usr.id': userId, step: 'signup', 'usr.tier': tier }, 'Signup completed');
    res.json({ userId, name, tier });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    await sleep(randInt(60, 170));
    const requested = typeof req.body?.userId === 'string' ? req.body.userId : null;
    const { rows } = requested
      ? await pool.query('SELECT id, name, tier FROM users WHERE id = $1', [requested])
      : await pool.query(
          "SELECT id, name, tier FROM users WHERE kyc_status = 'approved' ORDER BY random() LIMIT 1",
        );
    if (rows.length === 0) {
      logger.warn({ 'usr.id': requested, step: 'login' }, 'Login failed: unknown user');
      return res.status(401).json({ error: 'unknown_user' });
    }
    const user = rows[0];
    tagSpan({ 'usr.id': user.id, 'usr.tier': user.tier });
    logger.info({ 'usr.id': user.id, step: 'login', 'usr.tier': user.tier }, 'Login succeeded');
    res.json({ userId: user.id, name: user.name, tier: user.tier });
  } catch (err) {
    next(err);
  }
});

start(app);
