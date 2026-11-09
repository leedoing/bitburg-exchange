// Server-only DDSQL queries for the BI tab. Import from *.backend.ts files only.
// Every value interpolated into SQL comes from a fixed whitelist or a number; never pass frontend strings through.
import { tableQuery } from '@datadog/action-catalog/dd/ddsql';

import { BI_DIM_FIELD, type BiDim, type BiDirection, type BiFunnelRow, type BiLink, type BiMode, type BiView, type StepTiming, type Window } from '../shared/types';
import { ENV, RUM_APP_ID } from './dd';

const FILTER = `@application.id:${RUM_APP_ID} env:${ENV} @session.type:user`;
const MAX_KRW = 100_000_000;


/** Funnel steps after the entry step, per mode. Entry is "new visit" (action) or the home view (view). */
const STEPS: Record<BiMode, { entry: string; names: string[] }> = {
    action: { entry: '신규 방문', names: ['signup_completed', 'kyc_approved', 'deposit_completed', 'order_filled'] },
    view: { entry: 'home', names: ['signup', 'kyc', 'deposit', 'trade'] },
};

export function stepLabels(mode: BiMode): string[] {
    return [STEPS[mode].entry, ...STEPS[mode].names];
}

const lit = (ms: number) => `TIMESTAMP '${new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+00:00')}'`;

type Col = [field: string, type: string, alias: string];

function rum(eventType: 'view' | 'action', cols: Col[], w: Window, extraFilter = ''): string {
    const filter = extraFilter ? `${FILTER} ${extraFilter}` : FILTER;
    return `dd.rum(columns => ARRAY[${cols.map(([f]) => `'${f}'`).join(', ')}], event_type => '${eventType}',
        filter => '${filter}', from_timestamp => ${lit(w.from)}, to_timestamp => ${lit(w.to)})
        AS (${cols.map(([, t, a]) => `${a} ${t}`).join(', ')})`;
}

type Row = Record<string, unknown>;

async function run(sql: string): Promise<Row[]> {
    const res = await tableQuery({ inputs: { query: sql } });
    return (res.data ?? []) as Row[];
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Ordered, same-session funnel for new visitors (sessions that never opened the login view).
 * A session counts at step k only if it reached step k-1 first and step k happened at or after it.
 */
function funnelSql(w: Window, mode: BiMode, dim: BiDim): string {
    const dimField = BI_DIM_FIELD[dim];
    const names = STEPS[mode].names;
    const viewCols: Col[] = [
        ['@session.id', 'VARCHAR', 'sid'],
        ['timestamp', 'TIMESTAMP', 'ts'],
        ['@view.name', 'VARCHAR', 'vname'],
        ...(dimField ? ([[dimField, 'VARCHAR', 'dimv']] as Col[]) : []),
    ];
    const viewPivot =
        mode === 'view'
            ? names.map((n, i) => `MIN(CASE WHEN vname = '${n}' THEN EXTRACT(EPOCH FROM ts) END) AS t${i + 1}`).join(',\n            ')
            : '';
    const entry = mode === 'view' ? `MIN(CASE WHEN vname = 'home' THEN EXTRACT(EPOCH FROM ts) END)` : 'MIN(EXTRACT(EPOCH FROM ts))';
    const actionPivot =
        mode === 'action'
            ? names.map((n, i) => `MIN(CASE WHEN aname = '${n}' THEN t END) AS t${i + 1}`).join(',\n            ')
            : '';
    const tCols = [1, 2, 3, 4].map((i) => (mode === 'view' ? `s.t${i}` : `p.t${i}`));
    // tk is kept only when every earlier step happened in order.
    const ordered = tCols.map((_, k) => {
        const conds = [`${tCols[0]} IS NOT NULL`, `${tCols[0]} >= s.t0`];
        for (let i = 1; i <= k; i++) conds.push(`${tCols[i]} >= ${tCols[i - 1]}`);
        return `CASE WHEN ${conds.join(' AND ')} THEN ${tCols[k]} END AS t${k + 1}`;
    });
    const pct = (a: string, b: string, q: number) => `APPROX_PERCENTILE(${q}) WITHIN GROUP (ORDER BY ${b} - ${a})`;
    const timings = ['t0', 't1', 't2', 't3']
        .map((a, i) => `${pct(a, `t${i + 1}`, 0.5)} AS p50_${i}, ${pct(a, `t${i + 1}`, 0.9)} AS p90_${i}`)
        .join(',\n        ');

    return `WITH s AS (
        SELECT sid, ${entry} AS t0, ${dimField ? 'MIN(dimv)' : "'all'"} AS dim,
            MAX(CASE WHEN vname = 'login' THEN 1 ELSE 0 END) AS member${viewPivot ? `,\n            ${viewPivot}` : ''}
        FROM ${rum('view', viewCols, w)}
        GROUP BY sid
    ), a AS (
        SELECT sid, aname, EXTRACT(EPOCH FROM ts) AS t, dep, ord
        FROM ${rum(
            'action',
            [
                ['@session.id', 'VARCHAR', 'sid'],
                ['@action.name', 'VARCHAR', 'aname'],
                ['timestamp', 'TIMESTAMP', 'ts'],
                ['@context.deposit.amount_krw', 'DOUBLE', 'dep'],
                ['@context.order.amount_krw', 'DOUBLE', 'ord'],
            ],
            w,
            '@action.name:(signup_completed OR kyc_approved OR deposit_completed OR order_filled)',
        )}
    ), p AS (
        SELECT sid${actionPivot ? `,\n            ${actionPivot}` : ''},
            MIN(CASE WHEN aname = 'deposit_completed' AND dep <= ${MAX_KRW} THEN dep END) AS dep,
            SUM(CASE WHEN aname = 'order_filled' AND ord <= ${MAX_KRW} THEN ord ELSE 0 END) AS ordsum
        FROM a GROUP BY sid
    ), j AS (
        SELECT COALESCE(s.dim, '(none)') AS dim, s.t0,
            ${ordered.join(',\n            ')},
            p.dep, COALESCE(p.ordsum, 0) AS ordsum
        FROM s LEFT JOIN p ON s.sid = p.sid
        WHERE s.member = 0 AND s.t0 IS NOT NULL
    )
    SELECT dim, COUNT(*) AS s0, COUNT(t1) AS s1, COUNT(t2) AS s2, COUNT(t3) AS s3, COUNT(t4) AS s4,
        ${timings},
        ${pct('t0', 't4', 0.5)} AS p50_total, ${pct('t0', 't4', 0.9)} AS p90_total,
        AVG(CASE WHEN t3 IS NOT NULL THEN dep END) AS avg_dep,
        SUM(CASE WHEN t1 IS NOT NULL THEN ordsum ELSE 0 END) AS ord_total
    FROM j GROUP BY dim ORDER BY s0 DESC LIMIT 20`;
}

function toFunnelRow(r: Row): BiFunnelRow {
    const t = (i: number): StepTiming => [numOrNull(r[`p50_${i}`]), numOrNull(r[`p90_${i}`])];
    return {
        dim: String(r.dim ?? ''),
        steps: [0, 1, 2, 3, 4].map((i) => num(r[`s${i}`])),
        timings: [0, 1, 2, 3].map(t),
        total: [numOrNull(r.p50_total), numOrNull(r.p90_total)],
        avgFirstDepositKrw: num(r.avg_dep),
        orderKrw: num(r.ord_total),
    };
}

export async function funnel(w: Window, mode: BiMode, dim: BiDim): Promise<{ all: BiFunnelRow; rows: BiFunnelRow[] }> {
    const [allRows, rows] = await Promise.all([
        run(funnelSql(w, mode, 'none')),
        dim === 'none' ? Promise.resolve([] as Row[]) : run(funnelSql(w, mode, dim)),
    ]);
    const empty: BiFunnelRow = { dim: 'all', steps: [0, 0, 0, 0, 0], timings: [], total: [null, null], avgFirstDepositKrw: 0, orderKrw: 0 };
    return { all: allRows[0] ? toFunnelRow(allRows[0]) : empty, rows: rows.map(toFunnelRow) };
}

/**
 * View-to-view transitions around the first time a session opened `view`.
 * after: the view and up to 3 hops after it ('(exit)' when the session ended).
 * before: up to 3 hops that led into it.
 */
function pathsSql(w: Window, view: BiView, direction: BiDirection): string {
    const range = direction === 'after' ? 's.step >= x.xs AND s.step < x.xs + 4' : 's.step >= x.xs - 3 AND s.step < x.xs';
    return `WITH v AS (
        SELECT sid, vname, ts
        FROM ${rum(
            'view',
            [
                ['@session.id', 'VARCHAR', 'sid'],
                ['@view.name', 'VARCHAR', 'vname'],
                ['timestamp', 'TIMESTAMP', 'ts'],
            ],
            w,
        )}
    ), s AS (
        SELECT sid, vname, LEAD(vname) OVER (PARTITION BY sid ORDER BY ts) AS nxt,
            ROW_NUMBER() OVER (PARTITION BY sid ORDER BY ts) AS step
        FROM v
    ), x AS (
        SELECT sid, MIN(step) AS xs FROM s WHERE vname = '${view}' GROUP BY sid
    )
    SELECT s.step - x.xs AS rel, s.vname AS src, COALESCE(s.nxt, '(exit)') AS dst, COUNT(*) AS n,
        COUNT(DISTINCT s.sid) AS sessions
    FROM s JOIN x ON s.sid = x.sid
    WHERE ${range}
    GROUP BY s.step - x.xs, s.vname, COALESCE(s.nxt, '(exit)')
    ORDER BY rel, n DESC
    LIMIT 200`;
}

export async function paths(w: Window, view: BiView, direction: BiDirection): Promise<{ sessions: number; links: BiLink[] }> {
    const rows = await run(pathsSql(w, view, direction));
    const links = rows.map((r) => ({ step: num(r.rel), from: String(r.src ?? ''), to: String(r.dst ?? ''), n: num(r.n) }));
    // Sessions that reached `view`: every one of them has exactly one row at rel 0 (after) or rel -1 (before, if it had a prior view).
    const anchor = direction === 'after' ? 0 : -1;
    const sessions = links.filter((l) => l.step === anchor).reduce((s, l) => s + l.n, 0);
    return { sessions, links };
}
