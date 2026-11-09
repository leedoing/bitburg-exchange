import { ToggleButtons } from '@datadog/druids/form/ToggleButtons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getBiFunnel, getBiPaths } from '../bi.backend';
import {
    BI_DIM_LABEL,
    BI_DIMS,
    BI_VIEWS,
    type BiDim,
    type BiDirection,
    type BiFunnelRow,
    type BiLink,
    type BiMode,
    type BiView,
    type RangeKey,
    type StepTiming,
} from '../shared/types';
import { count, krw, pct, ratio } from '../ui/format';
import { Card, ErrorBox, Loading, Tile } from '../ui/parts';
import { Sankey } from '../ui/Sankey';

const STEP_LABEL: Record<BiMode, string[]> = {
    action: ['신규 방문', '가입 완료', 'KYC 승인', '첫 입금', '첫 주문 체결'],
    view: ['home', 'signup', 'kyc', 'deposit', 'trade'],
};
const VIEW_LABEL: Record<string, string> = {
    home: '홈',
    login: '로그인',
    signup: '가입',
    kyc: 'KYC',
    deposit: '입금',
    trade: '거래',
    '(exit)': '이탈',
};
const VALUE_LABEL: Record<string, string> = {
    organic: '자연 유입',
    push: '푸시',
    kakao_ad: '카카오 광고',
    naver_sa: '네이버 검색광고',
    none: '캠페인 없음',
    listing_pups: 'PUPS 상장',
    promo_deposit_bonus: '입금 보너스',
    '(none)': '(미설정)',
    all: '전체',
};
const REASON_LABEL: Record<string, string> = {
    rejected: '심사 거절',
    timeout: '타임아웃',
    abandoned: '대기 중 이탈',
    db_pool_exhausted: 'DB 풀 고갈',
};
const TIER_LABEL: Record<string, string> = { new: '신규', regular: '일반', vip: 'VIP' };

const valueLabel = (v: string) => VALUE_LABEL[v] ?? v;

function secs(s: number | null): string {
    if (s === null) return '-';
    if (s < 60) return `${s.toFixed(1)}초`;
    const m = Math.floor(s / 60);
    return `${m}분 ${Math.round(s - m * 60)}초`;
}
const timing = (t: StepTiming | undefined) => (t && t[0] !== null ? `${secs(t[0])} · p90 ${secs(t[1])}` : '-');

const MODE_OPTIONS: { value: BiMode; label: string }[] = [
    { value: 'action', label: 'Action 기준' },
    { value: 'view', label: 'View 기준' },
];
const DIM_OPTIONS = BI_DIMS.map((d) => ({ value: d, label: BI_DIM_LABEL[d] }));
const VIEW_OPTIONS = BI_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v] }));
const DIR_OPTIONS: { value: BiDirection; label: string }[] = [
    { value: 'after', label: '이후 경로' },
    { value: 'before', label: '이전 경로' },
];

export function Bi({ range }: { range: RangeKey }) {
    const [mode, setMode] = useState<BiMode>('action');
    const [dim, setDim] = useState<BiDim>('version');
    const [view, setView] = useState<BiView>('kyc');
    const [direction, setDirection] = useState<BiDirection>('after');

    const fq = useQuery({
        queryKey: ['bi-funnel', range, mode, dim],
        queryFn: () => getBiFunnel(range, mode, dim),
        refetchInterval: 60_000,
        placeholderData: keepPreviousData,
    });
    const pq = useQuery({
        queryKey: ['bi-paths', range, view, direction],
        queryFn: () => getBiPaths(range, view, direction),
        refetchInterval: 60_000,
        placeholderData: keepPreviousData,
    });

    return (
        <div className="stack">
            <Card>
                <div className="bi-controls">
                    <label>
                        <span>퍼널 기준</span>
                        <ToggleButtons<BiMode> options={MODE_OPTIONS} value={mode} onChange={setMode} size="sm" />
                    </label>
                    <label>
                        <span>비교 기준</span>
                        <ToggleButtons<BiDim> options={DIM_OPTIONS} value={dim} onChange={setDim} size="sm" />
                    </label>
                    {fq.isFetching && <span className="muted small">불러오는 중…</span>}
                </div>
            </Card>
            {fq.isLoading ? (
                <Loading what="BI 퍼널" />
            ) : fq.isError || !fq.data ? (
                <ErrorBox error={fq.error} />
            ) : (
                <FunnelSection data={fq.data} />
            )}
            <Card
                title="경로 분석 (Pathways)"
                extra={
                    <div className="bi-controls">
                        <ToggleButtons<BiView> options={VIEW_OPTIONS} value={view} onChange={setView} size="sm" />
                        <ToggleButtons<BiDirection> options={DIR_OPTIONS} value={direction} onChange={setDirection} size="sm" />
                    </div>
                }
            >
                {pq.isLoading ? (
                    <Loading what="경로" />
                ) : pq.isError || !pq.data ? (
                    <ErrorBox error={pq.error} />
                ) : (
                    <PathsSection links={pq.data.links} sessions={pq.data.sessions} view={pq.data.view} direction={pq.data.direction} />
                )}
            </Card>
        </div>
    );
}

function FunnelSection({ data: d }: { data: Awaited<ReturnType<typeof getBiFunnel>> }) {
    const labels = STEP_LABEL[d.mode];
    const rows: BiFunnelRow[] = d.dim === 'none' ? [d.all] : d.rows.slice(0, 6);
    const a = d.all;
    const transitions = [
        `${labels[0]} → ${labels[1]}`,
        `${labels[1]} → ${labels[2]}`,
        `${labels[2]} → ${labels[3]}`,
        `${labels[3]} → ${labels[4]}`,
    ];
    const slowest = (i: number) => {
        const vals = rows.map((r) => r.timings[i]?.[0] ?? null).filter((v): v is number => v !== null);
        return vals.length > 1 ? Math.max(...vals) : null;
    };

    return (
        <>
            <div className="tiles">
                <Tile label={labels[0]} value={a.steps[0]} format={count} sub={`${d.range.label} · 로그인 세션 제외`} />
                <Tile
                    label="가입 전환율"
                    value={ratio(a.steps[1], a.steps[0]) * 100}
                    format={(n) => pct(n)}
                    sub={`${labels[0]} ${count(a.steps[0])} → ${labels[1]} ${count(a.steps[1])}`}
                />
                <Tile
                    label="첫 거래 전환율"
                    value={ratio(a.steps[4], a.steps[0]) * 100}
                    format={(n) => pct(n)}
                    sub={`${labels[4]}까지 ${count(a.steps[4])}세션`}
                />
                <Tile
                    label={d.mode === 'action' ? '가입까지 걸린 시간 (중앙값)' : 'signup 화면까지 (중앙값)'}
                    value={a.timings[0]?.[0] ?? 0}
                    format={(n) => secs(n)}
                    sub={`p90 ${secs(a.timings[0]?.[1] ?? null)} · 첫 거래까지 ${secs(a.total[0])}`}
                />
            </div>

            <div className="grid-2">
                <Card title={`퍼널 (${BI_DIM_LABEL[d.dim]}별, 같은 세션·순서대로)`}>
                    <table className="funnel">
                        <thead>
                            <tr>
                                <th>단계</th>
                                {rows.map((r) => (
                                    <th key={r.dim}>{valueLabel(r.dim)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((step, i) => (
                                <tr key={step}>
                                    <td>{step}</td>
                                    {rows.map((r, c) => {
                                        const conv = i === 0 ? 1 : ratio(r.steps[i], r.steps[i - 1]);
                                        const width = ratio(r.steps[i], r.steps[0]) * 100;
                                        return (
                                            <td key={r.dim}>
                                                <div className="bar-cell">
                                                    <div className="bar" style={{ width: `${width}%`, background: `${BAR[c % BAR.length]}` }} />
                                                    <span>
                                                        {count(r.steps[i])}
                                                        {i > 0 && (
                                                            <em>
                                                                {' '}
                                                                · {pct(conv * 100, 0)} · 이탈 {count(r.steps[i - 1] - r.steps[i])}
                                                            </em>
                                                        )}
                                                    </span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="muted small">막대 길이 = 첫 단계 대비 비율, % = 바로 앞 단계 대비 전환율.</div>
                </Card>

                <Card title="단계별 소요 시간 (중앙값 · p90)">
                    <table className="funnel">
                        <thead>
                            <tr>
                                <th>구간</th>
                                {rows.map((r) => (
                                    <th key={r.dim}>{valueLabel(r.dim)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {transitions.map((t, i) => {
                                const max = slowest(i);
                                return (
                                    <tr key={t}>
                                        <td>{t}</td>
                                        {rows.map((r) => (
                                            <td key={r.dim} className={max !== null && r.timings[i]?.[0] === max ? 'slowest' : ''}>
                                                {timing(r.timings[i])}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                            <tr className="total-row">
                                <td>
                                    {labels[0]} → {labels[4]} (전체)
                                </td>
                                {rows.map((r) => (
                                    <td key={r.dim}>{timing(r.total)}</td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                    <div className="muted small">주황 = 비교 그룹 중 가장 느린 값. 다음 단계에 도달한 세션만으로 계산합니다.</div>
                </Card>
            </div>

            <div className="grid-2">
                <Card title={`그로스 성과표 (${BI_DIM_LABEL[d.dim]}별)`}>
                    <table className="funnel">
                        <thead>
                            <tr>
                                <th>{BI_DIM_LABEL[d.dim]}</th>
                                <th>{labels[0]}</th>
                                <th>가입 전환</th>
                                <th>첫 입금 전환</th>
                                <th>평균 첫 입금액</th>
                                <th>신규 거래대금</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.dim}>
                                    <td>{valueLabel(r.dim)}</td>
                                    <td>{count(r.steps[0])}</td>
                                    <td>{pct(ratio(r.steps[1], r.steps[0]) * 100)}</td>
                                    <td>{pct(ratio(r.steps[3], r.steps[0]) * 100)}</td>
                                    <td>{r.avgFirstDepositKrw ? krw(r.avgFirstDepositKrw) : '-'}</td>
                                    <td>{krw(r.orderKrw)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="muted small">
                        신규 거래대금 = 같은 세션에서 가입한 신규 회원의 주문 체결 금액 합. 금액은 1억 원 초과 입력 제외.
                    </div>
                </Card>

                <div className="stack">
                    <Card title="이탈 사유">
                        <div className="reason-grid">
                            <Reasons title="KYC 실패" data={d.reasons.kyc} />
                            <Reasons title="주문 실패" data={d.reasons.order} />
                            <div>
                                <h4>입금 지연 (60초 넘게 대기)</h4>
                                <div className="reason-big">{count(d.reasons.depositStuck)}건</div>
                            </div>
                        </div>
                    </Card>
                    <Card title="회원 등급별 주문">
                        <table className="funnel">
                            <thead>
                                <tr>
                                    <th>등급</th>
                                    <th>체결 건수</th>
                                    <th>평균 주문액</th>
                                </tr>
                            </thead>
                            <tbody>
                                {d.tiers.map((t) => (
                                    <tr key={t.tier}>
                                        <td>{TIER_LABEL[t.tier] ?? t.tier}</td>
                                        <td>{count(t.orders)}</td>
                                        <td>{krw(t.avgKrw)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>
                </div>
            </div>
            <div className="formula">
                데이터: DDSQL dd.rum (View·Action 이벤트, @session.type:user). 퍼널은 로그인 화면을 연 기존 회원 세션을 빼고, 같은 세션에서 앞 단계 뒤에
                다음 단계가 일어난 경우만 셉니다. Action 기준 = signup_completed → kyc_approved → deposit_completed → order_filled, View 기준 = home →
                signup → kyc → deposit → trade. 소요 시간은 단계 사이 첫 발생 시각의 차이입니다.
            </div>
        </>
    );
}

const BAR = ['rgba(33, 177, 255, 0.25)', 'rgba(124, 92, 255, 0.28)', 'rgba(46, 160, 67, 0.25)', 'rgba(240, 136, 62, 0.25)', 'rgba(198, 120, 221, 0.25)', 'rgba(86, 182, 194, 0.25)'];

function Reasons({ title, data }: { title: string; data: Record<string, number> }) {
    const entries = Object.entries(data)
        .filter(([k]) => k && k !== 'all')
        .sort((a, b) => b[1] - a[1]);
    return (
        <div>
            <h4>{title}</h4>
            {entries.length === 0 ? (
                <div className="muted small">없음</div>
            ) : (
                <ul className="reason-list">
                    {entries.map(([k, v]) => (
                        <li key={k}>
                            <span>{REASON_LABEL[k] ?? k}</span>
                            <strong>{count(v)}</strong>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function PathsSection({ links, sessions, view, direction }: { links: BiLink[]; sessions: number; view: BiView; direction: BiDirection }) {
    const first = links.filter((l) => l.step === (direction === 'after' ? 0 : -1));
    const total = first.reduce((s, l) => s + l.n, 0);
    const top = [...first]
        .map((l) => ({ name: direction === 'after' ? l.to : l.from, n: l.n }))
        .reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.name]: (acc[x.name] ?? 0) + x.n }), {});
    const ranked = Object.entries(top).sort((a, b) => b[1] - a[1]);
    return (
        <>
            <div className="paths-summary">
                <strong>
                    {VIEW_LABEL[view]} 화면을 연 세션 {count(sessions)}개
                </strong>
                <span className="muted">{direction === 'after' ? '바로 다음 화면' : '바로 이전 화면'}:</span>
                {ranked.map(([name, n]) => (
                    <span key={name} className={`pill ${name === '(exit)' ? 'pill-bad' : ''}`}>
                        {VIEW_LABEL[name] ?? name} {pct(ratio(n, total) * 100, 0)}
                    </span>
                ))}
            </div>
            <Sankey links={links} labels={VIEW_LABEL} anchor={VIEW_LABEL[view]} />
            <div className="muted small">
                세션에서 {VIEW_LABEL[view]} 화면을 처음 연 시점 기준 {direction === 'after' ? '이후 3단계' : '이전 3단계'}. 선 굵기 = 세션 수, 회색 = 세션 종료(이탈).
                {direction === 'before' && ' 세션 첫 화면이 이 화면이면 이전 경로가 없어 집계에서 빠집니다.'}
            </div>
        </>
    );
}
