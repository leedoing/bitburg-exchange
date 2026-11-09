import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { config } from '../config';
import { action, loadUser, operation } from '../rum';

type Phase = 'idle' | 'waiting' | 'approved' | 'rejected' | 'timeout' | 'cancelled';

export default function Kyc() {
  const flow = config.kycFlowV2 ? 'v2' : 'v1';
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const attempt = useRef(0);
  const live = useRef<{ key: string; started: number } | null>(null);
  const opKey = () => `kyc_${loadUser()?.id ?? 'anon'}_${attempt.current}`;

  useEffect(() => {
    if (phase !== 'waiting') return;
    const id = setInterval(() => setElapsed(Date.now() - (live.current?.started ?? Date.now())), 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(
    () => () => {
      if (live.current) {
        action('kyc_failed', { step: 'kyc', kyc: { flow, reason: 'abandoned' } });
        operation.fail('kyc_verification', live.current.key, 'abandoned', { reason: 'abandoned' });
        live.current = null;
      }
    },
    [flow],
  );

  const submit = async () => {
    attempt.current += 1;
    const key = opKey();
    const started = Date.now();
    live.current = { key, started };
    setElapsed(0);
    setPhase('waiting');
    action('kyc_submitted', { step: 'kyc', kyc: { flow } });
    operation.start('kyc_verification', key, { kyc: { flow } });
    try {
      const res = await api<{ status: 'approved' | 'rejected'; waitMs: number }>('POST', '/api/kyc/verify', 'kyc', { flow });
      if (live.current?.key !== key) return;
      live.current = null;
      const waitMs = Date.now() - started;
      if (res.status === 'approved') {
        action('kyc_approved', { step: 'kyc', kyc: { flow, wait_ms: waitMs } });
        operation.succeed('kyc_verification', key, { kyc: { flow, wait_ms: waitMs } });
        setPhase('approved');
      } else {
        action('kyc_failed', { step: 'kyc', kyc: { flow, reason: 'rejected', wait_ms: waitMs } });
        operation.fail('kyc_verification', key, 'other', { reason: 'rejected' });
        setPhase('rejected');
      }
    } catch (err) {
      if (live.current?.key !== key) return;
      live.current = null;
      const waitMs = Date.now() - started;
      const reason = err instanceof ApiError && err.status === 504 ? 'timeout' : 'error';
      action('kyc_failed', { step: 'kyc', kyc: { flow, reason, wait_ms: waitMs } });
      operation.fail('kyc_verification', key, 'error', { reason });
      setPhase('timeout');
    }
  };

  const cancel = () => {
    if (!live.current) return;
    action('kyc_failed', { step: 'kyc', kyc: { flow, reason: 'abandoned', wait_ms: Date.now() - live.current.started } });
    operation.fail('kyc_verification', live.current.key, 'abandoned', { reason: 'abandoned' });
    live.current = null;
    setPhase('cancelled');
  };

  return (
    <div className="page narrow">
      <div className="card">
        <div className="stepper">
          <span className="done">1 가입</span>
          <span className="on">2 본인 인증</span>
          <span>3 입금</span>
          <span>4 첫 거래</span>
        </div>
        <h2>본인 인증 (KYC)</h2>
        <p className="muted">
          신분증을 촬영해 제출하면 인증 기관이 확인합니다. <span className="pill">{flow === 'v2' ? '새 인증 흐름' : '기본 인증 흐름'}</span>
        </p>
        <div className="id-card" aria-hidden>
          <div className="id-photo" />
          <div>
            <div className="id-line" />
            <div className="id-line short" />
            <div className="id-line" />
          </div>
        </div>

        {phase === 'idle' || phase === 'cancelled' || phase === 'rejected' || phase === 'timeout' ? (
          <>
            {phase === 'rejected' && <p className="error">인증이 거절됐어요. 신분증을 다시 확인해 주세요.</p>}
            {phase === 'timeout' && <p className="error">인증 기관 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.</p>}
            {phase === 'cancelled' && <p className="muted">인증을 취소했어요.</p>}
            <button className="btn primary block" data-testid="kyc-submit" onClick={submit}>
              신분증 제출
            </button>
          </>
        ) : null}

        {phase === 'waiting' && (
          <div className="waiting">
            <div className="spinner" />
            <p>인증 기관에서 확인 중입니다… {(elapsed / 1000).toFixed(0)}초</p>
            <button className="btn ghost" data-testid="kyc-cancel" onClick={cancel}>
              취소
            </button>
          </div>
        )}

        {phase === 'approved' && (
          <div className="success">
            <p>✅ 본인 인증이 완료됐어요.</p>
            <Link className="btn primary block" to="/deposit" data-testid="go-deposit">
              입금하러 가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
