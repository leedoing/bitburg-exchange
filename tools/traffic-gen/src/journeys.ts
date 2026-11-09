import type { Page } from 'playwright';
import { chance, lognormalKrw, randInt, sleep, think, weighted } from './random.js';

/**
 * Baseline step probabilities (DATA_SPEC 8). Faults never change these numbers;
 * only the give-up rules below react to slow responses.
 */
export interface Probabilities {
  completeSignup: number; // home -> signup completed: 75%
  submitKyc: number; // x vendor approval 92% ~= 80% signup -> KYC approved
  requestDeposit: number; // KYC -> first deposit completed: 65%
  placeFirstOrder: number; // deposit -> first order filled: 80%
}

export const BASELINE: Probabilities = { completeSignup: 0.75, submitKyc: 0.87, requestDeposit: 0.65, placeFirstOrder: 0.8 };
export const FULL: Probabilities = { completeSignup: 1, submitKyc: 1, requestDeposit: 1, placeFirstOrder: 1 };

const KYC_GIVE_UP_MS = 12_000;
const DEPOSIT_GIVE_UP_MS = 45_000;
const ORDER_GIVE_UP_MS = 3_000;

export interface JourneyOptions {
  probabilities: Probabilities;
  /** Symbol weights for buy orders. */
  symbols: Record<string, number>;
  /** Run every give-up rule check but never abandon (verification runs). */
  neverAbandon?: boolean;
  log: (msg: string) => void;
}

export type Outcome = string;

async function userTier(page: Page): Promise<string> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('bitsburg.user') ?? '{}').tier ?? 'new');
}

async function leave(page: Page) {
  await page.getByTestId('brand').click();
  await think();
}

/** Click the CS button and pick a topic. */
export async function contactCs(page: Page, topic: 'deposit' | 'kyc' | 'order') {
  await page.getByTestId('cs-open').click();
  await think();
  await page.getByTestId(`cs-topic-${topic}`).click();
  await think();
  await page.getByTestId('cs-open').click();
}

/** Wait until one of the selectors is visible, or the deadline passes. Returns the matched index or -1. */
async function waitForAny(page: Page, selectors: string[], timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = 0; i < selectors.length; i++) {
      if (await page.locator(selectors[i]).first().isVisible().catch(() => false)) return i;
    }
    await sleep(250);
  }
  return -1;
}

export async function buy(page: Page, opts: JourneyOptions, tier: string): Promise<'filled' | 'failed' | 'abandoned'> {
  const symbol = weighted(opts.symbols);
  await page.getByTestId(`symbol-${symbol}`).click();
  await think();
  const amount = lognormalKrw(50_000, 3_000_000, 300_000) * (tier === 'vip' ? 3 : 1);
  await page.getByTestId('order-amount').fill(String(amount));
  await think();
  const started = Date.now();
  await page.getByTestId('order-submit').click();
  let gaveUpChecked = false;
  while (true) {
    const msg = page.getByTestId('order-message');
    const busy = await page.getByTestId('order-submit').isDisabled().catch(() => false);
    if (!busy && (await msg.isVisible().catch(() => false))) {
      return (await msg.getAttribute('class')) === 'ok' ? 'filled' : 'failed';
    }
    if (!gaveUpChecked && Date.now() - started > ORDER_GIVE_UP_MS) {
      gaveUpChecked = true;
      if (!opts.neverAbandon && chance(0.3)) return 'abandoned';
    }
    if (Date.now() - started > 30_000) return 'failed';
    await sleep(200);
  }
}

export async function newMemberJourney(page: Page, target: string, opts: JourneyOptions): Promise<Outcome> {
  const p = opts.probabilities;
  await page.getByTestId('start-signup').click();
  await think();
  await page.getByTestId('signup-nickname').click();
  await page.getByTestId('signup-nickname').pressSequentially(`bitsfan${randInt(100, 999)}`, { delay: randInt(40, 120) });
  await think();
  if (!chance(p.completeSignup)) {
    await leave(page);
    return 'signup_dropped';
  }
  await page.getByTestId('signup-agree').check();
  await think();
  await page.getByTestId('signup-submit').click();
  await page.waitForURL('**/kyc', { timeout: 15_000 });
  await think();

  // KYC
  if (!chance(p.submitKyc)) {
    await leave(page);
    return 'kyc_not_submitted';
  }
  await page.getByTestId('kyc-submit').click();
  const kycStarted = Date.now();
  let checkedGiveUp = false;
  let kycResult = -1;
  while (kycResult < 0) {
    kycResult = await waitForAny(page, ['[data-testid="go-deposit"]', '.error'], 500);
    if (kycResult >= 0) break;
    if (!checkedGiveUp && Date.now() - kycStarted > KYC_GIVE_UP_MS) {
      checkedGiveUp = true;
      if (!opts.neverAbandon && chance(0.5)) {
        await page.getByTestId('kyc-cancel').click();
        await think();
        if (chance(0.2)) await contactCs(page, 'kyc');
        await leave(page);
        return 'kyc_abandoned';
      }
    }
    if (Date.now() - kycStarted > 40_000) return 'kyc_stuck';
  }
  await think();
  if (kycResult !== 0) {
    if (chance(0.15)) await contactCs(page, 'kyc');
    await leave(page);
    return 'kyc_failed';
  }

  // Deposit
  if (!chance(p.requestDeposit)) {
    await leave(page);
    return 'deposit_not_requested';
  }
  await page.getByTestId('go-deposit').click();
  await page.waitForURL('**/deposit');
  await think();
  const depositAmount = lognormalKrw(100_000, 5_000_000, 700_000);
  await page.getByTestId('deposit-amount').fill(String(depositAmount));
  await think();
  await page.getByTestId('deposit-submit').click();
  const depStarted = Date.now();
  let contacted = false;
  while (true) {
    if (await page.getByTestId('go-trade').isVisible().catch(() => false)) break;
    if (!contacted && Date.now() - depStarted > DEPOSIT_GIVE_UP_MS) {
      contacted = true;
      await contactCs(page, 'deposit');
      if (!opts.neverAbandon && chance(0.7)) {
        await leave(page);
        return 'deposit_abandoned';
      }
    }
    if (Date.now() - depStarted > 170_000) return 'deposit_stuck';
    await sleep(500);
  }
  await think();

  // First order
  if (!chance(p.placeFirstOrder)) {
    await leave(page);
    return 'order_not_placed';
  }
  await page.getByTestId('go-trade').click();
  await page.waitForURL('**/trade');
  await think();
  const result = await buy(page, opts, await userTier(page));
  return `first_order_${result}`;
}

export async function existingMemberJourney(page: Page, target: string, opts: JourneyOptions): Promise<Outcome> {
  await page.getByTestId('go-login').click();
  await think();
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/trade', { timeout: 15_000 });
  await think();
  const tier = await userTier(page);
  const orders = randInt(1, 3);
  let filled = 0;
  for (let i = 0; i < orders; i++) {
    const r = await buy(page, opts, tier);
    if (r === 'filled') filled++;
    if (r === 'abandoned') return `orders_abandoned_${filled}/${i + 1}`;
    await think();
  }
  return `orders_filled_${filled}/${orders}`;
}

/** Idle browsing on the trade page to stretch the session to its target length. */
export async function browse(page: Page, untilMs: number, opts: JourneyOptions) {
  if (!page.url().includes('/trade')) {
    await page.getByRole('link', { name: '거래소' }).click().catch(() => undefined);
  }
  while (Date.now() < untilMs) {
    const symbol = weighted(opts.symbols);
    await page.getByTestId(`symbol-${symbol}`).click().catch(() => undefined);
    await sleep(randInt(3000, 9000));
  }
}
