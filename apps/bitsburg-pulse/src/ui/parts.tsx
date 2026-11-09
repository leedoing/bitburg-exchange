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

export function Tile({ label, value, format, sub, level }: { label: string; value: number; format: (n: number) => string; sub?: ReactNode; level?: Level }) {
    return (
        <div className={`tile ${level ? `lv-${level}` : ''}`}>
            <div className="tile-label">{label}</div>
            <div className="tile-value">
                <CountUp value={value} format={format} />
            </div>
            {sub && <div className="tile-sub">{sub}</div>}
        </div>
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

export function TrafficLights({ stages }: { stages: StageSignal[] }) {
    return (
        <div className="lights">
            {stages.map((s, i) => (
                <div key={s.key} className="light-wrap">
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
