import { ToggleButtons } from '@datadog/druids/form/ToggleButtons';
import { useIsFetching } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { asRangeKey, customRange, parseCustomRange, PRESET_RANGES, type PresetRange, type RangeKey, type Window } from './shared/types';
import { Bi } from './tabs/Bi';
import { Campaign } from './tabs/Campaign';
import { Control } from './tabs/Control';
import { Exec } from './tabs/Exec';
import { Ops } from './tabs/Ops';
import { Pm } from './tabs/Pm';
import { Situation } from './tabs/Situation';
import { clock, dateTime } from './ui/format';
import { ZoomContext } from './ui/zoom';

const TABS = [
    { value: 'situation', label: '상황판' },
    { value: 'ops', label: '운영·CS' },
    { value: 'pm', label: 'PM·DA' },
    { value: 'bi', label: 'BI·그로스' },
    { value: 'campaign', label: '캠페인' },
    { value: 'exec', label: '경영 요약' },
    { value: 'control', label: '시나리오 컨트롤' },
] as const;
type TabKey = (typeof TABS)[number]['value'];

const RANGES: { value: PresetRange; label: string }[] = [
    { value: '1h', label: '1시간' },
    { value: '6h', label: '6시간' },
    { value: '24h', label: '24시간' },
    { value: 'fault', label: '장애 구간' },
];

/** Deep link format: #/<tab>?range=<1h|6h|24h|fault|c<fromMs>-<toMs>> */
function parseHash(): { tab: TabKey; range: RangeKey } {
    const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
    const tab = (TABS.find((t) => t.value === path)?.value ?? 'situation') as TabKey;
    const range = asRangeKey(new URLSearchParams(query).get('range'));
    return { tab, range };
}

const isPreset = (r: RangeKey): r is PresetRange => PRESET_RANGES.includes(r as PresetRange);

function zoomLabel(w: Window): string {
    const day = (ms: number) => dateTime(ms).split(' ').slice(0, 2).join(' ');
    return day(w.from) === day(w.to) ? `${clock(w.from)}~${clock(w.to)}` : `${dateTime(w.from)}~${dateTime(w.to)}`;
}

function useHashRoute() {
    const [route, setRoute] = useState(parseHash);
    /** Preset to return to when the dragged window is cleared. */
    const lastPreset = useRef<PresetRange>('1h');
    useEffect(() => {
        const first = parseHash().range;
        if (isPreset(first)) lastPreset.current = first;
        const onHash = () => {
            const next = parseHash();
            if (isPreset(next.range)) lastPreset.current = next.range;
            setRoute(next);
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);
    const navigate = useCallback((next: Partial<{ tab: TabKey; range: RangeKey }>) => {
        const cur = parseHash();
        const tab = next.tab ?? cur.tab;
        const range = next.range ?? cur.range;
        window.location.hash = `#/${tab}?range=${range}`;
    }, []);
    const clearZoom = useCallback(() => navigate({ range: lastPreset.current }), [navigate]);
    return { ...route, navigate, clearZoom };
}

function App() {
    const { tab, range, navigate, clearZoom } = useHashRoute();
    const fetching = useIsFetching();
    const custom = parseCustomRange(range);
    const zoom = useCallback((w: Window) => navigate({ range: customRange(w) }), [navigate]);

    return (
        <main className="pulse">
            <header className="top">
                <div className="brand">
                    <span className="logo" aria-hidden>
                        ₿
                    </span>
                    <div>
                        <h1>Bitsburg Pulse</h1>
                        <p>신규 회원이 가입부터 첫 거래까지 막힘없이 가고 있는가</p>
                    </div>
                </div>
                <div className="top-right">
                    <span className={`sync ${fetching ? 'sync-on' : ''}`}>{fetching ? '갱신 중' : '실시간 · 30초'}</span>
                    {tab !== 'control' && custom && (
                        <span className="zoom-chip" title="그래프에서 드래그한 구간입니다. 브라우저 뒤로 가기로 이전 구간으로 돌아갈 수도 있습니다.">
                            선택 구간 {zoomLabel(custom)}
                            <button type="button" onClick={clearZoom}>
                                ✕ 해제
                            </button>
                        </span>
                    )}
                    {tab !== 'control' && (
                        <ToggleButtons<PresetRange, true>
                            canBeEmpty
                            options={RANGES}
                            value={isPreset(range) ? range : null}
                            onChange={(v) => v && navigate({ range: v })}
                            size="sm"
                        />
                    )}
                </div>
            </header>
            <nav className="tabs" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.value}
                        role="tab"
                        aria-selected={t.value === tab}
                        className={t.value === tab ? 'tab tab-on' : 'tab'}
                        onClick={() => navigate({ tab: t.value })}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>
            <ZoomContext.Provider value={zoom}>
                <div className="content">
                    {tab === 'situation' && <Situation range={range} />}
                    {tab === 'ops' && <Ops range={range} />}
                    {tab === 'pm' && <Pm range={range} />}
                    {tab === 'bi' && <Bi range={range} />}
                    {tab === 'campaign' && <Campaign range={range} />}
                    {tab === 'exec' && <Exec range={range} />}
                    {tab === 'control' && <Control />}
                </div>
            </ZoomContext.Provider>
        </main>
    );
}

export default App;
