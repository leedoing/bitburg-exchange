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

export type AdminFault = { name: string; enabled: boolean; intensity: number; remainingSec: number; expiresAt: string | null };
export type AdminState = {
    ok: boolean;
    error?: string;
    faults: AdminFault[];
    campaign: { id: string | null; enabled: boolean; remainingSec: number } | null;
    serverTime?: string;
};
