import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { setUser } from '../rum';

export default function Login() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await api<{ userId: string; name: string; tier: string }>('POST', '/api/auth/login', 'login', userId ? { userId } : {});
      setUser({ id: user.userId, name: user.name, tier: user.tier });
      navigate('/trade');
    } catch {
      setError('로그인에 실패했어요. 회원 번호를 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="card">
        <h2>로그인</h2>
        <p className="muted">데모에서는 비밀번호 없이 회원 번호만으로 로그인합니다. 비워 두면 임의의 기존 회원으로 들어갑니다.</p>
        <label>
          회원 번호
          <input data-testid="login-user" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="u_000123" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" data-testid="login-submit" disabled={busy} onClick={submit}>
          {busy ? '확인 중…' : '로그인'}
        </button>
      </div>
    </div>
  );
}
