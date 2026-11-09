import { request } from '@datadog/action-catalog/http/http';

import { ADMIN_BASE_URL, ADMIN_CONNECTION_ID } from './server/config';
import type { AdminState } from './shared/types';

const FAULTS = new Set(['kyc_vendor_slow', 'deposit_delay', 'listing_spike']);
const CAMPAIGNS = new Set(['listing_pups', 'promo_deposit_bonus']);

type RawState = {
    faults?: { name: string; enabled: boolean; intensity: number; remainingSec: number; expiresAt: string | null }[];
    campaign?: { id?: string | null; enabled?: boolean; remainingSec?: number } | null;
    serverTime?: string;
};

function toState(body: RawState): AdminState {
    return {
        ok: true,
        faults: (body.faults ?? []).map((f) => ({
            name: f.name,
            enabled: Boolean(f.enabled),
            intensity: Number(f.intensity ?? 0),
            remainingSec: Number(f.remainingSec ?? 0),
            expiresAt: f.expiresAt ?? null,
        })),
        campaign: body.campaign
            ? { id: body.campaign.id ?? null, enabled: Boolean(body.campaign.enabled), remainingSec: Number(body.campaign.remainingSec ?? 0) }
            : null,
        serverTime: body.serverTime,
    };
}

async function call(verb: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<AdminState> {
    try {
        const res = await request({
            connectionId: ADMIN_CONNECTION_ID,
            inputs: {
                verb,
                url: `${ADMIN_BASE_URL}${path}`,
                responseParsing: 'json',
                errorOnStatus: ['400-599'],
                ...(body
                    ? { body: JSON.stringify(body), requestHeaders: [{ key: 'Content-Type', value: ['application/json'] }] }
                    : {}),
            },
        });
        return toState(res.body as RawState);
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), faults: [], campaign: null };
    }
}

export async function getAdminState(): Promise<AdminState> {
    return call('GET', '/admin/state');
}

export async function setFault(name: string, enabled: boolean, intensity: number, durationMin: number): Promise<AdminState> {
    if (!FAULTS.has(name)) return { ok: false, error: `unknown fault ${name}`, faults: [], campaign: null };
    const i = Math.min(1, Math.max(0.1, Number(intensity) || 0.7));
    const d = Math.min(60, Math.max(1, Math.round(Number(durationMin) || 15)));
    return call('POST', '/admin/faults', { fault: name, enabled: Boolean(enabled), intensity: i, durationMin: d });
}

export async function setCampaign(id: string, enabled: boolean, durationMin: number): Promise<AdminState> {
    if (!CAMPAIGNS.has(id)) return { ok: false, error: `unknown campaign ${id}`, faults: [], campaign: null };
    const d = Math.min(60, Math.max(1, Math.round(Number(durationMin) || 15)));
    return call('POST', '/admin/campaign', { id, enabled: Boolean(enabled), durationMin: d });
}
