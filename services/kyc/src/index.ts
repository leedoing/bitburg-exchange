import { createApp, forwardHeaders, randInt, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { startStatePolling } from '../../common/faults';
import { callJson, TimeoutError } from '../../common/http';
import { logger } from '../../common/logger';
import { bizTags, statsd } from '../../common/metrics';

const VENDOR_URL = process.env.KYC_VENDOR_URL ?? 'http://kyc-vendor-mock:3000';
const VENDOR_TIMEOUT_MS = 20_000;

const pool = createPool({ max: 5 });
startStatePolling(pool);

/** Random fake resident registration number with a valid check digit (SDS masking demo only). */
function fakeRrn(): string {
  const yy = String(randInt(60, 99));
  const mm = String(randInt(1, 12)).padStart(2, '0');
  const dd = String(randInt(1, 28)).padStart(2, '0');
  const digits = `${yy}${mm}${dd}${randInt(1, 2)}${String(randInt(0, 99999)).padStart(5, '0')}`;
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = digits.split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  const check = (11 - (sum % 11)) % 10;
  return `${digits.slice(0, 6)}-${digits.slice(6)}${check}`;
}

function fakePhone(): string {
  return `010-${randInt(2000, 9999)}-${String(randInt(0, 9999)).padStart(4, '0')}`;
}

const app = createApp();

app.post('/api/kyc/verify', async (req, res, next) => {
  const flow = req.body?.flow === 'v2' ? 'v2' : 'v1';
  const userId = req.ctx.userId;
  const started = Date.now();
  tagSpan({ 'kyc.flow': flow });
  logger.info(
    { 'usr.id': userId, step: 'kyc', 'kyc.flow': flow, applicant_note: `주민번호 ${fakeRrn()} 연락처 ${fakePhone()}` },
    'KYC document received',
  );
  try {
    const vendor = await callJson<{ result: 'approved' | 'rejected' }>(`${VENDOR_URL}/vendor/${flow}/check`, {
      body: { userId },
      headers: forwardHeaders(req),
      timeoutMs: VENDOR_TIMEOUT_MS,
    });
    const waitMs = Date.now() - started;
    const result = vendor.data?.result === 'approved' ? 'approved' : 'failed';
    const reason = result === 'approved' ? undefined : 'rejected';
    statsd.increment('bitsburg.kyc.result', 1, bizTags(req.ctx, { result, flow, ...(reason ? { reason } : {}) }));
    statsd.distribution('bitsburg.kyc.wait_ms', waitMs, bizTags(req.ctx, { flow }));
    if (userId) await pool.query('UPDATE users SET kyc_status = $1 WHERE id = $2', [result, userId]);
    tagSpan({ 'kyc.result': result, 'kyc.wait_ms': waitMs });
    logger.info({ 'usr.id': userId, step: 'kyc', 'kyc.flow': flow, 'kyc.wait_ms': waitMs, 'kyc.result': result }, `KYC ${result}`);
    res.json({ status: result === 'approved' ? 'approved' : 'rejected', flow, waitMs });
  } catch (err) {
    if (err instanceof TimeoutError) {
      const waitMs = Date.now() - started;
      statsd.increment('bitsburg.kyc.result', 1, bizTags(req.ctx, { result: 'failed', flow, reason: 'timeout' }));
      statsd.distribution('bitsburg.kyc.wait_ms', waitMs, bizTags(req.ctx, { flow }));
      tagSpan({ 'kyc.result': 'timeout', 'kyc.wait_ms': waitMs, error: true });
      logger.error(
        { 'usr.id': userId, step: 'kyc', 'kyc.flow': flow, 'kyc.wait_ms': waitMs },
        `KYC vendor ${flow} response timeout after ${err.waitedMs}ms`,
      );
      return res.status(504).json({ status: 'timeout', flow, waitMs });
    }
    next(err);
  }
});

start(app);
