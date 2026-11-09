import { useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { COINS, CoinSymbol, formatKrw, OrderBook, Sparkline, useTicker } from '../market';
import { action, loadUser, operation } from '../rum';

/** Must match MAX_ORDER_KRW in services/order. */
const MAX_ORDER_KRW = 100_000_000;
const MIN_ORDER_KRW = 5_000;

interface Fill {
  symbol: string;
  amountKrw: number;
  price: number;
  at: string;
}

export default function Trade() {
  const [symbol, setSymbol] = useState<CoinSymbol>(() => (new URLSearchParams(location.search).get('symbol') as CoinSymbol) || 'BITS');
  const coin = COINS.find((c) => c.symbol === symbol) ?? COINS[0];
  const series = useTicker(coin.base);
  const price = series[series.length - 1];
  const [amount, setAmount] = useState(300_000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);
  const seq = useRef(0);

  const amountKrw = Math.round(amount);
  const validAmount = Number.isFinite(amountKrw) && amountKrw >= MIN_ORDER_KRW && amountKrw <= MAX_ORDER_KRW;

  const buy = async () => {
    if (!validAmount) return;
    const order = { symbol, amount_krw: amountKrw, side: 'buy' };
    const key = `order_${loadUser()?.id ?? 'anon'}_${++seq.current}_${Date.now()}`;
    const started = Date.now();
    setBusy(true);
    setMessage(null);
    action('order_placed', { step: 'trade', order });
    operation.start('place_order', key, { order });
    try {
      const res = await api<{ status: string; price: number }>('POST', '/api/orders', 'trade', { symbol, amountKrw, side: 'buy' });
      const latency = Date.now() - started;
      action('order_filled', { step: 'trade', order: { ...order, latency_ms: latency } });
      operation.succeed('place_order', key, { order: { ...order, latency_ms: latency } });
      setFills((f) => [{ symbol, amountKrw, price: res.price, at: new Date().toLocaleTimeString('ko-KR') }, ...f].slice(0, 6));
      setMessage({ kind: 'ok', text: `${symbol} ${formatKrw(amountKrw)} 매수 체결` });
    } catch (err) {
      const latency = Date.now() - started;
      const reason = err instanceof ApiError ? (err.body?.reason ?? `http_${err.status}`) : 'network_error';
      action('order_failed', { step: 'trade', order: { ...order, latency_ms: latency, reason } });
      operation.fail('place_order', key, 'error', { reason, order: { ...order, latency_ms: latency } });
      setMessage({ kind: 'error', text: '주문이 처리되지 않았어요. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page trade">
      <div className="symbols">
        {COINS.map((c) => (
          <button
            key={c.symbol}
            data-testid={`symbol-${c.symbol}`}
            className={`symbol ${c.symbol === symbol ? 'on' : ''}`}
            onClick={() => setSymbol(c.symbol)}
          >
            <strong>{c.symbol}</strong>
            <span className="muted">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="trade-main">
        <div className="card chart-card">
          <div className="chart-head">
            <h2>
              {symbol}/KRW <span className="muted">{coin.name}</span>
            </h2>
            <div className="big-price">{formatKrw(price)}</div>
          </div>
          <Sparkline series={series} height={220} />
        </div>
        <div className="card">
          <OrderBook price={price} />
        </div>
        <div className="card order-card">
          <h3>매수</h3>
          <label>
            주문 금액 (원)
            <input
              data-testid="order-amount"
              type="number"
              min={MIN_ORDER_KRW}
              max={MAX_ORDER_KRW}
              step={10_000}
              value={amount}
              onChange={(e) => setAmount(Math.min(MAX_ORDER_KRW, Number(e.target.value)))}
            />
            <span className={validAmount ? 'muted' : 'error'}>
              {formatKrw(MIN_ORDER_KRW)} ~ {formatKrw(MAX_ORDER_KRW)} 사이로 입력해 주세요
            </span>
          </label>
          <div className="quick">
            {[50_000, 300_000, 1_000_000, 3_000_000].map((v) => (
              <button key={v} className="chip" onClick={() => setAmount(v)}>
                {formatKrw(v)}
              </button>
            ))}
          </div>
          <button className="btn buy block" data-testid="order-submit" disabled={busy || !validAmount} onClick={buy}>
            {busy ? '주문 중…' : '매수 주문'}
          </button>
          {message && (
            <p className={message.kind === 'ok' ? 'ok' : 'error'} data-testid="order-message">
              {message.text}
            </p>
          )}
          {fills.length > 0 && (
            <div className="fills">
              <h4>최근 체결</h4>
              {fills.map((f, i) => (
                <div className="fill" key={i}>
                  <span>{f.at}</span>
                  <span>{f.symbol}</span>
                  <span>{formatKrw(f.amountKrw)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
