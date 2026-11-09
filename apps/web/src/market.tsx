import { useEffect, useMemo, useState } from 'react';

export const COINS = [
  { symbol: 'BITS', name: '비츠', base: 48_200 },
  { symbol: 'DOGE2', name: '도지투', base: 312 },
  { symbol: 'WOOF', name: '우프', base: 1_870 },
  { symbol: 'PUPS', name: '펍스 (신규 상장)', base: 95 },
] as const;

export type CoinSymbol = (typeof COINS)[number]['symbol'];

function walk(base: number, n: number) {
  const out = [base];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + (Math.random() - 0.48) * 0.02));
  return out;
}

export function useTicker(base: number, points = 48) {
  const [series, setSeries] = useState(() => walk(base, points));
  useEffect(() => {
    const id = setInterval(() => {
      setSeries((s) => [...s.slice(1), s[s.length - 1] * (1 + (Math.random() - 0.49) * 0.008)]);
    }, 1500);
    return () => clearInterval(id);
  }, []);
  return series;
}

export function formatKrw(n: number) {
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}

export function Sparkline({ series, height = 120 }: { series: number[]; height?: number }) {
  const width = 600;
  const { path, area, up } = useMemo(() => {
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const pts = series.map((v, i) => [(i / (series.length - 1)) * width, height - ((v - min) / span) * (height - 8) - 4]);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { path: d, area: `${d} L${width},${height} L0,${height} Z`, up: series[series.length - 1] >= series[0] };
  }, [series, height]);
  const color = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

export function OrderBook({ price }: { price: number }) {
  const rows = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        ask: price * (1 + (6 - i) * 0.0012),
        bid: price * (1 - (i + 1) * 0.0012),
        askQty: Math.random() * 40 + 1,
        bidQty: Math.random() * 40 + 1,
      })),
    [Math.round(price)],
  );
  return (
    <div className="orderbook">
      <div className="ob-head">
        <span>호가</span>
        <span>수량</span>
      </div>
      {rows.map((r, i) => (
        <div className="ob-row ask" key={`a${i}`}>
          <span>{r.ask.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span>
          <span>{r.askQty.toFixed(2)}</span>
        </div>
      ))}
      <div className="ob-mid">{price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
      {rows.map((r, i) => (
        <div className="ob-row bid" key={`b${i}`}>
          <span>{r.bid.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span>
          <span>{r.bidQty.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
