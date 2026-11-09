const STABLE = import.meta.env.VITE_APP_VERSION_STABLE ?? '3.4.2';
const NEW = import.meta.env.VITE_APP_VERSION_NEW ?? '3.5.0';
const NEW_VERSION_SHARE = 0.4;

const PLATFORMS = ['web', 'ios', 'android'] as const;
const CAMPAIGNS = ['none', 'listing_pups', 'promo_deposit_bonus'] as const;
const SOURCES = ['organic', 'push', 'kakao_ad', 'naver_sa'] as const;
const SCENARIOS = ['baseline', 'kyc_vendor_slow', 'deposit_delay', 'listing_spike'] as const;

export interface DemoConfig {
  appVersion: string;
  kycFlowV2: boolean;
  platform: string;
  campaign: string;
  source: string;
  /** null = follow the live demo state from /api/demo/state */
  scenario: string | null;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];
}

function pick<T extends readonly string[]>(allowed: T, value: string | null | undefined, fallback: T[number]): T[number] {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

/** Read once per tab: URL query first, then sessionStorage, then cookie / random assignment. */
function load(): DemoConfig {
  const q = new URLSearchParams(window.location.search);
  const saved = JSON.parse(sessionStorage.getItem('bitsburg.config') ?? 'null') as DemoConfig | null;

  const requested = q.get('appv') ?? saved?.appVersion ?? readCookie('appv');
  const appVersion: string =
    requested === STABLE || requested === NEW ? requested : Math.random() < NEW_VERSION_SHARE ? NEW : STABLE;
  document.cookie = `appv=${appVersion}; path=/; max-age=86400`;

  const scenarioParam = q.get('scenario');
  const config: DemoConfig = {
    appVersion,
    kycFlowV2: appVersion === NEW,
    platform: pick(PLATFORMS, q.get('platform') ?? saved?.platform, 'web'),
    campaign: pick(CAMPAIGNS, q.get('campaign') ?? saved?.campaign, 'none'),
    source: pick(SOURCES, q.get('source') ?? saved?.source, 'organic'),
    scenario: scenarioParam ? pick(SCENARIOS, scenarioParam, 'baseline') : saved?.scenario ?? null,
  };
  sessionStorage.setItem('bitsburg.config', JSON.stringify(config));
  return config;
}

export const config = load();
