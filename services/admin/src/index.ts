import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { createApp, start } from '../../common/app';
import { createPool } from '../../common/db';
import { CampaignState, DemoState, FAULT_NAMES, FaultEntry, FaultName, readState } from '../../common/faults';
import { logger } from '../../common/logger';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const DEFAULT_DURATION_MIN = 15;
const MAX_DURATION_MIN = 120;
const CAMPAIGNS = new Set(['none', 'listing_pups', 'promo_deposit_bonus']);

const pool = createPool({ max: 3 });

function requireToken(req: Request, res: Response, next: NextFunction) {
  const given = Buffer.from(String(req.headers['x-admin-token'] ?? ''));
  const expected = Buffer.from(ADMIN_TOKEN);
  if (!ADMIN_TOKEN || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    logger.warn({ path: req.path }, 'Admin request rejected: bad token');
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

async function save(key: 'faults' | 'campaign', value: unknown) {
  await pool.query(
    'INSERT INTO demo_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
    [key, JSON.stringify(value)],
  );
}

/**
 * Datadog Events API. DogStatsD events are not used: their length header counts UTF-16 units,
 * so Korean titles get truncated by the Agent.
 */
function sendEvent(title: string, text: string, scenario: string, alertType: 'info' | 'warning' | 'success') {
  logger.info({ scenario, 'event.title': title }, title);
  const apiKey = process.env.DD_API_KEY;
  if (!apiKey) return logger.warn('DD_API_KEY missing: event not sent');
  fetch(`https://api.${process.env.DD_SITE ?? 'datadoghq.com'}/api/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'DD-API-KEY': apiKey },
    body: JSON.stringify({
      title,
      text,
      alert_type: alertType,
      aggregation_key: `bitsburg-${scenario}`,
      source_type_name: 'bitsburg-admin',
      tags: [`scenario:${scenario}`, 'source:bitsburg-admin', 'env:demo-coinone', 'team:bitsburg', 'service:bitsburg-admin'],
    }),
  })
    .then((r) => {
      if (!r.ok) logger.warn({ status: r.status }, 'Datadog event rejected');
    })
    .catch((err) => logger.warn({ err }, 'Datadog event failed'));
}

function clampDuration(v: unknown) {
  const n = Number(v ?? DEFAULT_DURATION_MIN);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_DURATION_MIN) : DEFAULT_DURATION_MIN;
}

async function setFault(state: DemoState, fault: FaultName, enabled: boolean, intensity: number, durationMin: number, why: string) {
  const now = new Date();
  const prev = state.faults[fault];
  const wasOn = Boolean(prev?.enabled);
  if (enabled) {
    const entry: FaultEntry = {
      enabled: true,
      intensity,
      startedAt: wasOn && prev ? prev.startedAt : now.toISOString(),
      expiresAt: new Date(now.getTime() + durationMin * 60_000).toISOString(),
    };
    state.faults[fault] = entry;
  } else if (prev) {
    state.faults[fault] = { ...prev, enabled: false, expiresAt: now.toISOString() };
  }
  await save('faults', state.faults);

  if (enabled && !wasOn) {
    sendEvent(
      `[Bitsburg] 장애 주입 시작: ${fault}`,
      `fault=${fault}, intensity=${intensity}, 자동 해제 ${durationMin}분 후`,
      fault,
      'warning',
    );
  } else if (!enabled && wasOn) {
    const minutes = prev ? Math.round((now.getTime() - Date.parse(prev.startedAt)) / 60_000) : 0;
    sendEvent(`[Bitsburg] 장애 주입 종료: ${fault}`, `fault=${fault}, ${why}, 지속 약 ${minutes}분`, fault, 'success');
  }

  // listing_spike runs the listing_pups campaign for the same window.
  if (fault === 'listing_spike') await setCampaign(state, 'listing_pups', enabled, durationMin);
}

async function setCampaign(state: DemoState, id: string, enabled: boolean, durationMin: number) {
  const now = new Date();
  const prev = state.campaign;
  const wasOn = prev.enabled && prev.id === id;
  const next: CampaignState = enabled
    ? { id, enabled: true, startedAt: wasOn ? prev.startedAt : now.toISOString(), expiresAt: new Date(now.getTime() + durationMin * 60_000).toISOString() }
    : { id: 'none', enabled: false };
  state.campaign = next;
  await save('campaign', next);
  if (enabled && !wasOn) sendEvent(`[Bitsburg] 캠페인 시작: ${id}`, `campaign=${id}, 자동 종료 ${durationMin}분 후`, id, 'info');
  if (!enabled && prev.enabled) sendEvent(`[Bitsburg] 캠페인 종료: ${prev.id}`, `campaign=${prev.id}`, prev.id, 'info');
}

function publicState(state: DemoState) {
  const now = Date.now();
  return {
    faults: FAULT_NAMES.map((name) => {
      const f = state.faults[name];
      const on = Boolean(f?.enabled && Date.parse(f.expiresAt) > now);
      return {
        name,
        enabled: on,
        intensity: f?.intensity ?? 0,
        startedAt: on ? f?.startedAt : null,
        expiresAt: on ? f?.expiresAt : null,
        remainingSec: on && f ? Math.max(0, Math.round((Date.parse(f.expiresAt) - now) / 1000)) : 0,
      };
    }),
    campaign: {
      ...state.campaign,
      remainingSec:
        state.campaign.enabled && state.campaign.expiresAt ? Math.max(0, Math.round((Date.parse(state.campaign.expiresAt) - now) / 1000)) : 0,
    },
    serverTime: new Date(now).toISOString(),
  };
}

const app = createApp();

app.get('/admin/state', requireToken, async (_req, res, next) => {
  try {
    res.json(publicState(await readState(pool)));
  } catch (err) {
    next(err);
  }
});

app.post('/admin/faults', requireToken, async (req, res, next) => {
  try {
    const fault = req.body?.fault as FaultName;
    if (!FAULT_NAMES.includes(fault)) return res.status(400).json({ error: 'unknown_fault', allowed: FAULT_NAMES });
    const enabled = Boolean(req.body?.enabled);
    const intensity = Math.min(1, Math.max(0, Number(req.body?.intensity ?? 0.7)));
    const durationMin = clampDuration(req.body?.durationMin);
    const state = await readState(pool);
    await setFault(state, fault, enabled, intensity, durationMin, '수동 해제');
    res.json(publicState(state));
  } catch (err) {
    next(err);
  }
});

app.post('/admin/campaign', requireToken, async (req, res, next) => {
  try {
    const id = String(req.body?.id ?? 'none');
    if (!CAMPAIGNS.has(id)) return res.status(400).json({ error: 'unknown_campaign' });
    const enabled = id !== 'none' && Boolean(req.body?.enabled);
    const state = await readState(pool);
    await setCampaign(state, id, enabled, clampDuration(req.body?.durationMin));
    res.json(publicState(state));
  } catch (err) {
    next(err);
  }
});

/** Auto-release: switch expired faults / campaigns off and send the end event. */
setInterval(async () => {
  try {
    const state = await readState(pool);
    const now = Date.now();
    for (const name of FAULT_NAMES) {
      const f = state.faults[name];
      if (f?.enabled && Date.parse(f.expiresAt) <= now) await setFault(state, name, false, f.intensity, 0, '자동 해제');
    }
    const c = state.campaign;
    if (c.enabled && c.expiresAt && Date.parse(c.expiresAt) <= now) await setCampaign(state, c.id, false, 0);
  } catch (err) {
    logger.warn({ err }, 'Auto-release check failed');
  }
}, 5000).unref();

start(app);
