export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
export const chance = (p: number) => Math.random() < p;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const think = () => sleep(randInt(300, 1500));

export function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Log-normal amount clamped to [min, max], rounded to 10,000 KRW. */
export function lognormalKrw(min: number, max: number, median: number, sigma = 0.8) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const v = Math.exp(Math.log(median) + sigma * z);
  return Math.round(Math.min(max, Math.max(min, v)) / 10_000) * 10_000;
}
