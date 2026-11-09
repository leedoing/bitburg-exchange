import { ToggleButtons } from '@datadog/druids/form/ToggleButtons';
import { useIsFetching } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import type { RangeKey } from './shared/types';
import { Campaign } from './tabs/Campaign';
import { Control } from './tabs/Control';
import { Exec } from './tabs/Exec';
import { Ops } from './tabs/Ops';
import { Pm } from './tabs/Pm';
import { Situation } from './tabs/Situation';

const TABS = [
    { value: 'situation', label: '상황판' },
    { value: 'ops', label: '운영·CS' },
    { value: 'pm', label: 'PM·DA' },
    { value: 'campaign', label: '캠페인' },
    { value: 'exec', label: '경영 요약' },
    { value: 'control', label: '시나리오 컨트롤' },
] as const;
type TabKey = (typeof TABS)[number]['value'];

const RANGES: { value: RangeKey; label: string }[] = [
    { value: '1h', label: '1시간' },
    { value: '6h', label: '6시간' },
    { value: '24h', label: '24시간' },
    { value: 'fault', label: '장애 구간' },
];

/** Deep link format: #/<tab>?range=<1h|6h|24h|fault> */
function parseHash(): { tab: TabKey; range: RangeKey } {
    const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
    const tab = (TABS.find((t) => t.value === path)?.value ?? 'situation') as TabKey;
    const r = new URLSearchParams(query).get('range');
    const range = (RANGES.find((x) => x.value === r)?.value ?? '1h') as RangeKey;
    return { tab, range };
}

function useHashRoute() {
    const [route, setRoute] = useState(parseHash);
    useEffect(() => {
        const onHash = () => setRoute(parseHash());
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);
    const navigate = useCallback((next: Partial<{ tab: TabKey; range: RangeKey }>) => {
        const cur = parseHash();
        const tab = next.tab ?? cur.tab;
        const range = next.range ?? cur.range;
        window.location.hash = `#/${tab}?range=${range}`;
    }, []);
    return { ...route, navigate };
}

function App() {
    const { tab, range, navigate } = useHashRoute();
    const fetching = useIsFetching();

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
                    {tab !== 'control' && (
                        <ToggleButtons<RangeKey> options={RANGES} value={range} onChange={(v) => navigate({ range: v })} size="sm" />
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
            <div className="content">
                {tab === 'situation' && <Situation range={range} />}
                {tab === 'ops' && <Ops range={range} />}
                {tab === 'pm' && <Pm range={range} />}
                {tab === 'campaign' && <Campaign range={range} />}
                {tab === 'exec' && <Exec range={range} />}
                {tab === 'control' && <Control />}
            </div>
        </main>
    );
}

export default App;
