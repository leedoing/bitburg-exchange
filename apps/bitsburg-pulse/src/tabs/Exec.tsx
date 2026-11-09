import { useQuery } from '@tanstack/react-query';

import { getExec } from '../pulse.backend';
import type { RangeKey } from '../shared/types';
import { CountUp } from '../ui/CountUp';
import { count, dateTime, krw } from '../ui/format';
import { Card, ErrorBox, LevelTag, Loading, Tile } from '../ui/parts';

export function Exec({ range }: { range: RangeKey }) {
    const q = useQuery({ queryKey: ['exec', range], queryFn: () => getExec(range), refetchInterval: 30_000 });
    if (q.isLoading) return <Loading what="경영 요약" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const d = q.data;
    return (
        <div className="stack">
            <Card className="headline-card">
                <div className="headline-label">오늘의 한 줄 요약</div>
                <div className="headline">{d.headline}</div>
            </Card>
            <div className="tiles">
                <Tile label="가입 (24시간)" value={d.today.signups} format={count} />
                <Tile label="첫 입금 (24시간)" value={d.today.firstDeposits} format={count} sub={<>{krw(d.today.depositKrw)}</>} />
                <Tile label="주문 체결 (24시간)" value={d.today.orders} format={count} />
                <Tile label="거래대금 (24시간)" value={d.today.orderKrw} format={krw} />
            </div>
            <Card title="장애별 추정 영향 (최근 24시간)">
                {d.cards.length === 0 ? (
                    <div className="muted">최근 24시간 동안 주입된 장애가 없습니다.</div>
                ) : (
                    <div className="impact-grid">
                        {d.cards.map((c) => (
                            <div key={`${c.fault}${c.start}`} className={`impact ${c.end === null ? 'impact-live' : ''}`}>
                                <div className="impact-head">
                                    <strong>{c.label}</strong>
                                    {c.end === null ? <LevelTag level="bad" /> : <span className="pill">종료</span>}
                                </div>
                                <div className="muted small">
                                    {dateTime(c.start)} ~ {c.end ? dateTime(c.end) : '진행 중'}
                                </div>
                                <div className="impact-nums">
                                    <div>
                                        <span>영향 사용자</span>
                                        <b>
                                            <CountUp value={c.affectedUsers} format={(n) => `${count(n)}명`} />
                                        </b>
                                    </div>
                                    <div>
                                        <span>실패 건수</span>
                                        <b>
                                            <CountUp value={c.failedCount} format={(n) => `${count(n)}건`} />
                                        </b>
                                    </div>
                                    <div>
                                        <span>추정 손실</span>
                                        <b className="loss">
                                            <CountUp value={c.lostKrw} format={krw} />
                                        </b>
                                    </div>
                                </div>
                                <div className="muted small">{c.note}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
