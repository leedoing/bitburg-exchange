export type RangeKey = '1h' | '6h' | '24h' | 'fault';

export type Level = 'ok' | 'warn' | 'bad' | 'idle';

export const LEVEL_LABEL: Record<Level, string> = {
    ok: '정상',
    warn: '주의',
    bad: '장애',
    idle: '데이터 없음',
};

export const FAULTS = ['kyc_vendor_slow', 'deposit_delay', 'listing_spike'] as const;
export type FaultName = (typeof FAULTS)[number];

export const FAULT_LABEL: Record<FaultName, string> = {
    kyc_vendor_slow: 'KYC 벤더 지연 (3.5.0)',
    deposit_delay: '원화 입금 지연',
    listing_spike: '신규 상장 트래픽 폭증',
};

export type Window = { from: number; to: number };

export type FaultWindow = {
    name: string;
    kind: 'fault' | 'campaign';
    start: number;
    end: number | null;
};

export type TimelineEvent = {
    ts: number;
    title: string;
    alertType: string;
    url: string;
};

export type Series = { label: string; points: [number, number][] };

export type ResolvedRange = {
    key: RangeKey;
    window: Window;
    label: string;
    note?: string;
};

export type StageSignal = {
    key: 'signup' | 'kyc' | 'deposit' | 'order';
    label: string;
    level: Level;
    headline: string;
    detail: string;
    count: number;
};

export type SituationData = {
    range: ResolvedRange;
    now: number;
    stages: StageSignal[];
    activeFaults: FaultWindow[];
    activeCampaign: FaultWindow | null;
    windows: FaultWindow[];
    timeline: TimelineEvent[];
    tiles: { signups: number; kycApproved: number; deposits: number; depositKrw: number; orders: number; orderKrw: number };
    trend: Series[];
};

export type MonitorRow = { id: number; name: string; state: string; url: string };

export type OpsData = {
    range: ResolvedRange;
    windows: FaultWindow[];
    pendingMaxNow: number;
    pendingCountNow: number;
    pendingSeries: Series[];
    csSeries: Series[];
    csTotal: Record<string, number>;
    stages: StageSignal[];
    monitors: MonitorRow[];
    alerts: TimelineEvent[];
};

export type VersionFunnel = { version: string; steps: number[] };

export type PmData = {
    range: ResolvedRange;
    baselineWindow: Window;
    windows: FaultWindow[];
    steps: string[];
    funnel: VersionFunnel[];
    total: number[];
    baselineTotal: number[];
    avgDepositKrw: number;
    replays: { sessionId: string; version: string; reason: string; ts: number; url: string }[];
    kycByVersion: Series[];
};

export type CampaignData = {
    range: ResolvedRange;
    windows: FaultWindow[];
    sessions: Series[];
    signups: Series[];
    orders: Series[];
    orderKrw: Series[];
    orderP95: Series[];
    orderFailRate: Series[];
    totals: { campaign: { sessions: number; orders: number; krw: number }; normal: { sessions: number; orders: number; krw: number } };
};

export type ImpactCard = {
    fault: string;
    label: string;
    start: number;
    end: number | null;
    affectedUsers: number;
    failedCount: number;
    lostKrw: number;
    note: string;
};

export type ExecData = {
    range: ResolvedRange;
    headline: string;
    cards: ImpactCard[];
    today: { signups: number; firstDeposits: number; depositKrw: number; orders: number; orderKrw: number };
};

// ------------------------------------------------------------------ BI
export const BI_DIMS = ['none', 'version', 'platform', 'source', 'campaign'] as const;
export type BiDim = (typeof BI_DIMS)[number];
export const BI_DIM_LABEL: Record<BiDim, string> = {
    none: '전체',
    version: '앱 버전',
    platform: '플랫폼',
    source: '유입 경로',
    campaign: '캠페인',
};

export const BI_MODES = ['action', 'view'] as const;
export type BiMode = (typeof BI_MODES)[number];

export const BI_VIEWS = ['home', 'login', 'signup', 'kyc', 'deposit', 'trade'] as const;
export type BiView = (typeof BI_VIEWS)[number];

export type BiDirection = 'after' | 'before';

/** Seconds between funnel steps: [p50, p90]. null when no session made that transition. */
export type StepTiming = [number | null, number | null];

export type BiFunnelRow = {
    dim: string;
    /** Sessions at each step; index 0 is the entry step (new visits or home view). */
    steps: number[];
    /** timings[i] = time from step i to step i+1. */
    timings: StepTiming[];
    /** Entry to the last step. */
    total: StepTiming;
    avgFirstDepositKrw: number;
    orderKrw: number;
};

export type BiFunnelData = {
    range: ResolvedRange;
    mode: BiMode;
    dim: BiDim;
    stepLabels: string[];
    all: BiFunnelRow;
    rows: BiFunnelRow[];
    reasons: { kyc: Record<string, number>; order: Record<string, number>; depositStuck: number };
    tiers: { tier: string; orders: number; avgKrw: number }[];
};

export type BiLink = { step: number; from: string; to: string; n: number };

export type BiPathsData = {
    range: ResolvedRange;
    view: BiView;
    direction: BiDirection;
    sessions: number;
    links: BiLink[];
};

export type AdminFault = { name: string; enabled: boolean; intensity: number; remainingSec: number; expiresAt: string | null };
export type AdminState = {
    ok: boolean;
    error?: string;
    faults: AdminFault[];
    campaign: { id: string | null; enabled: boolean; remainingSec: number } | null;
    serverTime?: string;
};
