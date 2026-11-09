export function krw(n: number): string {
    const v = Math.round(n);
    if (Math.abs(v) >= 1_000_000_000_000) return `₩${(v / 1_000_000_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}조`;
    if (Math.abs(v) >= 100_000_000) return `₩${(v / 100_000_000).toFixed(2)}억`;
    if (Math.abs(v) >= 10_000) return `₩${Math.round(v / 10_000).toLocaleString('ko-KR')}만`;
    return `₩${v.toLocaleString('ko-KR')}`;
}

export const count = (n: number) => Math.round(n).toLocaleString('ko-KR');

export const pct = (n: number, digits = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;

export function clock(ms: number): string {
    return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

export function dateTime(ms: number): string {
    return new Date(ms).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul',
    });
}

export function elapsed(fromMs: number, nowMs: number): string {
    const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
