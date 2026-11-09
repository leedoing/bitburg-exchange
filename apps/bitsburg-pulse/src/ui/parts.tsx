import { useEffect, useState, type ReactNode } from 'react';

import { FAULT_LABEL, LEVEL_LABEL, type FaultName, type FaultWindow, type Level, type StageSignal } from '../shared/types';
import { CountUp } from './CountUp';
import { elapsed } from './format';

export function Card({ title, extra, children, className }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`card ${className ?? ''}`}>
            {(title || extra) && (
                <header className="card-head">
                    <h3>{title}</h3>
                    {extra}
                </header>
            )}
            {children}
        </section>
    );
}

export function Tile({
    label,
    value,
    format,
    sub,
    level,
    href,
}: {
    label: string;
    value: number;
    format: (n: number) => string;
    sub?: ReactNode;
    level?: Level;
    href?: string | null;
}) {
    const body = (
        <>
            <div className="tile-label">
                {label}
                {href && <span className="tile-go"> ↗</span>}
            </div>
            <div className="tile-value">
                <CountUp value={value} format={format} />
            </div>
            {sub && <div className="tile-sub">{sub}</div>}
        </>
    );
    const cls = `tile ${level ? `lv-${level}` : ''}`;
    return href ? (
        <a className={`${cls} tile-link`} href={href} target="_blank" rel="noreferrer" title="RUM Explorer에서 보기">
            {body}
        </a>
    ) : (
        <div className={cls}>{body}</div>
    );
}

/** Wraps children in a new-tab link when href is set. */
export function MaybeLink({ href, children, className, title }: { href?: string | null; children: ReactNode; className?: string; title?: string }) {
    if (!href) return <>{children}</>;
    return (
        <a href={href} target="_blank" rel="noreferrer" className={`rum-link ${className ?? ''}`} title={title ?? 'RUM Explorer에서 보기'}>
            {children}
        </a>
    );
}

export function LevelTag({ level }: { level: Level }) {
    return (
        <span className={`level-tag lv-${level}`}>
            <span className="dot" aria-hidden />
            {LEVEL_LABEL[level]}
        </span>
    );
}

export function TrafficLights({ stages, links }: { stages: StageSignal[]; links?: Record<string, string> }) {
    return (
        <div className="lights">
            {stages.map((s, i) => (
                <div key={s.key} className="light-wrap">
                    <MaybeLink href={links?.[s.key]} className="light-link" title={`${s.label} 최근 5분 RUM 이벤트 보기`}>
                    <div className={`light lv-${s.level}`}>
                        <div className="light-top">
                            <span className="light-step">{i + 1}단계</span>
                            <span className="light-name">{s.label}</span>
                        </div>
                        <div className="lamp" aria-hidden>
                            <span className={s.level === 'bad' ? 'on' : ''} />
                            <span className={s.level === 'warn' ? 'on' : ''} />
                            <span className={s.level === 'ok' ? 'on' : ''} />
                        </div>
                        <div className="light-label">{LEVEL_LABEL[s.level]}</div>
                        <div className="light-headline">{s.headline}</div>
                        <div className="light-detail">{s.detail}</div>
                    </div>
                    </MaybeLink>
                    {i < stages.length - 1 && <div className="arrow" aria-hidden>›</div>}
                </div>
            ))}
        </div>
    );
}

function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

export function FaultBanner({ faults, campaign }: { faults: FaultWindow[]; campaign: FaultWindow | null }) {
    const now = useNow();
    if (!faults.length && !campaign) return null;
    return (
        <div className={`banner ${faults.length ? 'banner-bad' : 'banner-info'}`} role="alert">
            {faults.map((f) => (
                <div key={f.name} className="banner-row">
                    <strong>장애 진행 중</strong>
                    <span>{FAULT_LABEL[f.name as FaultName] ?? f.name}</span>
                    <span className="banner-time">경과 {elapsed(f.start, now)}</span>
                </div>
            ))}
            {campaign && (
                <div className="banner-row">
                    <strong>캠페인 진행 중</strong>
                    <span>{campaign.name}</span>
                    <span className="banner-time">경과 {elapsed(campaign.start, now)}</span>
                </div>
            )}
        </div>
    );
}

export function Loading({ what }: { what: string }) {
    return <div className="loading">{what} 불러오는 중…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
    return <div className="error-box">데이터를 불러오지 못했습니다: {error instanceof Error ? error.message : String(error)}</div>;
}
