import { chance, lognormalKrw, randInt, sleep, weighted } from './random.js';

/**
 * listing_spike HTTP load: virtual users that log in and keep buying (mostly PUPS)
 * with campaign=listing_pups headers. No browser, so no RUM sessions — APM, logs and metrics only.
 */
export function startHttpLoad(target: string, users: number, shouldStop: () => boolean, log: (m: string) => void) {
  let ok = 0;
  let failed = 0;

  const loop = async (id: number) => {
    await sleep(randInt(0, 3000));
    while (!shouldStop()) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-app-version': chance(0.4) ? '3.5.0' : '3.4.2',
        'x-campaign-id': 'listing_pups',
        'x-platform': weighted({ web: 30, ios: 40, android: 30 }),
        'x-scenario': 'listing_spike',
      };
      try {
        const login = await fetch(`${target}/api/auth/login`, { method: 'POST', headers, body: '{}' });
        const user = (await login.json()) as { userId: string; tier: string };
        headers['x-user-id'] = user.userId;
        for (let i = 0, n = randInt(2, 6); i < n && !shouldStop(); i++) {
          const symbol = weighted({ PUPS: 90, BITS: 5, DOGE2: 3, WOOF: 2 });
          const amountKrw = lognormalKrw(50_000, 3_000_000, 300_000) * (user.tier === 'vip' ? 3 : 1);
          const res = await fetch(`${target}/api/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ symbol, amountKrw, side: 'buy' }),
            signal: AbortSignal.timeout(15_000),
          }).catch(() => null);
          if (res?.ok) ok++;
          else failed++;
          await res?.text().catch(() => undefined);
          await sleep(randInt(200, 1200));
        }
      } catch {
        failed++;
        await sleep(1000);
      }
    }
  };

  const loops = Array.from({ length: users }, (_, i) => loop(i));
  const timer = setInterval(() => log(`http load: users=${users} ok=${ok} failed=${failed}`), 30_000);
  log(`http load started with ${users} users`);
  return async () => {
    await Promise.all(loops);
    clearInterval(timer);
  };
}
