import {
    bitsburgMonitors,
    dropoutSessions,
    ENV,
    grouped,
    krwSum,
    loadContext,
    m,
    monitorAlerts,
    pickInterval,
    RUM_BASE,
    rumAvgKrw,
    scalars,
    sessionIds,
    sessions,
    timeseries,
} from './server/dd';
import type {
    CampaignData,
    ExecData,
    FaultWindow,
    ImpactCard,
    Level,
    OpsData,
    PmData,
    RangeKey,
    Series,
    SituationData,
    StageSignal,
    Window,
} from './shared/types';
import { asRangeKey } from './shared/types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const asRange = (r: unknown): RangeKey => asRangeKey(r);

const e = `env:${ENV}`;

/** Spec baseline (DATA_SPEC 8): signup→KYC 80%, KYC→first deposit 65%. */
const SPEC_SIGNUP_TO_DEPOSIT = 0.8 * 0.65;

// ------------------------------------------------------------------ live stage signals (last 5 minutes)
async function stageSignals(now: number): Promise<StageSignal[]> {
    const w5: Window = { from: now - 5 * MIN, to: now };
    const w15: Window = { from: now - 15 * MIN, to: now };
    const [a, b] = await Promise.all([
        scalars(
            {
                kycAvgV2: m(`avg:bitsburg.kyc.wait_ms{${e},flow:v2}`, 'avg'),
                kycAvgV1: m(`avg:bitsburg.kyc.wait_ms{${e},flow:v1}`, 'avg'),
                kycTimeouts: m(`sum:bitsburg.kyc.result{${e},reason:timeout}.as_count()`),
                kycTotal: m(`sum:bitsburg.kyc.result{${e}}.as_count()`),
                pendingMax: m(`max:bitsburg.deposit.pending_seconds{${e}}`, 'max'),
                pendingCount: m(`max:bitsburg.deposit.pending_count{${e}}`, 'max'),
                orderP95: m(`p95:trace.express.request{service:bitsburg-order,${e}}`, 'avg'),
                orderFailed: m(`sum:bitsburg.order.failed{${e}}.as_count()`),
                orderPlaced: m(`sum:bitsburg.order.placed{${e}}.as_count()`),
            },
            w5,
        ),
        scalars(
            {
                signups: m(`sum:bitsburg.signup.completed{${e}}.as_count()`),
                depositDone: m(`sum:bitsburg.deposit.completed{${e}}.as_count()`),
            },
            w15,
        ),
    ]);

    const signup: StageSignal = {
        key: 'signup',
        label: '가입',
        level: b.signups > 0 ? 'ok' : 'idle',
        headline: `최근 15분 가입 ${Math.round(b.signups)}건`,
        detail: '가입 완료 건수 기준',
        count: b.signups,
    };

    const kycLevel: Level =
        a.kycTotal === 0 ? 'idle' : a.kycAvgV2 >= 8000 || a.kycTimeouts >= 2 ? 'bad' : a.kycAvgV2 >= 4000 || a.kycTimeouts >= 1 ? 'warn' : 'ok';
    const kyc: StageSignal = {
        key: 'kyc',
        label: 'KYC',
        level: kycLevel,
        headline: `3.5.0(v2) 평균 대기 ${(a.kycAvgV2 / 1000).toFixed(1)}초`,
        detail: `3.4.2(v1) ${(a.kycAvgV1 / 1000).toFixed(1)}초 · 최근 5분 타임아웃 ${Math.round(a.kycTimeouts)}건 / ${Math.round(a.kycTotal)}건`,
        count: a.kycTotal,
    };

    const depLevel: Level = a.pendingMax >= 45 ? 'bad' : a.pendingMax >= 20 ? 'warn' : b.depositDone === 0 && a.pendingCount === 0 ? 'idle' : 'ok';
    const deposit: StageSignal = {
        key: 'deposit',
        label: '입금',
        level: depLevel,
        headline: `입금 대기 최장 ${Math.round(a.pendingMax)}초`,
        detail: `대기 중 ${Math.round(a.pendingCount)}건 · 최근 15분 완료 ${Math.round(b.depositDone)}건`,
        count: b.depositDone,
    };

    const failRate = a.orderPlaced > 0 ? a.orderFailed / a.orderPlaced : 0;
    const orderLevel: Level =
        a.orderPlaced === 0 ? 'idle' : a.orderP95 >= 1 || failRate >= 0.05 ? 'bad' : a.orderP95 >= 0.5 || failRate >= 0.01 ? 'warn' : 'ok';
    const order: StageSignal = {
        key: 'order',
        label: '주문',
        level: orderLevel,
        headline: `주문 p95 ${a.orderP95 >= 1 ? `${a.orderP95.toFixed(2)}초` : `${Math.round(a.orderP95 * 1000)}ms`}`,
        detail: `최근 5분 실패율 ${(failRate * 100).toFixed(1)}% (${Math.round(a.orderFailed)}/${Math.round(a.orderPlaced)})`,
        count: a.orderPlaced,
    };

    return [signup, kyc, deposit, order];
}

function activeOf(windows: FaultWindow[]) {
    return {
        activeFaults: windows.filter((w) => w.kind === 'fault' && w.end === null),
        activeCampaign: windows.find((w) => w.kind === 'campaign' && w.end === null) ?? null,
    };
}

// ------------------------------------------------------------------ 상황판
export async function getSituation(rangeKey: string): Promise<SituationData> {
    const ctx = await loadContext(asRange(rangeKey));
    const w = ctx.range.window;
    const [stages, tiles, trend, alerts] = await Promise.all([
        stageSignals(ctx.now),
        scalars(
            {
                signups: m(`sum:bitsburg.signup.completed{${e}}.as_count()`),
                kycApproved: m(`sum:bitsburg.kyc.result{${e},result:approved}.as_count()`),
                deposits: m(`sum:bitsburg.deposit.completed{${e}}.as_count()`),
                depositKrw: krwSum('deposit'),
                orders: m(`sum:bitsburg.order.filled{${e}}.as_count()`),
                orderKrw: krwSum('order'),
            },
            w,
        ),
        timeseries(
            {
                가입: m(`sum:bitsburg.signup.completed{${e}}.as_count()`),
                'KYC 승인': m(`sum:bitsburg.kyc.result{${e},result:approved}.as_count()`),
                '입금 완료': m(`sum:bitsburg.deposit.completed{${e}}.as_count()`),
                '주문 체결': m(`sum:bitsburg.order.filled{${e}}.as_count()`),
            },
            w,
        ),
        bitsburgMonitors().then((mons) => monitorAlerts(ctx.now, mons)),
    ]);
    return {
        range: ctx.range,
        now: ctx.now,
        stages,
        ...activeOf(ctx.windows),
        windows: ctx.windows,
        timeline: [...ctx.timeline, ...alerts].sort((a, b) => b.ts - a.ts).slice(0, 12),
        tiles,
        trend,
    };
}

// ------------------------------------------------------------------ 운영 · CS
export async function getOps(rangeKey: string): Promise<OpsData> {
    const ctx = await loadContext(asRange(rangeKey));
    const w = ctx.range.window;
    const [stages, now, pendingSeries, csSeries, csTotal, monitors] = await Promise.all([
        stageSignals(ctx.now),
        scalars(
            {
                pendingMax: m(`max:bitsburg.deposit.pending_seconds{${e}}`, 'last'),
                pendingCount: m(`max:bitsburg.deposit.pending_count{${e}}`, 'last'),
            },
            { from: ctx.now - 2 * MIN, to: ctx.now },
        ),
        timeseries({ '입금 대기 최장(초)': m(`max:bitsburg.deposit.pending_seconds{${e}}`) }, w),
        timeseries({ cs: m(`sum:bitsburg.cs.contact{${e}} by {topic}.as_count()`) }, w),
        grouped(m(`sum:bitsburg.cs.contact{${e}} by {topic}.as_count()`), w),
        bitsburgMonitors(),
    ]);
    const alerts = await monitorAlerts(ctx.now, monitors);
    return {
        range: ctx.range,
        windows: ctx.windows,
        pendingMaxNow: now.pendingMax,
        pendingCountNow: now.pendingCount,
        pendingSeries,
        csSeries,
        csTotal,
        stages,
        monitors,
        alerts,
    };
}

// ------------------------------------------------------------------ PM · DA
const FUNNEL_ACTIONS = ['signup_completed', 'kyc_approved', 'deposit_completed', 'order_filled'] as const;

const VERSIONS = ['3.4.2', '3.5.0'];

/** Sessions that signed up, and how many of those also made a first deposit in the same session. */
async function signupToDeposit(w: Window): Promise<{ signup: number; deposit: number }> {
    const [s, d] = await Promise.all([
        sessionIds(`@type:action @action.name:${FUNNEL_ACTIONS[0]}`, w),
        sessionIds(`@type:action @action.name:${FUNNEL_ACTIONS[2]}`, w, 5000),
    ]);
    return { signup: s.size, deposit: [...s].filter((id) => d.has(id)).length };
}

/** Same-session funnel: later steps only count sessions that also completed signup (and every earlier step). */
async function funnelByVersion(w: Window) {
    const [signupSets, stepSets] = await Promise.all([
        Promise.all(VERSIONS.map((v) => sessionIds(`@type:action @action.name:${FUNNEL_ACTIONS[0]} version:${v}`, w))),
        Promise.all(FUNNEL_ACTIONS.slice(1).map((a) => sessionIds(`@type:action @action.name:${a}`, w, 5000))),
    ]);
    return VERSIONS.map((version, vi) => {
        let cohort = signupSets[vi];
        const steps = [cohort.size];
        for (const set of stepSets) {
            cohort = new Set([...cohort].filter((id) => set.has(id)));
            steps.push(cohort.size);
        }
        return { version, steps };
    });
}

export async function getPm(rangeKey: string): Promise<PmData> {
    const ctx = await loadContext(asRange(rangeKey));
    const w = ctx.range.window;
    const baselineWindow: Window = { from: w.from - 24 * HOUR, to: w.from };
    const [funnel, baseline, avg, replays, kycByVersion] = await Promise.all([
        funnelByVersion(w),
        funnelByVersion(baselineWindow),
        scalars({ avgDeposit: rumAvgKrw('deposit_completed', '@context.deposit.amount_krw') }, { from: ctx.now - 24 * HOUR, to: ctx.now }),
        dropoutSessions(w),
        timeseries(
            {
                ok: m(`sum:bitsburg.kyc.result{${e},result:approved} by {app_version}.as_count()`),
                all: m(`sum:bitsburg.kyc.result{${e}} by {app_version}.as_count()`),
            },
            w,
            { formula: '100 * ok / all', label: 'KYC 성공률', intervalMs: Math.max(5 * MIN, pickInterval(w)) },
        ),
    ]);
    const sum = (rows: { steps: number[] }[]) => FUNNEL_ACTIONS.map((_, i) => rows.reduce((s, r) => s + r.steps[i], 0));
    return {
        range: ctx.range,
        baselineWindow,
        windows: ctx.windows,
        steps: ['가입 완료', 'KYC 승인', '첫 입금', '첫 주문 체결'],
        funnel,
        total: sum(funnel),
        baselineTotal: sum(baseline),
        avgDepositKrw: avg.avgDeposit,
        replays,
        kycByVersion,
    };
}

// ------------------------------------------------------------------ 캠페인
/** DD_HOSTNAME of the EC2 demo host (infra/host/bitsburg-deploy.sh). */
const INFRA_HOST = 'bitsburg-demo';
/** Containers on the order path, labelled with their DATA_SPEC service names. traffic-gen and pulse are left out. */
const ORDER_PATH_CONTAINERS: Record<string, string> = {
    'bitsburg-api-gateway-1': 'bitsburg-api-gateway',
    'bitsburg-order-1': 'bitsburg-order',
    'bitsburg-matching-engine-1': 'bitsburg-matching',
    'bitsburg-postgres-1': 'postgres (주문 DB)',
};
const orderPath = (series: Series[]) =>
    series.filter((s) => ORDER_PATH_CONTAINERS[s.label]).map((s) => ({ ...s, label: ORDER_PATH_CONTAINERS[s.label] }));

async function infraSeries(w: Window): Promise<CampaignData['infra']> {
    const h = `host:${INFRA_HOST}`;
    const [cpu, mem, cCpu, cMem, poolWarn] = await Promise.all([
        timeseries({ u: m(`avg:system.cpu.user{${h}}`), s: m(`avg:system.cpu.system{${h}}`) }, w, { formula: 'u + s', label: '호스트 CPU' }),
        timeseries({ p: m(`avg:system.mem.pct_usable{${h}}`) }, w, { formula: '100 * (1 - p)', label: '호스트 메모리' }),
        // container.cpu.usage is nanocores: 1e7 = 1% of one vCPU.
        timeseries({ c: m(`sum:container.cpu.usage{${h}} by {container_name}`) }, w, { formula: 'c / 10000000', label: 'CPU' }),
        timeseries({ c: m(`sum:container.memory.usage{${h}} by {container_name}`) }, w, { formula: 'c / 1048576', label: '메모리' }),
        timeseries({ 'DB 풀 고갈 경고': { kind: 'logs', query: `${e} service:bitsburg-order "Order DB pool exhausted"`, aggregation: 'count' } }, w),
    ]);
    return { host: [...cpu, ...mem], cpu: orderPath(cCpu), mem: orderPath(cMem), poolWarn };
}

export async function getCampaign(rangeKey: string): Promise<CampaignData> {
    const ctx = await loadContext(asRange(rangeKey));
    const w = ctx.range.window;
    const [sess, signups, orders, orderKrw, orderP95, orderFailRate, totSess, totOrders, totKrw, infra] = await Promise.all([
        timeseries({ s: sessions('@type:session', '@context.campaign.id') }, w),
        timeseries({ s: m(`sum:bitsburg.signup.completed{${e}} by {campaign}.as_count()`) }, w),
        timeseries({ s: m(`sum:bitsburg.order.filled{${e}} by {campaign}.as_count()`) }, w),
        timeseries({ s: krwSum('order', '@campaign.id') }, w),
        timeseries({ p95: m(`p95:trace.express.request{service:bitsburg-order,${e}}`) }, w, { formula: 'p95', label: '주문 p95(초)' }),
        timeseries(
            { f: m(`sum:bitsburg.order.failed{${e}}.as_count()`), p: m(`sum:bitsburg.order.placed{${e}}.as_count()`) },
            w,
            { formula: '100 * f / p', label: '주문 실패율(%)' },
        ),
        grouped(sessions('@type:session', '@context.campaign.id'), w),
        grouped(m(`sum:bitsburg.order.filled{${e}} by {campaign}.as_count()`), w),
        grouped(krwSum('order', '@campaign.id'), w),
        infraSeries(w),
    ]);
    const isCampaign = (k: string) => k !== 'none' && k !== 'N/A' && k !== 'all' && k !== '';
    const split = (rec: Record<string, number>) =>
        Object.entries(rec).reduce(
            (acc, [k, v]) => {
                if (isCampaign(k)) acc.c += v;
                else acc.n += v;
                return acc;
            },
            { c: 0, n: 0 },
        );
    const s = split(totSess);
    const o = split(totOrders);
    const k = split(totKrw);
    return {
        range: ctx.range,
        windows: ctx.windows,
        sessions: sess,
        signups,
        orders,
        orderKrw,
        orderP95,
        orderFailRate,
        infra,
        totals: {
            campaign: { sessions: s.c, orders: o.c, krw: k.c },
            normal: { sessions: s.n, orders: o.n, krw: k.n },
        },
    };
}

// ------------------------------------------------------------------ 경영 요약
const FAULT_LABELS: Record<string, string> = {
    kyc_vendor_slow: 'KYC 벤더 지연 (3.5.0)',
    deposit_delay: '원화 입금 지연',
    listing_spike: '신규 상장 트래픽 폭증',
};
const FAULT_OPERATION: Record<string, string> = {
    kyc_vendor_slow: 'kyc_verification',
    deposit_delay: 'krw_deposit',
    listing_spike: 'place_order',
};

async function impactOf(w: FaultWindow, now: number, avgDeposit: number, avgOrder: number, baselineConv: number): Promise<ImpactCard> {
    const win: Window = { from: w.start, to: w.end ?? now };
    const op = FAULT_OPERATION[w.name] ?? 'kyc_verification';
    const [r, f, conv] = await Promise.all([
        scalars(
            {
                affected: sessions(`@type:operation @operation.name:${op} @operation.status:failure`),
                failed: { kind: 'rum', query: `${RUM_BASE} @type:operation @operation.name:${op} @operation.status:failure`, aggregation: 'count' },
            },
            win,
        ),
        scalars({ orderFailed: m(`sum:bitsburg.order.failed{${e}}.as_count()`) }, win),
        signupToDeposit(win),
    ]);
    let lostKrw = 0;
    let note = '';
    if (w.name === 'listing_spike') {
        lostKrw = f.orderFailed * avgOrder;
        note = `실패 주문 ${Math.round(f.orderFailed)}건 × 평균 주문액`;
    } else {
        const expectedDrop = conv.signup * (1 - baselineConv);
        const actualDrop = Math.max(0, conv.signup - conv.deposit);
        lostKrw = Math.max(0, actualDrop - expectedDrop) * avgDeposit;
        note = `가입 ${conv.signup}명 중 첫 입금 ${conv.deposit}명 (평시 기대 ${Math.round(conv.signup * baselineConv)}명)`;
    }
    return {
        fault: w.name,
        label: FAULT_LABELS[w.name] ?? w.name,
        start: w.start,
        end: w.end,
        affectedUsers: r.affected,
        failedCount: r.failed,
        lostKrw,
        note,
    };
}

export async function getExec(rangeKey: string): Promise<ExecData> {
    const ctx = await loadContext(asRange(rangeKey));
    const day: Window = { from: ctx.now - 24 * HOUR, to: ctx.now };
    const [today, conv] = await Promise.all([
        scalars(
            {
                signups: m(`sum:bitsburg.signup.completed{${e}}.as_count()`),
                firstDeposits: m(`sum:bitsburg.deposit.completed{${e}}.as_count()`),
                depositKrw: krwSum('deposit'),
                orders: m(`sum:bitsburg.order.filled{${e}}.as_count()`),
                orderKrw: krwSum('order'),
                avgDeposit: rumAvgKrw('deposit_completed', '@context.deposit.amount_krw'),
                avgOrder: rumAvgKrw('order_filled', '@context.order.amount_krw'),
            },
            day,
        ),
        signupToDeposit(day),
    ]);
    const baselineConv = conv.signup >= 20 ? conv.deposit / conv.signup : SPEC_SIGNUP_TO_DEPOSIT;
    const faults = ctx.windows.filter((w) => w.kind === 'fault' && (w.end ?? ctx.now) >= day.from).slice(-6);
    const cards = await Promise.all(faults.map((w) => impactOf(w, ctx.now, today.avgDeposit, today.avgOrder, baselineConv)));
    const totalLoss = cards.reduce((s, c) => s + c.lostKrw, 0);
    const active = faults.filter((f) => f.end === null);
    const won = (n: number) =>
        n >= 100_000_000
            ? `${(n / 100_000_000).toFixed(2)}억원`
            : n >= 10_000
              ? `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`
              : `${Math.round(n).toLocaleString('ko-KR')}원`;
    const headline = active.length
        ? `지금 ${active.map((a) => FAULT_LABELS[a.name] ?? a.name).join(', ')} 장애가 진행 중입니다. 최근 24시간 장애로 인한 추정 손실은 약 ${won(totalLoss)}입니다.`
        : cards.length
          ? `최근 24시간 장애 ${cards.length}건, 추정 손실 약 ${won(totalLoss)}. 지금은 모든 단계가 정상입니다.`
          : `최근 24시간 장애 없음. 거래대금 ${won(today.orderKrw)}, 첫 입금 ${Math.round(today.firstDeposits)}건.`;
    return {
        range: ctx.range,
        headline,
        cards: cards.reverse(),
        today: {
            signups: today.signups,
            firstDeposits: today.firstDeposits,
            depositKrw: today.depositKrw,
            orders: today.orders,
            orderKrw: today.orderKrw,
        },
    };
}