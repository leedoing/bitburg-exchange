import { useContext, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { openUrl } from '../shared/links';
import { FAULT_LABEL, MIN_ZOOM_MS, type FaultName, type FaultWindow, type Series, type Window } from '../shared/types';
import { clock } from './format';
import { ZoomContext } from './zoom';

/** Pointer travel (in SVG units) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 6;

/** Fault labels that would collide (same or close start) go on separate rows. Width is a rough per-character estimate. */
const LABEL_ROW_H = 13;
const labelWidth = (text: string) => text.length * 11 + 8;

/** Builds a RUM Explorer link for one series (or all series when label is null) over a time bucket. */
export type ChartLink = (label: string | null, w: Window) => string | null;

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
    link?: ChartLink;
    /** Where `link` goes, for tooltips. */
    linkTarget?: string;
};

const defaultFormat = (n: number) => (Math.abs(n) < 10 ? String(Math.round(n * 10) / 10) : Math.round(n).toLocaleString('ko-KR'));

export function Chart({ series, window, faults = [], kind = 'line', height = 180, format = defaultFormat, threshold, empty, link, linkTarget = 'RUM Explorer' }: Props) {
    const width = 720;
    const pad = { l: 52, r: 12, t: 12, b: 24 };
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const span = Math.max(1, window.to - window.from);
    const x = (t: number) => pad.l + ((t - window.from) / span) * innerW;

    const zoom = useContext(ZoomContext);
    const svgRef = useRef<SVGSVGElement>(null);
    const dragged = useRef(false);
    const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
    const toSvgX = (clientX: number) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r || r.width === 0) return pad.l;
        return Math.min(width - pad.r, Math.max(pad.l, ((clientX - r.left) / r.width) * width));
    };
    const timeAt = (sx: number) => window.from + ((sx - pad.l) / innerW) * span;
    const onPointerDown = (ev: ReactPointerEvent<SVGSVGElement>) => {
        if (!zoom || ev.button !== 0) return;
        const a = toSvgX(ev.clientX);
        dragged.current = false;
        const move = (e: PointerEvent) => {
            const b = toSvgX(e.clientX);
            if (Math.abs(b - a) > DRAG_THRESHOLD) dragged.current = true;
            if (dragged.current) setSel({ a, b });
        };
        const up = (e: PointerEvent) => {
            globalThis.removeEventListener('pointermove', move);
            globalThis.removeEventListener('pointerup', up);
            globalThis.removeEventListener('pointercancel', up);
            setSel(null);
            if (!dragged.current || e.type === 'pointercancel') return;
            const b = toSvgX(e.clientX);
            let from = timeAt(Math.min(a, b));
            let to = timeAt(Math.max(a, b));
            if (to - from < MIN_ZOOM_MS) {
                const mid = (from + to) / 2;
                from = mid - MIN_ZOOM_MS / 2;
                to = mid + MIN_ZOOM_MS / 2;
            }
            zoom({ from, to });
        };
        globalThis.addEventListener('pointermove', move);
        globalThis.addEventListener('pointerup', up);
        globalThis.addEventListener('pointercancel', up);
    };

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
    const rowEnds: number[] = [];
    const bandLabels = bands.map((b) => {
        const text = `장애 · ${FAULT_LABEL[b.name as FaultName] ?? b.name}`;
        const lx = x(b.a) + 4;
        let row = rowEnds.findIndex((end) => end <= lx);
        if (row < 0) row = rowEnds.push(0) - 1;
        rowEnds[row] = lx + labelWidth(text);
        return { text, lx, y: pad.t + 12 + row * LABEL_ROW_H };
    });
    const campaigns = faults
        .filter((f) => f.kind === 'campaign')
        .map((f) => ({ ...f, a: Math.max(window.from, f.start), b: Math.min(window.to, f.end ?? window.to) }))
        .filter((f) => f.b > f.a);

    const nBars = series.length || 1;
    const step = series[0]?.points.length ? innerW / series[0].points.length : innerW;
    const pts = series[0]?.points ?? [];
    const bucket = pts.length > 1 ? pts[1][0] - pts[0][0] : span;
    const bucketOf = (t: number): Window => ({ from: t, to: Math.min(window.to, t + bucket) });
    const onlyLabel = series.length === 1 ? series[0].label : null;
    const go = (label: string | null, w: Window) => {
        if (!dragged.current) openUrl(link?.(label, w));
    };
    const tip = (label: string | null, t: number) =>
        `${label ?? '전체'} · ${clock(t)}~${clock(t + bucket)} · 클릭하면 ${linkTarget}${zoom ? ' · 드래그하면 구간 확대' : ''}`;

    return (
        <div className={`chart ${link ? 'chart-link' : ''} ${zoom ? 'chart-zoom' : ''}`}>
            <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="none" onPointerDown={onPointerDown}>
                {zoom && !link && <title>드래그하면 그 구간으로 좁혀집니다</title>}
                {campaigns.map((c) => (
                    <rect key={`c${c.name}${c.start}`} x={x(c.a)} y={pad.t} width={x(c.b) - x(c.a)} height={innerH} className="band-campaign" />
                ))}
                {bands.map((b, i) => (
                    <rect key={`f${b.name}${b.start}`} x={x(b.a)} y={pad.t} width={x(b.b) - x(b.a)} height={innerH} className="band-fault">
                        <title>{`${bandLabels[i].text} · ${clock(b.start)}~${b.end ? clock(b.end) : '진행 중'}`}</title>
                    </rect>
                ))}
                {bands.map((b, i) => (
                    <text key={`l${b.name}${b.start}`} x={bandLabels[i].lx} y={bandLabels[i].y} className="band-label">
                        {bandLabels[i].text}
                    </text>
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
                {kind === 'line' &&
                    link &&
                    pts.map(([t]) => (
                        <rect
                            key={`hit${t}`}
                            x={x(t)}
                            y={pad.t}
                            width={Math.max(1, x(t + bucket) - x(t))}
                            height={innerH}
                            className="hit"
                            onClick={() => go(onlyLabel, bucketOf(t))}
                        >
                            <title>{tip(onlyLabel, t)}</title>
                        </rect>
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
                                className={link && v > 0 ? 'bar-link' : undefined}
                                onClick={link && v > 0 ? () => go(s.label, bucketOf(t)) : undefined}
                            >
                                {link && v > 0 && <title>{`${tip(s.label, t)} (${format(v)})`}</title>}
                            </rect>
                        )),
                    )}
                {sel && (
                    <g>
                        <rect x={Math.min(sel.a, sel.b)} y={pad.t} width={Math.abs(sel.b - sel.a)} height={innerH} className="zoom-sel" />
                        <text x={Math.min(sel.a, sel.b) + 4} y={pad.t + innerH - 6} className="zoom-label">
                            {clock(timeAt(Math.min(sel.a, sel.b)))}~{clock(timeAt(Math.max(sel.a, sel.b)))}
                        </text>
                    </g>
                )}
            </svg>
            {!hasData && <div className="chart-empty">{empty ?? '이 구간에 데이터가 없습니다'}</div>}
            <div className="legend">
                {series.map((s, i) =>
                    link ? (
                        <button key={s.label} type="button" className="legend-link" onClick={() => go(s.label, window)} title={`${s.label} · 이 구간 전체를 ${linkTarget}에서 보기`}>
                            <i style={{ background: PALETTE[i % PALETTE.length] }} />
                            {s.label} ↗
                        </button>
                    ) : (
                        <span key={s.label}>
                            <i style={{ background: PALETTE[i % PALETTE.length] }} />
                            {s.label}
                        </span>
                    ),
                )}
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
