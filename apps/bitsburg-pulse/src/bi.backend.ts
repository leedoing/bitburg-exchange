import { funnel, paths, stepLabels } from './server/bi';
import { grouped, loadContext, MAX_KRW, RUM_BASE } from './server/dd';
import {
    BI_DIMS,
    BI_MODES,
    BI_VIEWS,
    type BiDim,
    type BiDirection,
    type BiFunnelData,
    type BiMode,
    type BiPathsData,
    type BiView,
    type RangeKey,
} from './shared/types';

const RANGES: RangeKey[] = ['1h', '6h', '24h', 'fault'];
const pick = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export async function getBiFunnel(rangeKey: string, modeKey: string, dimKey: string): Promise<BiFunnelData> {
    const range = pick(RANGES, rangeKey, '6h');
    const mode: BiMode = pick(BI_MODES, modeKey, 'action');
    const dim: BiDim = pick(BI_DIMS, dimKey, 'version');
    const ctx = await loadContext(range);
    const w = ctx.range.window;
    const action = (name: string) => `${RUM_BASE} @session.type:user @type:action @action.name:${name}`;
    const [f, kyc, order, stuck, tierCount, tierAvg] = await Promise.all([
        funnel(w, mode, dim),
        grouped({ kind: 'rum', query: action('kyc_failed'), aggregation: 'count', groupBy: '@context.kyc.reason' }, w),
        grouped({ kind: 'rum', query: action('order_failed'), aggregation: 'count', groupBy: '@context.order.reason' }, w),
        grouped({ kind: 'rum', query: action('deposit_stuck'), aggregation: 'count' }, w),
        grouped({ kind: 'rum', query: action('order_filled'), aggregation: 'count', groupBy: '@usr.tier' }, w),
        grouped(
            {
                kind: 'rum',
                query: `${action('order_filled')} @context.order.amount_krw:[1 TO ${MAX_KRW}]`,
                aggregation: 'avg',
                metric: '@context.order.amount_krw',
                groupBy: '@usr.tier',
            },
            w,
        ),
    ]);
    const tiers = Object.entries(tierCount)
        .filter(([t]) => t && t !== 'all')
        .map(([tier, orders]) => ({ tier, orders, avgKrw: tierAvg[tier] ?? 0 }))
        .sort((a, b) => b.orders - a.orders);
    return {
        range: ctx.range,
        mode,
        dim,
        stepLabels: stepLabels(mode),
        all: f.all,
        rows: f.rows,
        reasons: { kyc, order, depositStuck: Object.values(stuck)[0] ?? 0 },
        tiers,
    };
}

export async function getBiPaths(rangeKey: string, viewKey: string, directionKey: string): Promise<BiPathsData> {
    const range = pick(RANGES, rangeKey, '6h');
    const view: BiView = pick(BI_VIEWS, viewKey, 'home');
    const direction: BiDirection = directionKey === 'before' ? 'before' : 'after';
    const ctx = await loadContext(range);
    const p = await paths(ctx.range.window, view, direction);
    return { range: ctx.range, view, direction, ...p };
}
