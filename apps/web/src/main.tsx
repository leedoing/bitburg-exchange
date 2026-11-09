import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initRum } from './rum';
import './styles.css';

if (!sessionStorage.getItem('bitsburg.tab')) sessionStorage.setItem('bitsburg.tab', Math.random().toString(36).slice(2, 10));

initRum();

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
