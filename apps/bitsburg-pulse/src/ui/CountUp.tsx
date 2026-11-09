import { useEffect, useRef, useState } from 'react';

function useCountUp(target: number, durationMs = 900): number {
    const [value, setValue] = useState(0);
    const from = useRef(0);
    useEffect(() => {
        const start = performance.now();
        const begin = from.current;
        let frame = 0;
        const tick = (t: number) => {
            const p = Math.min(1, (t - start) / durationMs);
            const eased = 1 - Math.pow(1 - p, 3);
            const v = begin + (target - begin) * eased;
            setValue(v);
            if (p < 1) frame = requestAnimationFrame(tick);
            else from.current = target;
        };
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frame);
            from.current = target;
        };
    }, [target, durationMs]);
    return value;
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
    const v = useCountUp(Number.isFinite(value) ? value : 0);
    return <>{format(v)}</>;
}
