import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getPm } from '../pulse.backend';
import type { RangeKey } from '../shared/types';
import { Chart } from '../ui/Chart';
import { CountUp } from '../ui/CountUp';
import { count, dateTime, krw, pct, ratio } from '../ui/format';
import { Card, ErrorBox, Loading } from '../ui/parts';

/** Spec baseline (DATA_SPEC 8): signup→KYC 80% × KYC→first deposit 65%. */
const SPEC_SIGNUP_TO_DEPOSIT = 0.8 * 0.65;

const REASON: Record<string, string> = { kyc_failed: 'KYC 실패', deposit_stuck: '입금 지연', cs_contact_opened: 'CS 문의' };

export function Pm({ range }: { range: RangeKey }) {
    const q = useQuery({ queryKey: ['pm', range], queryFn: () => getPm(range), refetchInterval: 30_000 });
    const [avgDeposit, setAvgDeposit] = useState<number | null>(null);

    if (q.isLoading) return <Loading what="PM·DA" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const d = q.data;
    const deposit = avgDeposit ?? Math.round(d.avgDepositKrw / 10_000) * 10_000;

    const baselineConv = d.baselineTotal[0] >= 20 ? ratio(d.baselineTotal[2], d.baselineTotal[0]) : SPEC_SIGNUP_TO_DEPOSIT;
    const signups = d.total[0];
    const dropped = Math.max(0, signups - d.total[2]);
    const expectedDrop = signups * (1 - baselineConv);
    const excess = Math.max(0, dropped - expectedDrop);
    const loss = excess * deposit;

    return (
        <div className="stack">
            <div className="grid-2">
                <Card title={`버전별 퍼널 (${d.range.label}, 세션 수)`}>
                    <table className="funnel">
                        <thead>
                            <tr>
                                <th>단계</th>
                                {d.funnel.map((f) => (
                                    <th key={f.version}>{f.version}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {d.steps.map((step, i) => (
                                <tr key={step}>
                                    <td>{step}</td>
                                    {d.funnel.map((f) => {
                                        const conv = i === 0 ? 1 : ratio(f.steps[i], f.steps[i - 1]);
                                        const width = Math.min(100, ratio(f.steps[i], Math.max(...d.funnel.map((x) => x.steps[0]), 1)) * 100);
                                        return (
                                            <td key={f.version}>
                                                <div className="bar-cell">
                                                    <div className={`bar v${f.version.replace(/\./g, '')}`} style={{ width: `${width}%` }} />
                                                    <span>
                                                        {count(f.steps[i])}
                                                        {i > 0 && <em> · 전환 {pct(conv * 100, 0)}</em>}
                                                    </span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="muted small">같은 세션에서 가입부터 이어진 사용자만 셉니다(기존 회원 주문 제외). 단계 간 이탈 = 앞 단계 세션 − 다음 단계 세션. KYC 단계에서 3.5.0만 꺾이면 신규 KYC 흐름(v2) 문제입니다.</div>
                </Card>
                <Card title="추정 손실" className="loss-card">
                    <div className="loss-value">
                        <CountUp value={loss} format={krw} />
                    </div>
                    <div className="loss-sub">
                        평시보다 더 이탈한 사용자 <strong>{count(excess)}명</strong> × 평균 첫 입금액 <strong>{krw(deposit)}</strong>
                    </div>
                    <label className="slider">
                        <span>평균 첫 입금액 {krw(deposit)}</span>
                        <input
                            type="range"
                            min={100_000}
                            max={5_000_000}
                            step={50_000}
                            value={deposit}
                            onChange={(ev) => setAvgDeposit(Number(ev.target.value))}
                        />
                        <span className="muted small">실데이터 기본값 {krw(d.avgDepositKrw)} (최근 24시간 RUM deposit_completed 금액 평균, 1억 초과 제외)</span>
                    </label>
                    <div className="formula">
                        추정 손실 = (이탈 사용자 {count(dropped)} − 평시 기준 이탈 예상 {count(expectedDrop)}) × 평균 첫 입금액. 이탈 = 가입 완료 − 첫 입금. 평시 가입→첫 입금 전환율{' '}
                        {pct(baselineConv * 100)}
                        {d.baselineTotal[0] >= 20
                            ? ` (직전 24시간 ${dateTime(d.baselineWindow.from)}~${dateTime(d.baselineWindow.to)})`
                            : ' (직전 데이터 부족, 스펙 기준 80%×65%)'}
                        .
                    </div>
                </Card>
            </div>
            <div className="grid-2">
                <Card title="버전별 KYC 성공률 (%)">
                    <Chart series={d.kycByVersion} window={d.range.window} faults={d.windows} format={(n) => `${Math.round(n)}%`} />
                </Card>
                <Card title="이탈 세션 리플레이">
                    {d.replays.length === 0 ? (
                        <div className="muted">이 구간에 KYC 실패·입금 지연·CS 문의 세션이 없습니다.</div>
                    ) : (
                        <ul className="replays">
                            {d.replays.map((r) => (
                                <li key={r.sessionId}>
                                    <span className="tl-time">{dateTime(r.ts)}</span>
                                    <span className="pill">{r.version || '-'}</span>
                                    <span>{REASON[r.reason] ?? r.reason}</span>
                                    <a href={r.url} target="_blank" rel="noreferrer">
                                        리플레이 보기
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    );
}
