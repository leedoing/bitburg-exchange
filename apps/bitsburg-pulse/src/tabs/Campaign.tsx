import { useQuery } from '@tanstack/react-query';

import { getCampaign } from '../pulse.backend';
import type { RangeKey, Series } from '../shared/types';
import { Chart } from '../ui/Chart';
import { count, krw, ratio } from '../ui/format';
import { Card, ErrorBox, Loading, Tile } from '../ui/parts';

const CAMPAIGN_LABEL: Record<string, string> = { listing_pups: 'PUPS 상장', promo_deposit_bonus: '입금 보너스', none: '평시', 'N/A': '평시' };
/** Relabels campaign ids and sums series that end up with the same label (none and N/A are both 평시). */
function relabel(series: Series[]): Series[] {
    const out = new Map<string, Series>();
    for (const s of series) {
        const label = CAMPAIGN_LABEL[s.label] ?? s.label;
        const prev = out.get(label);
        out.set(label, prev ? { label, points: prev.points.map(([t, v], i) => [t, v + (s.points[i]?.[1] ?? 0)]) } : { label, points: s.points });
    }
    return [...out.values()];
}

export function Campaign({ range }: { range: RangeKey }) {
    const q = useQuery({ queryKey: ['campaign', range], queryFn: () => getCampaign(range), refetchInterval: 30_000 });
    if (q.isLoading) return <Loading what="캠페인" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const d = q.data;
    const c = d.totals.campaign;
    const n = d.totals.normal;
    return (
        <div className="stack">
            <div className="tiles">
                <Tile label="캠페인 유입 세션" value={c.sessions} format={count} sub={<>평시 {count(n.sessions)}</>} />
                <Tile label="캠페인 주문 체결" value={c.orders} format={count} sub={<>평시 {count(n.orders)}</>} />
                <Tile label="캠페인 거래대금" value={c.krw} format={krw} sub={<>평시 {krw(n.krw)}</>} />
                <Tile label="세션당 거래대금 (캠페인 / 평시)" value={ratio(c.krw, c.sessions)} format={krw} sub={<>평시 {krw(ratio(n.krw, n.sessions))}</>} />
            </div>
            <Card title={`캠페인 vs 평시 한 타임라인 (${d.range.label})`} extra={<span className="muted">붉은 띠 = 장애, 보라 띠 = 캠페인</span>}>
                <div className="grid-2">
                    <div>
                        <h4>유입 (세션)</h4>
                        <Chart series={relabel(d.sessions)} window={d.range.window} faults={d.windows} height={150} />
                    </div>
                    <div>
                        <h4>가입</h4>
                        <Chart series={relabel(d.signups)} window={d.range.window} faults={d.windows} kind="bar" height={150} />
                    </div>
                    <div>
                        <h4>주문 체결 수</h4>
                        <Chart series={relabel(d.orders)} window={d.range.window} faults={d.windows} kind="bar" height={150} />
                    </div>
                    <div>
                        <h4>거래대금</h4>
                        <Chart series={relabel(d.orderKrw)} window={d.range.window} faults={d.windows} kind="bar" height={150} format={krw} />
                    </div>
                    <div>
                        <h4>주문 p95 (초)</h4>
                        <Chart series={d.orderP95} window={d.range.window} faults={d.windows} height={150} format={(v) => v.toFixed(2)} threshold={{ value: 1, label: '1초' }} />
                    </div>
                    <div>
                        <h4>주문 실패율 (%)</h4>
                        <Chart series={d.orderFailRate} window={d.range.window} faults={d.windows} height={150} format={(v) => `${v.toFixed(0)}%`} empty="이 구간에 실패한 주문이 없습니다" />
                    </div>
                </div>
            </Card>
        </div>
    );
}
