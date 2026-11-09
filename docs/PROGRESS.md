# Bitsburg Exchange 데모 진행 기록

"이어서 해"라고 하면 이 파일의 마지막 단계 상태를 보고 멈춘 지점부터 다시 시작합니다.

## 공통 정보

| 항목 | 값 |
| --- | --- |
| 저장소 | https://github.com/leedoing/bitburg-exchange (main, **private**) |
| AWS | 계정 557652101750, 사용자 `admin`, 리전 ap-northeast-2 |
| Datadog org | DogFood Hyunjin.Lee (`hyunjin.datadoghq.com`) |
| DD_SITE | `datadoghq.com` |
| Datadog MCP | `datadog-hyunjin` (전역 mcp.json), 프로젝트 `.cursor/mcp.json`은 `DD_API_KEY`/`DD_APPLICATION_KEY` 환경 변수 필요 |
| RUM 앱 | Bitsburg Exchange (browser), application id `b6478d57-baa4-4ff1-b07c-f9fd12d514d8` |
| API 헬퍼 | `scripts/ddapi.sh METHOD PATH [BODY]` (.env 키 사용, 키 출력 안 함) |

## 사람이 할 일

- [ ] (비용) AWS 계정의 이번 달 지출이 이미 약 29.5달러(11/9 기준)입니다. Budget `bitsburg-demo-monthly-50usd`는 계정 전체 기준이라 80%(40달러) 알림이 곧 올 수 있습니다.
- [ ] (비용) EC2 리소스가 생긴 뒤 하루 지나면 Billing > Cost allocation tags에서 `Purpose` 태그를 활성화하면 데모 비용만 따로 볼 수 있습니다.
- [ ] (3단계) RUM > Sessions에서 Bitsburg Exchange 세션 하나를 열어 Session Replay가 실제로 재생되는지 눈으로 확인 (데이터상 `has_replay:true`는 확인됨).

## 단계 기록

### 0단계. 환경 점검과 키 정리

- 시작: 2026-11-09 16:14 KST
- 할 일: AWS 계정 확인, Datadog org·site 확인, `.env` 키 정리, App 키 Actions API Access 확인, RUM 앱 생성, RUM without Limits 확인, AWS Budget 생성
- 종료: 2026-11-09 16:19 KST, **완료**

| 항목 | 상태 | 비고 / 내가 할 일 |
| --- | --- | --- |
| AWS 자격 증명 | 준비됨 | `arn:aws:iam::557652101750:user/admin`, 리전 ap-northeast-2 |
| Datadog org / site | 준비됨 | DogFood Hyunjin.Lee / `datadoghq.com` |
| `.env` (DD_API_KEY, DD_APP_KEY, DD_SITE, ADMIN_TOKEN) | 준비됨 | 전역 mcp.json `datadog-hyunjin` 키 사용, `.gitignore`에 포함 확인 |
| App 키 Actions API Access | 준비됨 | 키 `mcp-app-key`가 `/api/v2/actions/app_key_registrations`에 등록돼 있음 (200) |
| RUM 앱 Bitsburg Exchange | 준비됨 | 새로 생성, DD_RUM_APP_ID·DD_RUM_CLIENT_TOKEN `.env` 저장 |
| RUM without Limits | 준비됨 | 앱에 retention filter API 응답이 오고 기본 `Sessions` 필터 100% |
| AWS Budget | 준비됨 | `bitsburg-demo-monthly-50usd`, 월 50달러, 실제 80% / 예상 100% 알림, 수신 hyunjin.lee@datadoghq.com, lluckyy77@gmail.com |

MCP 검증 (`execute_code`: `RUMApi.getRUMApplication`, `RumRetentionFiltersApi.listRetentionFilters`)

| 확인 항목 | 결과 |
| --- | --- |
| RUM 앱 이름 / 타입 | Bitsburg Exchange / browser |
| retention filter | `default_sessions` 100% enabled, `default_errors` 100% enabled |

메모
- RUM 앱 생성 응답이 터미널에 한 번 그대로 찍혀 client token이 노출됐습니다. client token은 브라우저에 공개되는 값이라 위험은 낮지만, 원하면 RUM 앱 설정에서 토큰을 새로 발급할 수 있습니다.
- 데모 AWS 구성(t3.medium + gp3 30GB + EIP) 예상 비용은 월 약 44달러로 50달러 한도 안입니다.
- 사용자가 `.cursor/mcp.json`에 키를 직접 넣어 두어 커밋 전 비밀값 검사에 걸렸습니다. 이 파일은 `.gitignore`에 추가해 저장소에서 제외했습니다.

### 1단계. 저장소 뼈대와 로컬 실행

- 시작: 2026-11-09 16:19 KST
- 할 일: `.cursor/rules/demo.mdc`, pnpm 모노레포(apps/web, services, tools/traffic-gen), docker-compose(서비스 9개 + web + postgres + datadog-agent), `.env.example`, Makefile, `/healthz`, 로컬 `docker compose up`, MCP로 Agent host 확인
- 종료: 2026-11-09 16:25 KST, **완료**

결과
- 백엔드 9개는 이미지 하나(`bitsburg-services:local`)를 공유하고 `SERVICE_DIR` 환경 변수로 실행할 서비스를 고릅니다. dd-trace는 `node --require dd-trace/init`으로 붙습니다.
- 웹은 nginx가 Vite 빌드를 서빙하고 `/api/` → api-gateway, `/admin/` → admin으로 프록시합니다.
- Docker Desktop은 회사 정책(로그인 강제) 때문에 쓸 수 없어 로컬은 **colima**(6 CPU, 8GB)로 실행했습니다.
- 컨테이너 12개 모두 healthy, `http://localhost` 200(빈 화면).

MCP 검증 (`execute_code`: `HostsApi.listHosts filter=bitsburg`)

| 확인 항목 | 결과 |
| --- | --- |
| Agent host | `bitsburg-local`, up, Agent 7.85.2 |
| host 태그 | `env:demo-coinone`, `team:bitsburg` |

### 2단계. 백엔드 서비스와 APM·로그·메트릭

- 시작: 2026-11-09 16:26 KST
- 할 일: DATA_SPEC 5.1 엔드포인트 구현, dd-trace span 태그, pino 로그(고정 문구), DogStatsD 비즈니스 메트릭, KYC 가짜 PII 로그, `scripts/smoke.sh`, MCP로 서비스·트레이스·로그 연결·메트릭 확인
- 종료: 2026-11-09 16:45 KST, **완료**

결과
- `scripts/smoke.sh` 가입→KYC→입금→주문→CS 문의 사이클이 3.4.2(v1)와 3.5.0(v2) 모두 성공.
- 장애 상태는 postgres `demo_state` 테이블에 두고, 각 서비스가 5초마다 읽습니다(`services/common/faults.ts`). 쓰는 쪽(admin)은 4단계에서 구현합니다.
- 메트릭 태그 `scenario`는 서버가 아는 현재 장애 이름(없으면 `baseline`)을 씁니다. `campaign`은 헤더 값이 없으면 현재 켜진 캠페인을 씁니다.
- `bitsburg.deposit.pending_seconds`는 서비스 전체 최댓값 하나만 보내고 태그는 `scenario`만 붙습니다. 그룹별로 나누면 대기 건이 없는 그룹의 값이 끊겨서입니다. 시나리오 C의 "영향받는 고객 수"용으로 `bitsburg.deposit.pending_count`를 추가했습니다.
- 잡음 정리: `/healthz`, 5초 상태 조회 쿼리, pending 계산 쿼리는 `DD_TRACE_SAMPLING_RULES`로 샘플링 0, 미들웨어·DNS span 끔.
- (선택) postgres DBM은 이번에 넣지 않았습니다.
- 수정한 문제: nginx가 컨테이너 재시작 뒤 예전 upstream IP를 써서 404가 났습니다. Docker DNS resolver와 변수 `proxy_pass`로 고쳤습니다.

MCP 검증 (`execute_code`: `SpansApi.aggregateSpans/listSpans`, `LogsApi.aggregateLogs/listLogs`, `MetricsApi.listActiveMetrics/queryScalarData`)

| 확인 항목 | 결과 |
| --- | --- |
| env:demo-coinone APM 서비스 | 9개: bitsburg-api-gateway, -auth, -kyc, -kyc-vendor, -wallet, -bank-gateway, -order, -matching, -admin. 10번째 `bitsburg-web`은 RUM 서비스로 3단계에서 확인 |
| 서비스 간 호출 (한 trace 안의 서비스) | `POST /api/kyc/verify`: gateway → kyc → kyc-vendor / `POST /api/orders`: gateway → order → matching / `POST /api/wallet/deposit`: gateway → wallet → bank-gateway |
| 최근 15분 trace / 에러 | 서비스별 span 120~330개, 에러 span 0개 |
| 로그-트레이스 연결 | 최근 30분 로그 77건 중 58건에 `trace_id` (나머지는 시작·백그라운드 로그) |
| bitsburg.* 메트릭 | cs.contact, deposit.amount_krw, deposit.completed, deposit.pending_seconds, deposit.pending_count, deposit.requested, kyc.result, kyc.wait_ms, order.amount_krw, order.filled, order.placed, signup.completed (order.failed는 실패가 생기면 나타남) |
| 값 확인 (최근 1시간) | deposit.requested 15 / deposit.completed 15, kyc.result v1 approved 7·failed 1, v2 approved 5·failed 2 |

### 3단계. 프론트엔드와 RUM

- 시작: 2026-11-09 16:46 KST
- 할 일: apps/web 화면 6개(home, signup, kyc, deposit, trade, login), 데모 배너, CS 플로팅 버튼, RUM/Logs init(DATA_SPEC 4.1), 버전 분기(3.4.2/3.5.0, kyc_flow_v2), 전역 속성, Custom Action 12개, Operation 4개, API 헤더, MCP로 세션·Action·Operation·APM 연결 확인
- 종료: 2026-11-09 16:58 KST, **완료** (Replay 재생 육안 확인은 사람이 할 일로 남김)

결과
- RUM Browser SDK 6.33.0. Operation API는 `startFeatureOperation / succeedFeatureOperation / failFeatureOperation(name, reason, { operationKey, context })`이고 실패 사유는 `error | abandoned | other` 세 가지라 스펙 사유를 이렇게 대응시켰습니다: KYC timeout→`error`, rejected→`other`, 사용자 취소→`abandoned`, 입금 60초 초과(stuck)→`other`, 주문 실패→`error`. 원래 사유는 operation context `reason`과 action context에 남깁니다.
- 전역 속성은 `setGlobalContextProperty('client' | 'campaign' | 'demo', …)`로 넣어 RUM에서 `@context.client.platform`, `@context.campaign.id`, `@context.campaign.source`, `@context.demo.scenario`로 조회됩니다.
- `demo.scenario`는 URL `?scenario=`가 있으면 그 값, 없으면 `/api/demo/state`(서버의 현재 장애)를 따라갑니다.
- "직접 클릭" 대신 Playwright 검증 세션(`pnpm traffic --mode verify`)으로 3.4.2·3.5.0 각각 신규 회원 전체 여정 + 기존 회원 매수를 돌렸습니다. `deposit_stuck`을 만들기 위해 이 단계에서만 DB에 `deposit_delay`를 8분 넣었다가 껐습니다.

MCP 검증 (`execute_code`: `RUMApi.aggregateRUMEvents/listRUMEvents`, 최근 15분, app Bitsburg Exchange)

| 확인 항목 | 결과 |
| --- | --- |
| RUM 세션 / @session.type | 4개 / 전부 `user` |
| 버전별 세션 | 3.4.2: 2, 3.5.0: 2 (`@feature_flags.kyc_flow_v2` 3.4.2=false, 3.5.0=true) |
| View 이름 | home, signup, kyc, deposit, trade, login |
| Custom Action 12개 | signup_started 2, signup_completed 2, kyc_submitted 4, kyc_approved 2, kyc_failed 2, deposit_requested 2, deposit_completed 2, deposit_stuck 1, order_placed 10, order_filled 8, order_failed 2, cs_contact_opened 2 |
| Operation 4개 | signup success 2 / kyc_verification success 2·failure(abandoned) 2 / krw_deposit success 1·failure(other) 1 / place_order success 8·failure(error) 2 |
| 금액 타입 | `@context.order.amount_krw` 숫자 (예: 750000) |
| /api 리소스 → APM | fetch 리소스 7종 전부 `@_dd.trace_id` 있음 (/api/orders 10/10, /api/kyc/verify 4/4 …) |
| Session Replay | 세션 4개 모두 `@session.has_replay:true` |

### 4단계. 장애 스위치와 Datadog Event

- 시작: 2026-11-09 16:59 KST
- 할 일: admin API(`/admin/faults`, `/admin/campaign`, `/admin/state`, X-Admin-Token), postgres 상태 저장, 자동 해제 타이머, 시작·종료 Event, `scripts/fault.sh`, kyc_vendor_slow 5분 ON→OFF 후 MCP로 Event와 v1/v2 지연 비교
- 종료: 2026-11-09 17:03 KST, **완료**

결과
- admin은 `demo_state` 테이블에 쓰고, 다른 서비스는 5초마다 읽습니다. 5초마다 만료된 장애·캠페인을 끄고 종료 Event를 보냅니다(1분짜리로 자동 해제 확인).
- `listing_spike`를 켜면 같은 시간 동안 캠페인 `listing_pups`도 켜지고, order 서비스 DB 풀이 3으로 줄며 쿼리마다 80~250ms `pg_sleep`이 붙습니다.
- 토큰 없이 `/admin/state` 호출 시 401. nginx는 `/admin/`을 admin으로 넘깁니다(9단계 Datadog App 백엔드 함수가 호출).
- 사용법: `scripts/fault.sh kyc_vendor_slow on 0.7 15`, `scripts/fault.sh kyc_vendor_slow off`, `scripts/fault.sh state` (원격은 `BASE=http://<EIP>`).
- 수정한 문제: 처음에는 DogStatsD로 Event를 보냈는데, 한글 제목 길이를 글자 수로 계산해서 Agent가 제목을 `장애 주입 시작: kyc`처럼 잘랐습니다. 스펙대로 Events API(`/api/v1/events`)로 바꿨습니다. 이 때문에 admin 컨테이너에만 `DD_API_KEY`가 들어갑니다. 07:51·07:56(UTC)에 잘린 제목의 Event 2건이 남아 있습니다.

kyc_vendor_slow 리허설: intensity 0.5, 07:51:05~07:56:05 UTC, v1(3.4.2)·v2(3.5.0) 요청 각 2개 루프

MCP 검증 (`execute_code`: `EventsApi.listEvents tags=source:bitsburg-admin`, `SpansApi.aggregateSpans` service:bitsburg-kyc-vendor, `@kyc.flow`별 median/p95)

| 구간 | v1 건수 / p50 / p95 | v2 건수 / p50 / p95 |
| --- | --- | --- |
| 직전 (07:49:35~07:51:05) | 58 / 1.95초 / 2.85초 | 60 / 1.91초 / 2.85초 |
| 장애 중 (07:51:30~07:56:05) | 178 / 1.99초 / 2.97초 | 33 / **14.4초** / **19.8초** |
| 직후 (07:56:30~07:58:00) | 60 / 1.95초 / 2.91초 | 60 / 1.80초 / 2.79초 |

| 확인 항목 | 결과 |
| --- | --- |
| 장애 중 kyc 에러 span (timeout) | v2만 16건, v1 0건 |
| 시작 Event | `[Bitsburg] 장애 주입 시작: kyc_vendor_slow` (warning, tags scenario:kyc_vendor_slow, source:bitsburg-admin, env:demo-coinone) |
| 종료 Event | `[Bitsburg] 장애 주입 종료: kyc_vendor_slow` (success, "자동 해제, 지속 약 1분") |

### 5단계. 트래픽 생성기

- 시작: 2026-11-09 17:04 KST
- 할 일: Playwright 가상 사용자(데스크톱 Chrome UA), baseline·listing_spike 모드, 신규 40%/기존 60%, 버전 60/40, 플랫폼 30/40/30, 전환 확률·금액 분포, 포기 규칙, listing_spike HTTP 부하, systemd 서비스 파일, 로컬 baseline 3명 10분 후 MCP로 session.type·버전·플랫폼·퍼널 확인
- 종료: 2026-11-09 17:37 KST, **완료**

결과
- `tools/traffic-gen`: `pnpm traffic --mode baseline|listing_spike|verify --concurrency N --duration 분(0=무한) --target URL`. Docker 이미지는 `mcr.microsoft.com/playwright:v1.65.0-noble`(Node 26, corepack이 없어 `npm i -g pnpm`), compose `--profile traffic`의 `traffic-gen` 서비스로 실행합니다.
- 브라우저 UA는 데스크톱 Chrome/158(Mac)로 고정해서 세션이 `@session.type:user`로 잡힙니다.
- listing_spike는 Playwright 사용자에 더해 HTTP 부하 35~65명(로그인 후 PUPS 매수, `listing_pups` 헤더)을 같이 돌립니다.
- `tools/traffic-gen/bitsburg-traffic.service`: EC2에서 `docker compose --profile traffic run` 으로 baseline 10명을 상시 실행(Restart=always).
- 검증은 두 번 돌렸습니다. 3명 10분(08:05~08:17 UTC, 세션 14개)은 신규 여정이 4개뿐이어서, 10명 15분(08:17~08:36 UTC, 세션 61개)을 추가로 돌려 합쳐서 봤습니다.
- 참고: RUM 세션의 앱 버전 facet은 `@version`이 아니라 예약 필드 `version`입니다. 7·9단계 쿼리에 그대로 씁니다.

MCP 검증 (`execute_code`: `RUMApi.aggregateRUMEvents`, 08:05~08:38 UTC, 앱 b6478d57…)

| 확인 항목 | 결과 |
| --- | --- |
| @session.type | `user` 75 (synthetic 0) |
| version | 3.4.2 42 / 3.5.0 33 (56% / 44%, 스펙 60/40) |
| @context.client.platform | web 28 / ios 23 / android 24 (스펙 30/40/30, 표본 작음) |
| operation | signup 성공 21·실패 9, kyc_verification 성공 16·실패 2, krw_deposit 성공 11, place_order 성공 107 |

퍼널 (세션 수 기준, `cardinality(@session.id)`)

| 단계 | 세션 수 | 전환율 | 스펙 |
| --- | --- | --- | --- |
| signup 화면 진입 → signup_completed | 30 → 21 | 70% | 75% |
| signup_completed → kyc_approved | 21 → 16 | 76% | 80% |
| kyc_approved → deposit_completed | 16 → 11 | 69% | 65% |
| deposit_completed → 첫 order_filled | 11 → 11 | 100% | 80% |

마지막 단계 100%는 표본 11개에서 나온 편차입니다(확률 80%로 11/11이 나올 확률 약 9%, 코드는 `placeFirstOrder: 0.8`). EC2에서 상시로 돌리면 하루 뒤 수백 세션으로 다시 봅니다(8단계 A).
