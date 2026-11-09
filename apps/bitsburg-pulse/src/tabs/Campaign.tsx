import { useQuery } from '@tanstack/react-query';

import { getCampaign } from '../pulse.backend';
import type { CampaignData, RangeKey, Series } from '../shared/types';
import { containersUrl, logsUrl, RUM, rumUrl } from '../shared/links';
import { Chart, type ChartLink } from '../ui/Chart';
import { count, krw, ratio } from '../ui/format';
import { Card, ErrorBox, Loading, Tile } from '../ui/parts';

const CAMPAIGN_LABEL: Record<string, string> = { listing_pups: 'PUPS 상장', promo_deposit_bonus: '입금 보너스', none: '평시', 'N/A': '평시' };
const CAMPAIGNS = '@context.campaign.id:(listing_pups OR promo_deposit_bonus)';
const CAMPAIGN_RUM: Record<string, string> = { 'PUPS 상장': '@context.campaign.id:listing_pups', '입금 보너스': '@context.campaign.id:promo_deposit_bonus', 평시: `-${CAMPAIGNS}` };
/** Chart link: the series label picks the campaign filter, a null label (line column click) means every campaign. */
const byCampaign =
    (base: string): ChartLink =>
    (label, w) =>
        rumUrl(`${base} ${label ? (CAMPAIGN_RUM[label] ?? `@context.campaign.id:${label}`) : ''}`, w);

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

const POOL_LOG = 'service:bitsburg-order "Order DB pool exhausted"';
/** Host CPU or memory at or above these levels is shown as 주의 / 위험. */
const WARN_PCT = 70;
const BAD_PCT = 85;

const peak = (series: Series[], label?: string) =>
    Math.max(0, ...series.filter((s) => !label || s.label === label).flatMap((s) => s.points.map((p) => p[1])));
const total = (series: Series[]) => series.reduce((n, s) => n + s.points.reduce((m, p) => m + p[1], 0), 0);
const pctFmt = (v: number) => `${Math.round(v)}%`;

function Infra({ infra, d }: { infra: CampaignData['infra']; d: CampaignData }) {
    const w = d.range.window;
    const cpu = peak(infra.host, '호스트 CPU');
    const mem = peak(infra.host, '호스트 메모리');
    const pool = Math.round(total(infra.poolWarn));
    const top = [...infra.cpu].sort((a, b) => peak([b]) - peak([a]))[0];
    const worst = Math.max(cpu, mem);
    const level = worst >= BAD_PCT ? 'bad' : worst >= WARN_PCT ? 'warn' : 'ok';
    const head = `CPU 최대 ${pctFmt(cpu)}, 메모리 최대 ${pctFmt(mem)}`;
    const verdict =
        level === 'bad'
            ? `${head}로 ${BAD_PCT}%를 넘었습니다. 리소스가 병목일 수 있습니다.`
            : level === 'warn'
              ? `${head}로 ${WARN_PCT}%를 넘었습니다. 상장 트래픽이 더 늘면 증설이 필요합니다.`
              : pool > 0
                ? `${head}로 여유가 있습니다. 주문 지연·실패는 서버 자원이 아니라 주문 DB 커넥션 풀 고갈(경고 로그 ${count(pool)}건) 때문입니다.`
                : `${head}로 여유가 있습니다. 이 구간 트래픽은 증설 없이 감당합니다.`;
    const hostLink: ChartLink = (_, bw) => containersUrl(bw);
    return (
        <Card title={`서버 리소스 (EC2 bitsburg-demo, ${d.range.label})`} extra={<span className="muted">t3.medium · 2 vCPU · 4GB</span>}>
            <div className={`infra-verdict ${level}`}>
                {verdict}
                {top && peak([top]) > 0 && <span className="muted small"> 서비스 중 CPU 최대는 {top.label} ({pctFmt(peak([top]))} of 1 vCPU).</span>}
            </div>
            <div className="grid-2">
                <div>
                    <h4>호스트 CPU·메모리 사용률 (%)</h4>
                    <Chart series={infra.host} window={w} faults={d.windows} height={150} format={pctFmt} threshold={{ value: WARN_PCT, label: `주의 ${WARN_PCT}%` }} link={hostLink} linkTarget="Containers" />
                </div>
                <div>
                    <h4>주문 DB 풀 고갈 경고 (로그 건수)</h4>
                    <Chart series={infra.poolWarn} window={w} faults={d.windows} kind="bar" height={150} empty="이 구간에 DB 풀 고갈 경고가 없습니다" link={(_, bw) => logsUrl(POOL_LOG, bw)} linkTarget="Log Explorer" />
                </div>
                <div>
                    <h4>서비스별 CPU (1 vCPU 대비 %)</h4>
                    <Chart series={infra.cpu} window={w} faults={d.windows} height={150} format={pctFmt} link={hostLink} linkTarget="Containers" />
                </div>
                <div>
                    <h4>서비스별 메모리 (MB)</h4>
                    <Chart series={infra.mem} window={w} faults={d.windows} height={150} format={(v) => `${Math.round(v)}`} link={hostLink} linkTarget="Containers" />
                </div>
            </div>
            <div className="muted small">
                호스트 수치에는 같은 EC2에서 도는 트래픽 생성기(headless Chrome)와 Pulse 컨테이너도 포함됩니다. 서비스별 그래프는 주문 경로(api-gateway → order →
                matching, 주문 DB)만 보여 줍니다. 그래프를 누르면 Datadog Containers·Log Explorer가 열립니다.
            </div>
        </Card>
    );
}

export function Campaign({ range }: { range: RangeKey }) {
    const q = useQuery({ queryKey: ['campaign', range], queryFn: () => getCampaign(range), refetchInterval: 30_000 });
    if (q.isLoading) return <Loading what="캠페인" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const d = q.data;
    const c = d.totals.campaign;
    const n = d.totals.normal;
    const w = d.range.window;
    return (
        <div className="stack">
            <div className="tiles">
                <Tile label="캠페인 유입 세션" value={c.sessions} format={count} sub={<>평시 {count(n.sessions)}</>} href={rumUrl(`${RUM.sessions} ${CAMPAIGNS}`, w)} />
                <Tile label="캠페인 주문 체결" value={c.orders} format={count} sub={<>평시 {count(n.orders)}</>} href={rumUrl(`${RUM.orderFilled} ${CAMPAIGNS}`, w)} />
                <Tile label="캠페인 거래대금" value={c.krw} format={krw} sub={<>평시 {krw(n.krw)}</>} href={rumUrl(`${RUM.orderFilled} ${CAMPAIGNS}`, w)} />
                <Tile label="세션당 거래대금 (캠페인 / 평시)" value={ratio(c.krw, c.sessions)} format={krw} sub={<>평시 {krw(ratio(n.krw, n.sessions))}</>} />
            </div>
            <Card title={`캠페인 vs 평시 한 타임라인 (${d.range.label})`} extra={<span className="muted">붉은 띠 = 장애, 보라 띠 = 캠페인</span>}>
                <div className="grid-2">
                    <div>
                        <h4>유입 (세션)</h4>
                        <Chart series={relabel(d.sessions)} window={d.range.window} faults={d.windows} height={150} link={byCampaign(RUM.sessions)} />
                    </div>
                    <div>
                        <h4>가입</h4>
                        <Chart series={relabel(d.signups)} window={d.range.window} faults={d.windows} kind="bar" height={150} link={byCampaign(RUM.signup)} />
                    </div>
                    <div>
                        <h4>주문 체결 수</h4>
                        <Chart series={relabel(d.orders)} window={d.range.window} faults={d.windows} kind="bar" height={150} link={byCampaign(RUM.orderFilled)} />
                    </div>
                    <div>
                        <h4>거래대금</h4>
                        <Chart series={relabel(d.orderKrw)} window={d.range.window} faults={d.windows} kind="bar" height={150} format={krw} link={byCampaign(RUM.orderFilled)} />
                    </div>
                    <div>
                        <h4>주문 p95 (초)</h4>
                        <Chart series={d.orderP95} window={d.range.window} faults={d.windows} height={150} format={(v) => v.toFixed(2)} threshold={{ value: 1, label: '1초' }} link={(_, bw) => rumUrl(RUM.order, bw)} />
                    </div>
                    <div>
                        <h4>주문 실패율 (%)</h4>
                        <Chart series={d.orderFailRate} window={d.range.window} faults={d.windows} height={150} format={(v) => `${v.toFixed(0)}%`} empty="이 구간에 실패한 주문이 없습니다" link={(_, bw) => rumUrl(RUM.orderFailed, bw)} />
                    </div>
                </div>
            </Card>
            <Infra infra={d.infra} d={d} />
        </div>
    );
}
