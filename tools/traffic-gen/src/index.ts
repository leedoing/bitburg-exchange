import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { parseArgs } from 'node:util';
import { BASELINE, browse, contactCs, existingMemberJourney, FULL, JourneyOptions, newMemberJourney } from './journeys.js';
import { startHttpLoad } from './httpLoad.js';
import { chance, rand, randInt, sleep, think, weighted } from './random.js';

// Desktop Chrome UA: the headless default ("HeadlessChrome") can be classified as bot/synthetic traffic.
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';

const { values: args } = parseArgs({
  options: {
    mode: { type: 'string', default: 'baseline' },
    concurrency: { type: 'string', default: '10' },
    duration: { type: 'string', default: '0' },
    target: { type: 'string', default: 'http://localhost' },
    sessions: { type: 'string', default: '0' },
    headed: { type: 'boolean', default: false },
  },
});

const mode = args.mode as 'baseline' | 'listing_spike' | 'verify';
const target = args.target!.replace(/\/$/, '');
const concurrency = Number(args.concurrency);
const durationMin = Number(args.duration);
const maxSessions = Number(args.sessions);
const deadline = durationMin > 0 ? Date.now() + durationMin * 60_000 : Infinity;

let sessionsStarted = 0;
let stopping = false;
const stats: Record<string, number> = {};

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function pickVersion() {
  return chance(0.4) ? '3.5.0' : '3.4.2';
}

function pickPlatform() {
  return weighted({ web: 30, ios: 40, android: 30 });
}

function pickCampaign(): { campaign: string; source: string } {
  if (mode === 'listing_spike') return { campaign: 'listing_pups', source: weighted({ push: 50, kakao_ad: 30, naver_sa: 20 }) };
  if (chance(0.05)) return { campaign: 'promo_deposit_bonus', source: weighted({ push: 60, kakao_ad: 40 }) };
  return { campaign: 'none', source: weighted({ organic: 60, push: 15, kakao_ad: 15, naver_sa: 10 }) };
}

async function currentScenario(): Promise<string> {
  try {
    const res = await fetch(`${target}/api/demo/state`);
    return ((await res.json()) as { scenario: string }).scenario ?? 'baseline';
  } catch {
    return 'baseline';
  }
}

function journeyOptions(): JourneyOptions {
  return {
    probabilities: mode === 'verify' ? FULL : BASELINE,
    symbols: mode === 'listing_spike' ? { PUPS: 85, BITS: 8, DOGE2: 4, WOOF: 3 } : { BITS: 45, DOGE2: 25, WOOF: 20, PUPS: 10 },
    neverAbandon: mode === 'verify',
    log,
  };
}

async function openSession(browser: Browser, version: string) {
  const { campaign, source } = pickCampaign();
  const platform = pickPlatform();
  const scenario = await currentScenario();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const qs = new URLSearchParams({ appv: version, platform, campaign, source, scenario });
  await page.goto(`${target}/?${qs}`, { waitUntil: 'domcontentloaded' });
  await think();
  return { context, page, meta: `${version} ${platform} ${campaign} ${scenario}` };
}

/** Leave the page so the RUM SDK flushes (pagehide), then close the context. */
async function closeSession(context: BrowserContext, page: Page) {
  await page.goto('about:blank').catch(() => undefined);
  await sleep(1000);
  await context.close().catch(() => undefined);
}

async function runSession(browser: Browser) {
  const version = pickVersion();
  const sessionEnd = Date.now() + rand(60_000, 240_000);
  const { context, page, meta } = await openSession(browser, version);
  const opts = journeyOptions();
  let outcome = 'error';
  try {
    const isNew = chance(0.4);
    outcome = isNew ? `new:${await newMemberJourney(page, target, opts)}` : `existing:${await existingMemberJourney(page, target, opts)}`;
    await browse(page, sessionEnd, opts);
  } catch (err) {
    outcome = `error:${(err as Error).message.split('\n')[0].slice(0, 80)}`;
  } finally {
    await closeSession(context, page);
  }
  const key = outcome.replace(/_\d+\/\d+$/, '');
  stats[key] = (stats[key] ?? 0) + 1;
  log(`session done [${meta}] ${outcome}`);
}

/** One deterministic pass that fires every action and operation (used for step 3 verification). */
async function runVerify(browser: Browser) {
  for (const version of ['3.4.2', '3.5.0']) {
    const { context, page, meta } = await openSession(browser, version);
    const opts = journeyOptions();
    try {
      // kyc_failed (abandoned) first: submit, cancel, then the full journey.
      await page.getByTestId('start-signup').click();
      await page.getByTestId('signup-nickname').pressSequentially('verify', { delay: 60 });
      await page.getByTestId('signup-agree').check();
      await page.getByTestId('signup-submit').click();
      await page.waitForURL('**/kyc');
      await page.getByTestId('kyc-submit').click();
      await sleep(400);
      await page.getByTestId('kyc-cancel').click();
      await think();
      let approved = false;
      for (let i = 0; i < 4 && !approved; i++) {
        await page.getByTestId('kyc-submit').click();
        const r = await page.waitForSelector('[data-testid="go-deposit"], .error', { timeout: 40_000 });
        approved = (await r.getAttribute('data-testid')) === 'go-deposit';
        await think();
      }
      await page.getByTestId('go-deposit').click();
      await page.getByTestId('deposit-amount').fill('1200000');
      await page.getByTestId('deposit-submit').click();
      const stuckOrDone = await page.waitForSelector('[data-testid="go-trade"], [data-testid="deposit-stuck"]', { timeout: 120_000 });
      log(`deposit: ${await stuckOrDone.getAttribute('data-testid')}`);
      await page.getByTestId('go-trade').waitFor({ timeout: 150_000 });
      await page.getByTestId('go-trade').click();
      await page.getByTestId('order-amount').fill('300000');
      await page.getByTestId('order-submit').click();
      await page.getByTestId('order-message').waitFor();
      await think();
      // order_failed: an invalid amount is rejected by the API (HTTP 400).
      await page.getByTestId('order-amount').fill('0');
      await page.getByTestId('order-submit').click();
      await sleep(1500);
      await contactCs(page, 'deposit');
      await sleep(3000);
      log(`verify session done [${meta}]`);
    } finally {
      await closeSession(context, page);
    }
    const existing = await openSession(browser, version);
    try {
      log(`existing [${existing.meta}] ${await existingMemberJourney(existing.page, target, opts)}`);
    } finally {
      await closeSession(existing.context, existing.page);
    }
  }
}

async function worker(browser: Browser, id: number) {
  await sleep(id * randInt(500, 2500));
  while (!stopping && Date.now() < deadline && (maxSessions === 0 || sessionsStarted < maxSessions)) {
    sessionsStarted++;
    await runSession(browser).catch((err) => log(`worker ${id} error: ${err}`));
  }
}

async function main() {
  log(`traffic-gen mode=${mode} concurrency=${concurrency} duration=${durationMin || '∞'}m target=${target}`);
  const browser = await chromium.launch({ headless: !args.headed, args: ['--disable-dev-shm-usage'] });
  const shutdown = () => {
    stopping = true;
    log(`stopping... stats ${JSON.stringify(stats)}`);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (mode === 'verify') {
    await runVerify(browser);
  } else {
    const stopHttp = mode === 'listing_spike' ? startHttpLoad(target, randInt(35, 65), () => stopping || Date.now() > deadline, log) : null;
    const statsTimer = setInterval(() => log(`stats ${JSON.stringify(stats)}`), 60_000);
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(browser, i)));
    clearInterval(statsTimer);
    await stopHttp?.();
  }
  await browser.close();
  log(`done. stats ${JSON.stringify(stats)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
