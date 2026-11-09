import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { config } from './config';
import CsButton from './CsButton';
import Deposit from './pages/Deposit';
import Home from './pages/Home';
import Kyc from './pages/Kyc';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Trade from './pages/Trade';
import { loadUser, startView, syncScenario } from './rum';

const VIEW_NAMES: Record<string, string> = {
  '/': 'home',
  '/signup': 'signup',
  '/kyc': 'kyc',
  '/deposit': 'deposit',
  '/trade': 'trade',
  '/login': 'login',
};

function ViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    startView(VIEW_NAMES[pathname] ?? 'home');
    void syncScenario();
  }, [pathname]);
  return null;
}

export default function App() {
  const user = loadUser();
  useEffect(() => {
    const id = setInterval(() => void syncScenario(), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <ViewTracker />
      <div className="demo-banner">Datadog 데모용 가상 서비스입니다 · 실제 거래가 일어나지 않습니다</div>
      <header className="topbar">
        <Link to="/" className="brand" data-testid="brand">
          <span className="logo">◆</span> Bitsburg Exchange <span className="muted">비츠버그 거래소</span>
        </Link>
        <nav>
          <NavLink to="/trade">거래소</NavLink>
          <NavLink to="/deposit">입출금</NavLink>
          {user ? <span className="muted">{user.name}</span> : <NavLink to="/login">로그인</NavLink>}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/kyc" element={<Kyc />} />
          <Route path="/deposit" element={<Deposit />} />
          <Route path="/trade" element={<Trade />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="footer muted">
        v{config.appVersion} · {config.platform}
      </footer>
      <CsButton />
    </>
  );
}
