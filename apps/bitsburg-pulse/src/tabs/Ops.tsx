import { Button } from '@datadog/druids/form/Button';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getOps } from '../pulse.backend';
import type { Level, RangeKey } from '../shared/types';
import { Chart } from '../ui/Chart';
import { count } from '../ui/format';
import { Card, ErrorBox, LevelTag, Loading, Tile } from '../ui/parts';

const BITS_QUESTIONS = [
    {
        scene: '시나리오 C · 입금 문의',
        text: "고객센터에 '입금이 반영이 안 된다'는 문의가 늘고 있어요. 지금 bitsburg 입금 쪽에 문제가 있나요? 영향받는 고객 수와 원인을 요약해 줘.",
    },
    {
        scene: '시나리오 A · KYC 완료율',
        text: '오늘 신규 가입자의 KYC 완료율이 떨어졌다는데, 앱 버전별로 차이가 있어? 원인이 뭐야?',
    },
    {
        scene: '시나리오 B · 상장 이벤트',
        text: '오늘 PUPS 상장 이벤트 시간대에 주문 성공률과 응답 시간이 평소와 비교해 어땠는지, 경영진 보고용으로 요약해 줘.',
    },
];

const TOPIC_LABEL: Record<string, string> = { deposit: '입금', kyc: 'KYC', order: '주문' };

function monitorLevel(state: string): Level {
    if (state === 'Alert') return 'bad';
    if (state === 'Warn') return 'warn';
    if (state === 'OK') return 'ok';
    return 'idle';
}

function CopyCard({ scene, text }: { scene: string; text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="question">
            <div className="question-scene">{scene}</div>
            <p>“{text}”</p>
            <Button label={copied ? '복사됨' : '질문 복사'} onClick={copy} size="sm" isPrimary={!copied} />
        </div>
    );
}

export function Ops({ range }: { range: RangeKey }) {
    const q = useQuery({ queryKey: ['ops', range], queryFn: () => getOps(range), refetchInterval: 30_000 });
    if (q.isLoading) return <Loading what="운영·CS" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const d = q.data;
    const worst = d.stages.some((s) => s.level === 'bad') ? 'bad' : d.stages.some((s) => s.level === 'warn') ? 'warn' : 'ok';
    const pendingLevel: Level = d.pendingMaxNow >= 45 ? 'bad' : d.pendingMaxNow >= 20 ? 'warn' : 'ok';
    const csDeposit = d.csTotal.deposit ?? 0;
    return (
        <div className="stack">
            <Card title="지금 장애인가?" extra={<LevelTag level={worst} />}>
                <div className="stage-rows">
                    {d.stages.map((s) => (
                        <div key={s.key} className="stage-row">
                            <LevelTag level={s.level} />
                            <strong>{s.label}</strong>
                            <span>{s.headline}</span>
                            <span className="muted">{s.detail}</span>
                        </div>
                    ))}
                </div>
            </Card>
            <div className="tiles">
                <Tile label="입금 대기 최장 시간 (지금)" value={d.pendingMaxNow} format={(n) => `${Math.round(n)}초`} level={pendingLevel} sub="45초 넘으면 장애" />
                <Tile label="입금 대기 중" value={d.pendingCountNow} format={(n) => `${Math.round(n)}건`} />
                <Tile label={`입금 CS 문의 (${d.range.label})`} value={csDeposit} format={(n) => `${count(n)}건`} />
                <Tile
                    label="전체 CS 문의"
                    value={Object.values(d.csTotal).reduce((a, b) => a + b, 0)}
                    format={(n) => `${count(n)}건`}
                    sub={Object.entries(d.csTotal)
                        .map(([k, v]) => `${TOPIC_LABEL[k] ?? k} ${count(v)}`)
                        .join(' · ')}
                />
            </div>
            <div className="grid-2">
                <Card title="입금 대기 최장 시간 (초)">
                    <Chart series={d.pendingSeries} window={d.range.window} faults={d.windows} threshold={{ value: 45, label: '45초' }} />
                </Card>
                <Card title="CS 문의 추이 (주제별)">
                    <Chart
                        series={d.csSeries.map((s) => ({ ...s, label: TOPIC_LABEL[s.label] ?? s.label }))}
                        window={d.range.window}
                        faults={d.windows}
                        kind="bar"
                        empty="이 구간에 CS 문의가 없습니다"
                    />
                </Card>
            </div>
            <div className="grid-2">
                <Card title="모니터 상태 (team:bitsburg)">
                    <ul className="monitors">
                        {d.monitors.map((mo) => (
                            <li key={mo.id}>
                                <LevelTag level={monitorLevel(mo.state)} />
                                <a href={mo.url} target="_blank" rel="noreferrer">
                                    {mo.name}
                                </a>
                            </li>
                        ))}
                    </ul>
                </Card>
                <Card title="Bits에게 물어볼 질문">
                    <div className="questions">
                        {BITS_QUESTIONS.map((b) => (
                            <CopyCard key={b.scene} {...b} />
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
