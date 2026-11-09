import type { FaultWindow, Series, Window } from '../shared/types';
import { clock } from './format';

const PALETTE = ['#7c5cff', '#21b1ff', '#2ea043', '#f0883e', '#e5484d', '#c678dd', '#56b6c2', '#d19a66'];

type Props = {
    series: Series[];
    window: Window;
    faults?: FaultWindow[];
    kind?: 'line' | 'bar';
    height?: number;
    format?: (n: number) => string;
    threshold?: { value: number; label: string };
    empty?: string;
};

const defaultFormat = (n: number) => (Math.abs(n) < 10 ? String(Math.round(n * 10) / 10) : Math.round(n).toLocaleString('ko-KR'));

export function Chart({ series, window, faults = [], kind = 'line', height = 180, format = defaultFormat, threshold, empty }: Props) {
    const width = 720;
    const pad = { l: 52, r: 12, t: 12, b: 24 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const span = Math.max(1, window.to - window.from);
    const x = (t: number) => pad.l + ((t - window.from) / span) * innerW;

    const all = series.flatMap((s) => s.points.map((p) => p[1]));
    const max = Math.max(threshold?.value ?? 0, ...all, 1) * 1.1;
    const y = (v: number) => pad.t + innerH - (v / max) * innerH;
    const hasData = all.some((v) => v > 0);

    const ticks = 5;
    const xTicks = Array.from({ length: ticks }, (_, i) => window.from + (span * i) / (ticks - 1));
    const bands = faults
        .filter((f) => f.kind === 'fault')
        .map((f) => ({ ...f, a: Math.max(window.from, f.start), b: Math.min(window.to, f.end ?? window.to) }))
        .filter((f) => f.b > f.a);
    const campaigns = faults
        .filter((f) => f.kind === 'campaign')
        .map((f) => ({ ...f, a: Math.max(window.from, f.start), b: Math.min(window.to, f.end ?? window.to) }))
        .filter((f) => f.b > f.a);

    const nBars = series.length || 1;
    const step = series[0]?.points.length ? innerW / series[0].points.length : innerW;

    return (
        <div className="chart">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="none">
                {campaigns.map((c) => (
                    <rect key={`c${c.start}`} x={x(c.a)} y={pad.t} width={x(c.b) - x(c.a)} height={innerH} className="band-campaign" />
                ))}
                {bands.map((b) => (
                    <g key={`f${b.start}`}>
                        <rect x={x(b.a)} y={pad.t} width={x(b.b) - x(b.a)} height={innerH} className="band-fault" />
                        <text x={x(b.a) + 4} y={pad.t + 12} className="band-label">
                            장애 {b.name}
                        </text>
                    </g>
                ))}
                {[0, 0.5, 1].map((f) => (
                    <g key={f}>
                        <line x1={pad.l} x2={width - pad.r} y1={y(max * f / 1.1)} y2={y(max * f / 1.1)} className="grid" />
                        <text x={pad.l - 6} y={y(max * f / 1.1) + 4} className="axis" textAnchor="end">
                            {format((max * f) / 1.1)}
                        </text>
                    </g>
                ))}
                {xTicks.map((t) => (
                    <text key={t} x={x(t)} y={height - 6} className="axis" textAnchor="middle">
                        {clock(t)}
                    </text>
                ))}
                {threshold && (
                    <g>
                        <line x1={pad.l} x2={width - pad.r} y1={y(threshold.value)} y2={y(threshold.value)} className="threshold" />
                        <text x={width - pad.r - 4} y={y(threshold.value) - 4} className="threshold-label" textAnchor="end">
                            {threshold.label}
                        </text>
                    </g>
                )}
                {kind === 'line' &&
                    series.map((s, i) => (
                        <polyline
                            key={s.label}
                            fill="none"
                            stroke={PALETTE[i % PALETTE.length]}
                            strokeWidth={2}
                            points={s.points.map(([t, v]) => `${x(t)},${y(v)}`).join(' ')}
                        />
                    ))}
                {kind === 'bar' &&
                    series.map((s, i) =>
                        s.points.map(([t, v]) => (
                            <rect
                                key={`${s.label}${t}`}
                                x={x(t) + (step / nBars) * i}
                                y={y(v)}
                                width={Math.max(1, step / nBars - 1)}
                                height={Math.max(0, pad.t + innerH - y(v))}
                                fill={PALETTE[i % PALETTE.length]}
                            />
                        )),
                    )}
            </svg>
            {!hasData && <div className="chart-empty">{empty ?? '이 구간에 데이터가 없습니다'}</div>}
            <div className="legend">
                {series.map((s, i) => (
                    <span key={s.label}>
                        <i style={{ background: PALETTE[i % PALETTE.length] }} />
                        {s.label}
                    </span>
                ))}
                {bands.length > 0 && (
                    <span>
                        <i className="legend-fault" />
                        장애 구간 (Datadog Event)
                    </span>
                )}
                {campaigns.length > 0 && (
                    <span>
                        <i className="legend-campaign" />
                        캠페인 구간
                    </span>
                )}
            </div>
        </div>
    );
}
