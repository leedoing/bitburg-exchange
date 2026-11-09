# Bitsburg Pulse (Datadog App)

"신규 회원이 가입부터 첫 거래까지 막힘없이 가고 있는가"를 부서별로 보여 주는 Datadog App 입니다. `docs/CURSOR_PROMPTS.md` 9단계 산출물입니다.

## 탭

| 탭 (hash) | 보는 사람 | 내용 |
| --- | --- | --- |
| 상황판 `#/situation` (기본) | 전원 | 가입·KYC·입금·주문 4단계 신호등(최근 5분, 색 + 정상/주의/장애 글자), 장애 배너(경과 시간), 큰 숫자 타일, 단계별 건수, 장애·캠페인 Event |
| 운영·CS `#/ops` | 운영, CS | 지금 장애인가, 입금 대기 최장 시간(45초 기준선), CS 문의 추이, 모니터 상태, Bits 질문 복사 카드 |
| PM·DA `#/pm` | PM, 데이터 분석 | 버전별 같은 세션 퍼널, 추정 손실(평균 첫 입금액 슬라이더, 계산식 표기), 버전별 KYC 성공률, 이탈 세션 리플레이 링크 |
| BI·그로스 `#/bi` | PM, 마케팅, 그로스 | 순서형 퍼널(Action/View 기준, 버전·플랫폼·유입 경로·캠페인 비교), 단계별 소요 시간(중앙값·p90, 첫 방문→가입 등), 그로스 성과표(전환율·평균 첫 입금액·신규 거래대금), 이탈 사유, 회원 등급별 주문, 경로 분석(화면 기준 이후/이전 3단계 Sankey) |
| 캠페인 `#/campaign` | 마케팅, 인프라 | 캠페인 vs 평시 유입·가입·주문·거래대금·주문 p95·실패율을 한 타임라인에. 서버 리소스: EC2 호스트 CPU·메모리, 주문 경로 컨테이너(api-gateway·order·matching·postgres)별 CPU·메모리, 주문 DB 풀 고갈 경고 로그와 "리소스가 적정한가" 판정(70% 주의, 85% 위험) |
| 경영 요약 `#/exec` | 경영진 | 한 줄 요약, 24시간 핵심 숫자, 장애별 영향 사용자·실패 건수·추정 손실 카드 |
| 시나리오 컨트롤 `#/control` | 발표자 | 장애 3종 켜기/끄기(확인 모달), intensity, 자동 해제까지 남은 시간 |

기간은 `?range=1h|6h|24h|fault` 로 공유할 수 있습니다 (예: `#/pm?range=fault`). `fault` 는 마지막 장애 Event 15분 전부터 종료 10분 뒤까지입니다. 어느 그래프든 가로로 드래그하면 모든 탭이 그 구간(`range=c<시작ms>-<끝ms>`, 최소 2분)으로 좁혀지고, 상단 "✕ 해제"나 브라우저 뒤로 가기로 돌아갑니다. 짧게 누르면 지금처럼 RUM Explorer가 열립니다. 모든 탭은 30초마다 새로고침합니다 (컨트롤은 5초). 차트의 붉은 띠는 `source:bitsburg-admin` Event 로 찾은 장애 구간입니다.

## 데이터 출처

모든 외부 호출은 백엔드 함수(`src/*.backend.ts`)에서 Action Catalog 로만 합니다.

| 액션 | 쓰는 곳 |
| --- | --- |
| `@datadog/action-catalog/dd/metrics` `queryScalarData`, `queryTimeseriesData` | 백엔드 커스텀 메트릭(`bitsburg.*`), `trace.express.request`, RUM 세션·액션·operation 집계, 거래대금·입금액 로그 합계 |
| `@datadog/action-catalog/dd/events` `listEvents` | 장애·캠페인 시작/종료 Event (`source:bitsburg-admin`) |
| `@datadog/action-catalog/dd/monitor` `listMonitorsV2` | `team:bitsburg` 모니터 상태 |
| `@datadog/action-catalog/dd/rum` `listRUMEvents` | 이탈 세션 (KYC 실패·입금 지연·CS 문의) 리플레이 링크 |
| `@datadog/action-catalog/dd/ddsql` `tableQuery` | BI 탭: `dd.rum` View·Action 이벤트로 세션별 순서형 퍼널, 단계 간 소요 시간, 경로(LEAD 윈도 함수) (`src/server/bi.ts`, SQL은 고정 템플릿 + 화이트리스트 값만) |
| `@datadog/action-catalog/http/http` `request` | admin API (`/admin/state`, `/admin/faults`, `/admin/campaign`) |

admin API 는 Datadog HTTP Connection `bitsburg-admin-api` (`src/server/config.ts` 의 ID)를 거칩니다. `X-Admin-Token` 헤더 값은 Connection 에 저장돼 있고 앱 코드와 브라우저에는 나오지 않습니다.

## 추정 손실 계산

```
추정 손실 = (이탈 사용자 − 평시 기준 이탈 예상) × 평균 첫 입금액
이탈 사용자 = 같은 세션에서 가입 완료 − 첫 입금
평시 기준 이탈 예상 = 가입 완료 × (1 − 평시 가입→첫 입금 전환율)
평시 전환율 = 직전 24시간 같은 세션 전환율 (가입 20건 미만이면 스펙 80% × 65%)
```

거래대금·입금액 합계(상황판, 경영 요약, 캠페인 탭)는 백엔드 로그 `Order filled`(`@order.amount_krw`), `Deposit completed`(`@deposit.amount_krw`)의 합이고, 1억 원 초과 값은 뺍니다(`krwSum`, `src/server/dd.ts`). 분포 메트릭은 값 범위로 거를 수 없고, RUM에는 traffic-gen의 API 직접 주문이 없어서 로그를 씁니다. 캠페인별 분리는 로그 속성 `campaign.id`로 합니다.

`listing_spike` 는 실패 주문 수 × 평균 주문액으로 계산합니다. 평균 첫 입금액과 평균 주문액은 최근 24시간 RUM `deposit_completed`, `order_filled` 액션 금액의 평균(1억 원 초과 제외)입니다. 백엔드 분포 메트릭 평균은 오타 한 건에도 크게 흔들려서 쓰지 않습니다. 평균 첫 입금액은 PM 탭 슬라이더로 바꿀 수 있습니다.

## 실행

```bash
npm install
set -a; . ../../.env; set +a   # DD_API_KEY, DD_APP_KEY (출력하지 않음)
npm run dev                    # http://localhost:5173/
npm run typecheck && npm run lint
node scripts/screenshots.cjs   # docs/screenshots/pulse-<tab>-1h.png (dev 서버 필요)
DURATION_MIN=5 node scripts/toggle-fault.cjs on   # 컨트롤 탭으로 kyc_vendor_slow 켜기
npm run upload                 # 빌드 + 업로드 + 즉시 게시
```

`datadog-app.config.json` 의 `id` 는 바꾸지 마세요. 바꾸면 업로드 때 새 앱이 생깁니다.

## 대시보드에 넣기

`surface:datadog.dashboard` 태그가 붙어 있습니다. 대시보드 편집에서 위젯 추가 > Apps > Bitsburg Pulse 를 고르면 됩니다. 앱은 대시보드 시간 범위를 읽지 않고 자체 기간 토글을 씁니다.
