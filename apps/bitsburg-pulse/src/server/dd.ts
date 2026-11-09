// Server-only helpers. Import these from *.backend.ts files only.
import { listEvents } from '@datadog/action-catalog/dd/events';
import { queryScalarData, queryTimeseriesData } from '@datadog/action-catalog/dd/metrics';
import { listMonitorsV2 } from '@datadog/action-catalog/dd/monitor';
import { listRUMEvents } from '@datadog/action-catalog/dd/rum';

import { DD_APP_URL, ENV, RUM_APP_ID } from '../shared/links';
import type { FaultWindow, RangeKey, ResolvedRange, Series, TimelineEvent, Window } from '../shared/types';

export { ENV, RUM_APP_ID };
export const APP_URL = DD_APP_URL;
export const RUM_BASE = `@application.id:${RUM_APP_ID} env:${ENV}`;

const MIN = 60_000;
const HOUR = 60 * MIN;

const iso = (ms: number) => new Date(ms).toISOString();

// ------------------------------------------------------------------ events and fault windows
const START_RE = /^\[Bitsburg\] (장애 주입|캠페인) 시작: (\S+)$/;
const END_RE = /^\[Bitsburg\] (장애 주입|캠페인) 종료: (\S+)$/;
const KNOWN = new Set(['kyc_vendor_slow', 'deposit_delay', 'listing_spike', 'listing_pups', 'promo_deposit_bonus']);

export async function getTimeline(now: number): Promise<TimelineEvent[]> {
    const res = await listEvents({
        inputs: { time: { from: iso(now - 24 * HOUR), to: iso(now) }, tags: 'source:bitsburg-admin' },
    });
    const events = (res as { events?: { title?: string; date_happened?: number; alert_type?: string }[] }).events ?? [];
    return events
        .map((e) => {
            const ts = (e.date_happened ?? 0) * 1000;
            return { ts, title: e.title ?? '', alertType: e.alert_type ?? 'info', url: eventExplorerUrl(ts - 2 * MIN, ts + 2 * MIN) };
        })
        .filter((e) => {
            const m = START_RE.exec(e.title) ?? END_RE.exec(e.title);
            return m !== null && KNOWN.has(m[2]);
        })
        .sort((a, b) => a.ts - b.ts);
}

export function eventExplorerUrl(from: number, to: number): string {
    const q = encodeURIComponent('source:bitsburg-admin');
    return `${APP_URL}/event/explorer?query=${q}&from_ts=${from}&to_ts=${to}&live=false`;
}

export function faultWindows(timeline: TimelineEvent[]): FaultWindow[] {
    const open = new Map<string, FaultWindow>();
    const done: FaultWindow[] = [];
    for (const e of timeline) {
        const s = START_RE.exec(e.title);
        if (s) {
            const kind = s[1] === '캠페인' ? 'campaign' : 'fault';
            if (!open.has(s[2])) open.set(s[2], { name: s[2], kind, start: e.ts, end: null });
            continue;
        }
        const t = END_RE.exec(e.title);
        if (t && open.has(t[2])) {
            const w = open.get(t[2])!;
            w.end = e.ts;
            done.push(w);
            open.delete(t[2]);
        }
    }
    return [...done, ...open.values()].sort((a, b) => a.start - b.start);
}

export function resolveRange(key: RangeKey, now: number, windows: FaultWindow[]): ResolvedRange {
    if (key === 'fault') {
        const faults = windows.filter((w) => w.kind === 'fault');
        const last = faults[faults.length - 1];
        if (last) {
            const end = last.end ?? now;
            return {
                key,
                window: { from: last.start - 15 * MIN, to: Math.min(now, end + 10 * MIN) },
                label: `장애 구간 (${last.name})`,
            };
        }
        return { key, window: { from: now - HOUR, to: now }, label: '최근 1시간', note: '최근 24시간 동안 장애 구간이 없어 최근 1시간을 보여 줍니다.' };
    }
    const hours = key === '24h' ? 24 : key === '6h' ? 6 : 1;
    return { key, window: { from: now - hours * HOUR, to: now }, label: `최근 ${hours}시간` };
}

export async function loadContext(key: RangeKey) {
    const now = Date.now();
    const timeline = await getTimeline(now);
    const windows = faultWindows(timeline);
    return { now, timeline, windows, range: resolveRange(key, now, windows) };
}

// ------------------------------------------------------------------ metrics and RUM queries
type MetricQ = { kind: 'metric'; query: string; aggregator?: 'avg' | 'sum' | 'max' | 'min' | 'last' | 'percentile' };
type RumQ = {
    kind: 'rum';
    query: string;
    aggregation?: 'count' | 'cardinality' | 'avg' | 'sum' | 'max' | 'pc95';
    metric?: string;
    groupBy?: string;
    groupLimit?: number;
};
export type Q = MetricQ | RumQ;

export const m = (query: string, aggregator: MetricQ['aggregator'] = 'sum'): MetricQ => ({ kind: 'metric', query, aggregator });
export const sessions = (query: string, groupBy?: string): RumQ => ({
    kind: 'rum',
    query: `${RUM_BASE} ${query}`,
    aggregation: 'cardinality',
    metric: '@session.id',
    groupBy,
});

/** Average amount from RUM actions, ignoring values above the 1억 input cap (pre-cap typos). */
export const rumAvgKrw = (actionName: string, attr: string): RumQ => ({
    kind: 'rum',
    query: `${RUM_BASE} @type:action @action.name:${actionName} ${attr}:[1 TO 100000000]`,
    aggregation: 'avg',
    metric: attr,
});

function toQuery(q: Q, name: string, scalar: boolean) {
    if (q.kind === 'metric') {
        return scalar
            ? { data_source: 'metrics' as const, name, query: q.query, aggregator: q.aggregator ?? 'sum' }
            : { data_source: 'metrics' as const, name, query: q.query };
    }
    return {
        data_source: 'rum' as const,
        name,
        compute: { aggregation: q.aggregation ?? 'count', ...(q.metric ? { metric: q.metric } : {}) },
        search: { query: q.query },
        indexes: ['*'],
        ...(q.groupBy ? { group_by: [{ facet: q.groupBy, limit: q.groupLimit ?? 10 }] } : {}),
    };
}

type Column = { type?: string; name?: string; values?: unknown[] };

/** One scalar value per query (no grouping). Missing values become 0. */
export async function scalars<K extends string>(qs: Record<K, Q>, w: Window): Promise<Record<K, number>> {
    const keys = Object.keys(qs) as K[];
    const res = await queryScalarData({
        inputs: {
            range: { from: iso(w.from), to: iso(w.to) },
            queries: keys.map((k, i) => toQuery(qs[k], `q${i}`, true)),
            formulas: keys.map((_, i) => ({ formula: `q${i}` })),
        },
    } as Parameters<typeof queryScalarData>[0]);
    const cols = ((res.data?.attributes?.columns ?? []) as Column[]).filter((c) => c.type === 'number');
    const out = {} as Record<K, number>;
    keys.forEach((k, i) => {
        const v = cols[i]?.values?.[0];
        out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    });
    return out;
}

/** One grouped scalar query: returns { groupValue: number }. */
export async function grouped(q: Q, w: Window): Promise<Record<string, number>> {
    const res = await queryScalarData({
        inputs: {
            range: { from: iso(w.from), to: iso(w.to) },
            queries: [toQuery(q, 'q0', true)],
            formulas: [{ formula: 'q0' }],
        },
    } as Parameters<typeof queryScalarData>[0]);
    const cols = (res.data?.attributes?.columns ?? []) as Column[];
    const groupCols = cols.filter((c) => c.type === 'group');
    const num = cols.find((c) => c.type === 'number');
    const out: Record<string, number> = {};
    (num?.values ?? []).forEach((v, i) => {
        const label = groupCols.map((g) => (g.values?.[i] as string[] | undefined)?.join(',') ?? '').join(' / ') || 'all';
        out[label] = typeof v === 'number' ? v : 0;
    });
    return out;
}

/** Distinct RUM session ids matching a query (capped at `limit`). */
export async function sessionIds(query: string, w: Window, limit = 1000): Promise<Set<string>> {
    const rows = await grouped({ ...sessions(query, '@session.id'), groupLimit: limit }, w);
    return new Set(Object.keys(rows).filter((k) => k && k !== 'all'));
}

/** Timeseries for one or more queries (and optional formula). Each group becomes a series. */
export async function timeseries(
    qs: Record<string, Q>,
    w: Window,
    opts: { formula?: string; label?: string; intervalMs?: number } = {},
): Promise<Series[]> {
    const keys = Object.keys(qs);
    // Query names must be identifiers; non-identifier keys are display labels only.
    const names = keys.map((k, i) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `q${i}`));
    const interval = opts.intervalMs ?? pickInterval(w);
    const res = await queryTimeseriesData({
        inputs: {
            range: { from: iso(w.from), to: iso(w.to) },
            interval,
            queries: keys.map((k, i) => toQuery(qs[k], names[i], false)),
            formulas: opts.formula ? [{ formula: opts.formula }] : names.map((n) => ({ formula: n })),
        },
    } as Parameters<typeof queryTimeseriesData>[0]);
    const attrs = res.data?.attributes ?? {};
    const times = (attrs.times ?? []) as number[];
    const values = (attrs.values ?? []) as (number | null)[][];
    return (attrs.series ?? []).map((s, i) => {
        const tags = (s.group_tags ?? []).map((t) => t.split(':').slice(1).join(':') || t);
        const base = opts.formula ? opts.label ?? 'value' : keys[s.query_index ?? i] ?? `s${i}`;
        return {
            label: tags.length ? tags.join(' / ') : base,
            points: times.map((t, j) => [t, values[i]?.[j] ?? 0] as [number, number]),
        };
    });
}

export function pickInterval(w: Window): number {
    const span = w.to - w.from;
    if (span <= 2 * HOUR) return MIN;
    if (span <= 8 * HOUR) return 5 * MIN;
    return 15 * MIN;
}

// ------------------------------------------------------------------ monitors and sessions
export async function bitsburgMonitors() {
    type Row = { id?: number; name?: string; overall_state?: string };
    const res = (await listMonitorsV2({ inputs: { monitor_tags: 'team:bitsburg', limit: 20 } })) as unknown;
    const rows: Row[] = Array.isArray(res) ? res : ((res as { monitors?: Row[] })?.monitors ?? []);
    return rows.map((mo) => ({
        id: mo.id ?? 0,
        name: mo.name ?? '',
        state: mo.overall_state ?? 'Unknown',
        url: `${APP_URL}/monitors/${mo.id}`,
    }));
}

const ALERT_PREFIX_RE = /^\[(Triggered|Re-Triggered|Recovered|Warn|No Data|Re-Notified)[^\]]*\] /;

/** Monitor transitions (Triggered/Recovered/...) for [Bitsburg] monitors in the last 24 hours, newest first. */
export async function monitorAlerts(now: number, monitors: { name: string; url: string }[]): Promise<TimelineEvent[]> {
    const res = await listEvents({ inputs: { time: { from: iso(now - 24 * HOUR), to: iso(now) }, sources: 'alert' } });
    const events = (res as { events?: { title?: string; date_happened?: number; alert_type?: string }[] }).events ?? [];
    const byName = new Map(monitors.map((mo) => [mo.name, mo.url]));
    return events
        .filter((e) => (e.title ?? '').includes('[Bitsburg]'))
        .map((e) => {
            const title = e.title ?? '';
            const name = title.replace(ALERT_PREFIX_RE, '');
            return {
                ts: (e.date_happened ?? 0) * 1000,
                title,
                alertType: e.alert_type ?? 'info',
                url: byName.get(name) ?? `${APP_URL}/monitors/manage?q=${encodeURIComponent('tag:"team:bitsburg"')}`,
            };
        })
        .sort((a, b) => b.ts - a.ts);
}

export async function dropoutSessions(w: Window, limit = 8) {
    const res = await listRUMEvents({
        inputs: {
            filter_query: `${RUM_BASE} @type:action @action.name:(kyc_failed OR deposit_stuck OR cs_contact_opened) @session.has_replay:true`,
            time: { from: iso(w.from), to: iso(w.to) },
            sort: '-timestamp',
            page_limit: 50,
        },
    });
    const rows = ((res as { data?: unknown[] }).data ?? []) as {
        attributes?: {
            timestamp?: string;
            version?: string;
            tags?: string[];
            attributes?: { session?: { id?: string }; action?: { name?: string }; version?: string };
        };
    }[];
    const versionOf = (r: (typeof rows)[number]) =>
        r.attributes?.attributes?.version ??
        r.attributes?.version ??
        r.attributes?.tags?.find((t) => t.startsWith('version:'))?.slice('version:'.length) ??
        '';
    const seen = new Set<string>();
    const out: { sessionId: string; version: string; reason: string; ts: number; url: string }[] = [];
    for (const r of rows) {
        const a = r.attributes?.attributes;
        const id = a?.session?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const ts = Date.parse(r.attributes?.timestamp ?? '') || 0;
        out.push({
            sessionId: id,
            version: versionOf(r),
            reason: a?.action?.name ?? '',
            ts,
            url: `${APP_URL}/rum/replay/sessions/${id}?applicationId=${RUM_APP_ID}&ts=${ts}`,
        });
        if (out.length >= limit) break;
    }
    return out;
}
