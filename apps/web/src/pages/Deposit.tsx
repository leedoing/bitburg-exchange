import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatKrw } from '../market';
import { action, operation } from '../rum';

const POLL_MS = 2000;
const STUCK_MS = 60_000;
const GIVE_UP_MS = 180_000;

type Phase = 'idle' | 'pending' | 'stuck' | 'completed' | 'error';

export default function Deposit() {
  const [amount, setAmount] = useState(1_000_000);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const live = useRef<{ id: string; started: number; amount: number; failed: boolean } | null>(null);

  useEffect(
    () => () => {
      const d = live.current;
      if (d && !d.failed) {
        operation.fail('krw_deposit', d.id, 'abandoned', { reason: 'abandoned', deposit: { amount_krw: d.amount } });
      }
      live.current = null;
    },
    [],
  );

  const poll = async (id: string) => {
    const d = live.current;
    if (!d || d.id !== id) return;
    const waitMs = Date.now() - d.started;
    setElapsed(waitMs);
    try {
      const res = await api<{ status: string }>('GET', `/api/wallet/deposit/${id}`, 'deposit');
      if (live.current?.id !== id) return;
      if (res.status === 'completed') {
        action('deposit_completed', { step: 'deposit', deposit: { amount_krw: d.amount, wait_ms: waitMs } });
        if (!d.failed) operation.succeed('krw_deposit', id, { deposit: { amount_krw: d.amount, wait_ms: waitMs } });
        live.current = null;
        setPhase('completed');
        return;
      }
    } catch {
      // keep polling; the error is already reported to RUM
    }
    if (waitMs > STUCK_MS && !d.failed) {
      d.failed = true;
      action('deposit_stuck', { step: 'deposit', deposit: { amount_krw: d.amount, wait_ms: waitMs } });
      operation.fail('krw_deposit', id, 'other', { reason: 'stuck', deposit: { amount_krw: d.amount, wait_ms: waitMs } });
      setPhase('stuck');
    }
    if (waitMs > GIVE_UP_MS) {
      live.current = null;
      return;
    }
    setTimeout(() => void poll(id), POLL_MS);
  };

  const submit = async () => {
    const amountKrw = Math.round(amount);
    action('deposit_requested', { step: 'deposit', deposit: { amount_krw: amountKrw } });
    setPhase('pending');
    setElapsed(0);
    try {
      const res = await api<{ depositId: string }>('POST', '/api/wallet/deposit', 'deposit', { amountKrw });
      live.current = { id: res.depositId, started: Date.now(), amount: amountKrw, failed: false };
      operation.start('krw_deposit', res.depositId, { deposit: { amount_krw: amountKrw } });
      setTimeout(() => void poll(res.depositId), POLL_MS);
    } catch {
      const key = `failed_${Date.now()}`;
      operation.start('krw_deposit', key);
      operation.fail('krw_deposit', key, 'error', { reason: 'api_error' });
      setPhase('error');
    }
  };

  return (
    <div className="page narrow">
      <div className="card">
        <div className="stepper">
          <span className="done">1 가입</span>
          <span className="done">2 본인 인증</span>
          <span className="on">3 입금</span>
          <span>4 첫 거래</span>
        </div>
        <h2>원화 입금</h2>
        <p className="muted">연결된 실명 확인 계좌에서 원화를 입금합니다 (가상).</p>
        <label>
          입금 금액 (원)
          <input
            data-testid="deposit-amount"
            type="number"
            min={10_000}
            step={10_000}
            value={amount}
            disabled={phase === 'pending' || phase === 'stuck'}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <div className="quick">
          {[100_000, 500_000, 1_000_000, 3_000_000].map((v) => (
            <button key={v} className="chip" onClick={() => setAmount(v)} disabled={phase === 'pending' || phase === 'stuck'}>
              {formatKrw(v)}
            </button>
          ))}
        </div>

        {(phase === 'idle' || phase === 'error') && (
          <>
            {phase === 'error' && <p className="error">입금 요청에 실패했어요. 다시 시도해 주세요.</p>}
            <button className="btn primary block" data-testid="deposit-submit" onClick={submit}>
              원화 입금 요청
            </button>
          </>
        )}

        {(phase === 'pending' || phase === 'stuck') && (
          <div className="waiting">
            <div className="spinner" />
            <p>
              은행 확인을 기다리는 중… {(elapsed / 1000).toFixed(0)}초 <span className="pill">pending</span>
            </p>
            {phase === 'stuck' && (
              <p className="warn" data-testid="deposit-stuck">
                입금 확인이 지연되고 있어요. 확인되는 대로 반영됩니다.
              </p>
            )}
          </div>
        )}

        {phase === 'completed' && (
          <div className="success">
            <p>✅ {formatKrw(amount)} 입금이 반영됐어요.</p>
            <Link className="btn primary block" to="/trade" data-testid="go-trade">
              첫 거래 하러 가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
