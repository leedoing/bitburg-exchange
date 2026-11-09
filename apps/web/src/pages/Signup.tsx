import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { action, operation, setUser } from '../rum';

const OP_KEY = () => `signup_${sessionStorage.getItem('bitsburg.tab') ?? 'tab'}`;

export default function Signup() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    operation.start('signup', OP_KEY());
    return () => {
      if (!done.current) operation.fail('signup', OP_KEY(), 'abandoned', { reason: 'abandoned' });
    };
  }, []);

  const firstInput = () => {
    if (started.current) return;
    started.current = true;
    action('signup_started', { step: 'signup' });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await api<{ userId: string; name: string; tier: string }>('POST', '/api/auth/signup', 'signup', {});
      setUser({ id: user.userId, name: user.name, tier: user.tier });
      action('signup_completed', { step: 'signup' });
      done.current = true;
      operation.succeed('signup', OP_KEY());
      navigate('/kyc');
    } catch {
      setError('가입 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
      done.current = true;
      operation.fail('signup', OP_KEY(), 'error', { reason: 'api_error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="card">
        <div className="stepper">
          <span className="on">1 가입</span>
          <span>2 본인 인증</span>
          <span>3 입금</span>
          <span>4 첫 거래</span>
        </div>
        <h2>회원가입</h2>
        <label>
          닉네임
          <input
            data-testid="signup-nickname"
            value={nickname}
            onFocus={firstInput}
            onChange={(e) => {
              firstInput();
              setNickname(e.target.value);
            }}
            placeholder="비츠버그에서 쓸 이름"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="signup-agree"
            checked={agree}
            onChange={(e) => {
              firstInput();
              setAgree(e.target.checked);
            }}
          />
          이용약관과 개인정보 처리방침에 동의합니다 (데모)
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" data-testid="signup-submit" disabled={busy || !agree} onClick={submit}>
          {busy ? '처리 중…' : '가입 완료'}
        </button>
      </div>
    </div>
  );
}
