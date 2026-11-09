import type { Pool } from 'pg';
import { logger } from './logger';

export const FAULT_NAMES = ['kyc_vendor_slow', 'deposit_delay', 'listing_spike'] as const;
export type FaultName = (typeof FAULT_NAMES)[number];

export interface FaultEntry {
  enabled: boolean;
  intensity: number;
  startedAt: string;
  expiresAt: string;
}

export interface CampaignState {
  id: string;
  enabled: boolean;
  startedAt?: string;
  expiresAt?: string;
}

export interface DemoState {
  faults: Partial<Record<FaultName, FaultEntry>>;
  campaign: CampaignState;
}

let state: DemoState = { faults: {}, campaign: { id: 'none', enabled: false } };
const listeners: Array<(s: DemoState) => void> = [];

function isLive(expiresAt?: string) {
  return !expiresAt || Date.parse(expiresAt) > Date.now();
}

export function getState(): DemoState {
  return state;
}

export function fault(name: FaultName): FaultEntry | undefined {
  const f = state.faults[name];
  return f && f.enabled && isLive(f.expiresAt) ? f : undefined;
}

export function activeFaults(): FaultName[] {
  return FAULT_NAMES.filter((n) => fault(n));
}

export function activeCampaign(): string {
  const c = state.campaign;
  return c.enabled && isLive(c.expiresAt) ? c.id : 'none';
}

/** Scenario tag for metrics: the active fault, or baseline. */
export function currentScenario(): string {
  return activeFaults()[0] ?? 'baseline';
}

export function onStateChange(fn: (s: DemoState) => void) {
  listeners.push(fn);
}

export async function readState(pool: Pool): Promise<DemoState> {
  const { rows } = await pool.query<{ key: string; value: unknown }>(
    "SELECT key, value FROM demo_state WHERE key IN ('faults', 'campaign')",
  );
  const next: DemoState = { faults: {}, campaign: { id: 'none', enabled: false } };
  for (const r of rows) {
    if (r.key === 'faults') next.faults = r.value as DemoState['faults'];
    if (r.key === 'campaign') next.campaign = r.value as CampaignState;
  }
  return next;
}

/** Each service re-reads the demo state every 5 seconds. */
export function startStatePolling(pool: Pool, intervalMs = 5000) {
  const tick = async () => {
    try {
      const next = await readState(pool);
      const changed = JSON.stringify(next) !== JSON.stringify(state);
      state = next;
      if (changed) listeners.forEach((fn) => fn(state));
    } catch (err) {
      logger.warn({ err }, 'Failed to read demo state');
    }
  };
  void tick();
  setInterval(tick, intervalMs).unref();
}
