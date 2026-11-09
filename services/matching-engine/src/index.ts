import { createApp, randInt, sleep, start, tagSpan } from '../../common/app';
import { createPool } from '../../common/db';
import { fault, startStatePolling } from '../../common/faults';

const BASE_PRICES: Record<string, number> = { BITS: 48_200, DOGE2: 312, WOOF: 1_870, PUPS: 95 };

const pool = createPool({ max: 2 });
startStatePolling(pool);

const app = createApp();

app.post('/match', async (req, res) => {
  const symbol = String(req.body?.symbol ?? 'BITS');
  const amountKrw = Number(req.body?.amountKrw ?? 0);
  const base = BASE_PRICES[symbol] ?? 1000;
  await sleep(fault('listing_spike') ? randInt(20, 90) : randInt(10, 50));
  const price = Math.round(base * (1 + (Math.random() - 0.5) * 0.01) * 100) / 100;
  const qty = Math.round((amountKrw / price) * 10_000) / 10_000;
  tagSpan({ 'order.symbol': symbol, 'order.amount_krw': amountKrw, 'order.price': price });
  res.json({ filled: true, symbol, price, qty });
});

start(app);
