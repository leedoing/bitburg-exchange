import { useState } from 'react';
import { api } from './api';
import { action } from './rum';

const TOPICS = [
  { id: 'deposit', label: '입금이 반영이 안 돼요' },
  { id: 'kyc', label: '본인 인증이 안 돼요' },
  { id: 'order', label: '주문이 체결이 안 돼요' },
] as const;

export default function CsButton() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const contact = async (topic: string) => {
    action('cs_contact_opened', { cs: { topic } });
    setSent(topic);
    try {
      await api('POST', '/api/cs/contact', 'cs', { topic });
    } catch {
      // already reported to RUM
    }
  };

  return (
    <div className="cs">
      {open && (
        <div className="cs-panel" role="dialog" aria-label="고객센터 문의">
          <strong>고객센터 문의</strong>
          {sent ? (
            <p className="muted">문의가 접수됐어요. 상담원이 곧 연락드립니다.</p>
          ) : (
            TOPICS.map((t) => (
              <button key={t.id} className="cs-topic" data-testid={`cs-topic-${t.id}`} onClick={() => contact(t.id)}>
                {t.label}
              </button>
            ))
          )}
        </div>
      )}
      <button
        className="cs-fab"
        data-testid="cs-open"
        onClick={() => {
          setOpen((o) => !o);
          setSent(null);
        }}
      >
        💬 고객센터 문의
      </button>
    </div>
  );
}
