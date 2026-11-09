import type { BiLink } from '../shared/types';
import { count, pct } from './format';

const PALETTE = ['#7c5cff', '#21b1ff', '#2ea043', '#f0883e', '#c678dd', '#56b6c2', '#d19a66'];
const EXIT = '(exit)';
const EXIT_COLOR = '#8a8f98';

type Node = { key: string; col: number; name: string; value: number; y: number; h: number; outY: number; inY: number };

const W = 1200;
const H = 300;
const NODE_W = 14;
const GAP = 10;
const LABEL_W = 120;

/**
 * Columns are relative steps (link.step → link.step + 1). Node height ∝ sessions through it.
 * `labels` renames view names for display (e.g. '(exit)' → '이탈').
 */
export function Sankey({ links, labels, anchor }: { links: BiLink[]; labels: Record<string, string>; anchor: string }) {
    if (links.length === 0) return <div className="sankey-empty">이 구간에 경로 데이터가 없습니다</div>;

    const steps = [...new Set(links.flatMap((l) => [l.step, l.step + 1]))].sort((a, b) => a - b);
    const colOf = new Map(steps.map((s, i) => [s, i]));
    const nodes = new Map<string, Node>();
    const node = (step: number, name: string) => {
        const key = `${step}:${name}`;
        let n = nodes.get(key);
        if (!n) {
            n = { key, col: colOf.get(step)!, name, value: 0, y: 0, h: 0, outY: 0, inY: 0 };
            nodes.set(key, n);
        }
        return n;
    };
    const outSum = new Map<string, number>();
    const inSum = new Map<string, number>();
    for (const l of links) {
        const a = node(l.step, l.from);
        const b = node(l.step + 1, l.to);
        outSum.set(a.key, (outSum.get(a.key) ?? 0) + l.n);
        inSum.set(b.key, (inSum.get(b.key) ?? 0) + l.n);
    }
    for (const n of nodes.values()) n.value = Math.max(outSum.get(n.key) ?? 0, inSum.get(n.key) ?? 0);

    const cols = steps.map((_, c) =>
        [...nodes.values()].filter((n) => n.col === c).sort((a, b) => (a.name === EXIT ? 1 : b.name === EXIT ? -1 : b.value - a.value)),
    );
    const maxTotal = Math.max(...cols.map((c) => c.reduce((s, n) => s + n.value, 0)), 1);
    const maxNodes = Math.max(...cols.map((c) => c.length), 1);
    const scale = (H - GAP * (maxNodes - 1)) / maxTotal;
    const colX = (c: number) => (steps.length === 1 ? 0 : (c * (W - LABEL_W - NODE_W)) / (steps.length - 1));
    for (const col of cols) {
        let y = 0;
        for (const n of col) {
            n.h = Math.max(2, n.value * scale);
            n.y = y;
            n.outY = y;
            n.inY = y;
            y += n.h + GAP;
        }
    }

    const names = [...new Set([...nodes.values()].map((n) => n.name).filter((n) => n !== EXIT))].sort();
    const color = (name: string) => (name === EXIT ? EXIT_COLOR : PALETTE[names.indexOf(name) % PALETTE.length]);
    const label = (name: string) => labels[name] ?? name;

    const sorted = [...links].sort((a, b) => a.step - b.step || b.n - a.n);
    const paths = sorted.map((l) => {
        const a = nodes.get(`${l.step}:${l.from}`)!;
        const b = nodes.get(`${l.step + 1}:${l.to}`)!;
        const h = Math.max(1, l.n * scale);
        const x0 = colX(a.col) + NODE_W;
        const x1 = colX(b.col);
        const y0 = a.outY + h / 2;
        const y1 = b.inY + h / 2;
        a.outY += h;
        b.inY += h;
        const mx = (x0 + x1) / 2;
        const share = a.value > 0 ? (l.n / a.value) * 100 : 0;
        return (
            <path
                key={`${l.step}:${l.from}>${l.to}`}
                d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`}
                stroke={color(l.to)}
                strokeOpacity={0.35}
                strokeWidth={h}
                fill="none"
            >
                <title>{`${label(l.from)} → ${label(l.to)}: ${count(l.n)}세션 (${pct(share, 0)})`}</title>
            </path>
        );
    });

    return (
        <div className="sankey">
            <div className="sankey-cols" style={{ width: '100%' }}>
                {steps.map((s, c) => (
                    <span key={s} style={{ left: `${(colX(c) / W) * 100}%` }}>
                        {s === 0 ? anchor : s > 0 ? `+${s}` : `${s}`}
                    </span>
                ))}
            </div>
            <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} role="img" aria-label="경로 분석">
                {paths}
                {[...nodes.values()].map((n) => (
                    <g key={n.key}>
                        <rect x={colX(n.col)} y={n.y} width={NODE_W} height={n.h} rx={3} fill={color(n.name)}>
                            <title>{`${label(n.name)}: ${count(n.value)}세션`}</title>
                        </rect>
                        {n.h >= 12 && (
                            <text x={colX(n.col) + NODE_W + 6} y={n.y + n.h / 2} dominantBaseline="middle" className="sankey-label">
                                {label(n.name)} <tspan className="sankey-num">{count(n.value)}</tspan>
                            </text>
                        )}
                    </g>
                ))}
            </svg>
        </div>
    );
}
