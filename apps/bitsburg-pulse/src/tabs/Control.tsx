import { Button } from '@datadog/druids/form/Button';
import { Modal } from '@datadog/druids/dialogs/Modal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { getAdminState, setFault } from '../admin.backend';
import { FAULT_LABEL, FAULTS, type FaultName } from '../shared/types';
import { elapsed } from '../ui/format';
import { Card, ErrorBox, LevelTag, Loading } from '../ui/parts';

const FAULT_DESC: Record<FaultName, string> = {
    kyc_vendor_slow: 'kyc-vendor v2(앱 3.5.0)만 8~15초 지연, intensity 비율만큼 20초 타임아웃',
    deposit_delay: '은행 게이트웨이가 30~90초 동안 pending 응답 (에러 없이 입금만 늦어짐)',
    listing_spike: 'PUPS 상장 캠페인 + 주문 DB 풀 축소 (주문 지연·실패). HTTP 부하는 traffic-gen listing_spike 모드로 함께 실행',
};

type Pending = { name: FaultName; enabled: boolean } | null;

export function Control() {
    const client = useQueryClient();
    const q = useQuery({ queryKey: ['admin'], queryFn: () => getAdminState(), refetchInterval: 5_000 });
    const [pending, setPending] = useState<Pending>(null);
    const [intensity, setIntensity] = useState(0.7);
    const [duration, setDuration] = useState(15);
    const mut = useMutation({
        mutationFn: (p: { name: FaultName; enabled: boolean }) => setFault(p.name, p.enabled, intensity, duration),
        onSuccess: (data) => {
            client.setQueryData(['admin'], data);
            client.invalidateQueries({ queryKey: ['situation'] });
        },
    });

    if (q.isLoading) return <Loading what="장애 스위치 상태" />;
    if (q.isError || !q.data) return <ErrorBox error={q.error} />;
    const st = q.data;

    return (
        <div className="stack">
            {!st.ok && (
                <div className="error-box">
                    admin API에 연결하지 못했습니다. Datadog Connection <code>bitsburg-admin-api</code> 권한과 EC2 상태를 확인하세요. ({st.error})
                </div>
            )}
            {mut.data && !mut.data.ok && <div className="error-box">요청 실패: {mut.data.error}</div>}
            <Card title="장애 스위치 (발표자용)" extra={<span className="muted">5초마다 상태 갱신 · 자동 해제</span>}>
                <div className="controls-opts">
                    <label>
                        강도(intensity) {intensity.toFixed(1)}
                        <input type="range" min={0.1} max={1} step={0.1} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
                    </label>
                    <label>
                        자동 해제 {duration}분
                        <input type="range" min={5} max={60} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                    </label>
                </div>
                <div className="switches">
                    {FAULTS.map((name) => {
                        const f = st.faults.find((x) => x.name === name);
                        const on = Boolean(f?.enabled);
                        return (
                            <div key={name} className={`switch ${on ? 'switch-on' : ''}`}>
                                <div className="switch-head">
                                    <strong>{FAULT_LABEL[name]}</strong>
                                    <LevelTag level={on ? 'bad' : 'ok'} />
                                </div>
                                <code>{name}</code>
                                <p className="muted small">{FAULT_DESC[name]}</p>
                                <div className="switch-state">
                                    {on ? (
                                        <>
                                            켜짐 · intensity {f?.intensity} · 자동 해제까지 <b>{elapsed(0, (f?.remainingSec ?? 0) * 1000)}</b>
                                        </>
                                    ) : (
                                        '꺼짐'
                                    )}
                                </div>
                                <Button
                                    label={on ? '끄기' : '켜기'}
                                    level={on ? 'success' : 'danger'}
                                    isPrimary
                                    isLoading={mut.isPending && mut.variables?.name === name}
                                    isDisabled={!st.ok}
                                    onClick={() => setPending({ name, enabled: !on })}
                                />
                            </div>
                        );
                    })}
                </div>
                {st.campaign && (
                    <div className="muted small">
                        캠페인: {st.campaign.enabled ? `${st.campaign.id} 진행 중 (남은 ${Math.round(st.campaign.remainingSec / 60)}분)` : '없음'}
                    </div>
                )}
            </Card>
            <Modal
                isOpen={pending !== null}
                onClose={() => setPending(null)}
                title={pending ? `${FAULT_LABEL[pending.name]} ${pending.enabled ? '켜기' : '끄기'}` : ''}
                size="sm"
                footer={
                    <div className="modal-actions">
                        <Button label="취소" onClick={() => setPending(null)} />
                        <Button
                            label={pending?.enabled ? '장애 켜기' : '장애 끄기'}
                            level={pending?.enabled ? 'danger' : 'success'}
                            isPrimary
                            onClick={() => {
                                if (pending) mut.mutate(pending);
                                setPending(null);
                            }}
                        />
                    </div>
                }
            >
                {pending?.enabled ? (
                    <p>
                        실제 데모 환경에 장애를 주입합니다. intensity {intensity.toFixed(1)}, {duration}분 뒤 자동 해제됩니다. 시작 Event가 Datadog에 기록됩니다. 계속할까요?
                    </p>
                ) : (
                    <p>장애를 끄고 종료 Event를 기록합니다. 계속할까요?</p>
                )}
            </Modal>
        </div>
    );
}
