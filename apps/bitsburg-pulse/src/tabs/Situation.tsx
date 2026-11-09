import { useQuery } from '@tanstack/react-query';

import { getSituation } from '../pulse.backend';
import type { RangeKey } from '../shared/types';
import { Chart } from '../ui/Chart';
import { count, dateTime, krw } from '../ui/format';
import { Card, ErrorBox, FaultBanner, Loading, Tile, TrafficLights } from '../ui/parts';

export function Situation({ range }: { range: RangeKey }) {
    const q = useQuery({ queryKey: ['situation', range], queryFn: () => getSituation(range), refetchInterval: 30_000 });
    if (q.isLoading) return <Loading what="상황판" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const d = q.data;
    return (
        <div className="stack">
            <FaultBanner faults={d.activeFaults} campaign={d.activeCampaign} />
            <Card title="신규 회원 퍼널 신호등 (최근 5분)" extra={<span className="muted">30초마다 새로고침</span>}>
                <TrafficLights stages={d.stages} />
            </Card>
            <div className="tiles">
                <Tile label="가입 완료" value={d.tiles.signups} format={count} sub={d.range.label} />
                <Tile label="KYC 승인" value={d.tiles.kycApproved} format={count} sub={d.range.label} />
                <Tile label="첫 입금" value={d.tiles.deposits} format={count} sub={<>입금액 {krw(d.tiles.depositKrw)}</>} />
                <Tile label="거래대금" value={d.tiles.orderKrw} format={krw} sub={<>체결 {count(d.tiles.orders)}건</>} />
            </div>
            <div className="grid-2">
                <Card title={`단계별 건수 (${d.range.label})`}>
                    <Chart series={d.trend} window={d.range.window} faults={d.windows} kind="bar" />
                </Card>
                <Card title="최근 장애·캠페인 Event">
                    {d.timeline.length === 0 ? (
                        <div className="muted">최근 24시간 동안 장애·캠페인 Event가 없습니다.</div>
                    ) : (
                        <ul className="timeline">
                            {d.timeline.map((e) => (
                                <li key={`${e.ts}${e.title}`} className={`tl-${e.alertType}`}>
                                    <span className="tl-time">{dateTime(e.ts)}</span>
                                    <span>{e.title.replace('[Bitsburg] ', '')}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
            {d.range.note && <div className="muted">{d.range.note}</div>}
        </div>
    );
}
