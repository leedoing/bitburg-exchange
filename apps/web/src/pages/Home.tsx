import { Link } from 'react-router-dom';
import { COINS, formatKrw, Sparkline, useTicker } from '../market';

function CoinCard({ symbol, name, base }: { symbol: string; name: string; base: number }) {
  const series = useTicker(base, 32);
  const last = series[series.length - 1];
  const change = ((last - series[0]) / series[0]) * 100;
  return (
    <div className="coin-card">
      <div className="coin-head">
        <strong>{symbol}</strong>
        <span className="muted">{name}</span>
      </div>
      <div className="coin-price">{formatKrw(last)}</div>
      <div className={change >= 0 ? 'up' : 'down'}>
        {change >= 0 ? '+' : ''}
        {change.toFixed(2)}%
      </div>
      <Sparkline series={series} height={48} />
    </div>
  );
}

export default function Home() {
  return (
    <div className="page home">
      <section className="hero">
        <h1>
          비츠버그에서
          <br />첫 거래를 시작하세요
        </h1>
        <p className="muted">가입 → 본인 인증(KYC) → 원화 입금 → 매수까지 몇 분이면 끝납니다.</p>
        <div className="hero-actions">
          <Link className="btn primary" to="/signup" data-testid="start-signup">
            회원가입 시작
          </Link>
          <Link className="btn ghost" to="/login" data-testid="go-login">
            로그인
          </Link>
        </div>
      </section>
      <section className="coin-grid">
        {COINS.map((c) => (
          <CoinCard key={c.symbol} {...c} />
        ))}
      </section>
    </div>
  );
}
