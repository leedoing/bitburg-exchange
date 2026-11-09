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
- [ ] (6단계) 행사 날짜가 정해지면 `infra/terraform/variables.tf`의 `delete_after` 기본값(현재 `TBD-day-after-demo`)을 행사 다음 날로 바꾸고 `terraform apply` (태그만 바뀜).
- [ ] (6단계) 행사 다음 날 `infra/teardown.sh` 실행.
- [ ] (7단계) Bits AI SRE 자동 조사 켜기: API·Terraform으로는 켤 수 없습니다(문서 명시). [Bits Investigation > Monitors > Supported](https://hyunjin.datadoghq.com/bits-ai/monitors/supported)에서 `[Bitsburg]` 모니터 4개를 선택하고 Auto-Investigate All.
- [ ] (7단계) Journey "신규 회원 첫 거래"에 단계 추가와 operation 연결: RUM > Journeys에서 kyc_approved·deposit_completed 단계를 넣고 operation 4개(signup, kyc_verification, krw_deposit, place_order)를 링크. API는 시작·종료 2단계만 받고 operation 연결 엔드포인트가 없습니다.
- [ ] (7단계) Product Analytics 퍼널 저장: signup_completed → kyc_approved → deposit_completed → order_filled, Compare by `version`(그리고 `@context.campaign.id`). 저장 API가 없어 대시보드 퍼널 위젯으로 대신해 두었습니다.
- [ ] (3단계) RUM > Sessions에서 Bitsburg Exchange 세션 하나를 열어 Session Replay가 실제로 재생되는지 눈으로 확인 (데이터상 `has_replay:true`는 확인됨).
- [ ] (9단계) Datadog에서 [Bitsburg Pulse](https://hyunjin.datadoghq.com/app-builder/apps/93c2badc-45cf-4c9d-aeba-1b87e70a0f81)를 한 번 열어 6개 탭이 보이는지 확인. 발표를 다른 계정으로 한다면 App Builder에서 앱 권한(Viewer)과 Connection `bitsburg-admin-api` 사용 권한을 그 계정에 주세요. Connection 생성 응답에 `acting_user_can_resolve:false`가 있었는데, 업로드한 계정(앱 키 소유자)으로는 클라우드 경로에서 컨트롤 탭이 정상 동작했습니다.
- [ ] (9단계, 선택) 대시보드에 앱 넣기: Bitsburg Business Overview 편집 > 위젯 추가 > Apps > Bitsburg Pulse. 대시보드 위젯 추가 API는 앱 위젯 스키마가 문서화돼 있지 않아 하지 않았습니다.
- [ ] (9단계) 발표 슬라이드용 "KYC 장애" 상황판 캡처는 리허설 때 다시 찍으세요 (`apps/bitsburg-pulse/scripts/screenshots.cjs`). 지금 `docs/screenshots/*-fault.png`는 장애가 끝난 뒤 장애 구간을 찍은 것입니다.

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

### 6단계. AWS EC2 배포

- 시작: 2026-11-09 17:38 KST
- 할 일: Terraform(infra/terraform, 로컬 state) VPC·서브넷·IGW·보안 그룹(80만)·IAM 역할(SSM Core)·S3 아티팩트 버킷·EC2 t3.medium AL2023 30GB gp3·EIP, SSM Parameter Store에 비밀값 업로드, user-data(docker·compose 설치 → S3 아티팩트 → SSM으로 .env → compose up → traffic-gen baseline systemd), teardown.sh, MCP로 host bitsburg-demo·서비스·RUM 세션 확인
- 종료: 2026-11-09 18:48 KST, **완료**

결과
- 웹 URL: **http://43.202.19.36** (EIP), 인스턴스 `i-03821f4129b934d82`, 접속은 `aws ssm start-session --region ap-northeast-2 --target i-03821f4129b934d82` (22번 포트 없음).
- 저장소가 private이라 git clone 대신 S3 아티팩트로 배포합니다. `infra/deploy.sh`가 `git archive HEAD`(.env 제외)를 버킷 `bitsburg-demo-artifacts-557652101750`에 올리고 7일짜리 presigned URL로 받게 합니다. 코드를 바꾼 뒤 재배포는 `infra/deploy.sh` 한 번(SSM Run Command로 `/usr/local/bin/bitsburg-deploy` 실행)이면 됩니다.
- 비밀값은 `infra/ssm-push.sh`로 SSM Parameter Store에 올렸습니다. SecureString은 `DD_API_KEY`, `DD_RUM_CLIENT_TOKEN`, `ADMIN_TOKEN`이고, String은 `DD_SITE`, `DD_RUM_APP_ID`입니다. `DD_APP_KEY`는 EC2에 필요 없어서 올리지 않았습니다. EC2의 `.env`(600)는 배포 때 SSM에서 만들고 `DD_HOSTNAME=bitsburg-demo`를 붙입니다.
- baseline 트래픽: systemd `bitsburg-traffic.service`(baseline 10명, 무한, Restart=always)를 상시 실행 중입니다. 메모리 사용은 3.8GB 중 약 1.7GB, swap 2GB.
- 로컬 colima 스택은 지표가 두 호스트에서 겹치지 않도록 `docker compose stop` 해 두었습니다(볼륨 유지, `make up`으로 재개).
- 수정한 문제: `AmazonSSMManagedInstanceCore`에는 `ssm:GetParametersByPath`가 없어 첫 부팅에서 `.env` 생성이 실패했습니다. IAM 정책을 늘리지 않고 `ssm:GetParameters`로 이름을 지정해 읽도록 바꿨습니다. 첫 부팅 로그(`/var/log/bitsburg-bootstrap.log`)에 presigned URL이 찍혀서, 이후로는 그 부분의 `set -x`를 껐습니다.
- 정리: 행사 다음 날 `infra/teardown.sh` (terraform destroy + SSM 파라미터 삭제). 버킷은 `force_destroy`라 같이 지워집니다.

terraform plan 요약 (로컬 state, ap-northeast-2, 모든 리소스에 `Purpose=coinone-abm-demo`, `Owner=hyunjin.lee@datadoghq.com`, `DeleteAfter=TBD-day-after-demo` 기본 태그)

| 리소스 | 내용 |
| --- | --- |
| aws_vpc / subnet / internet_gateway / route_table(+association) | 10.42.0.0/16, 퍼블릭 서브넷 10.42.1.0/24 (2a). 계정에 기본 VPC가 없어 새로 만듦. NAT 없음 |
| aws_security_group.web | 인바운드 80/tcp만 0.0.0.0/0, 아웃바운드 전체 |
| aws_iam_role + instance_profile + policy_attachment | 새 역할 `bitsburg-demo-ec2`에 AWS 관리형 `AmazonSSMManagedInstanceCore`만 연결 (기존 IAM 사용자·정책 변경 없음) |
| aws_s3_bucket(+public_access_block) | 코드 아티팩트, 퍼블릭 차단 |
| aws_instance | t3.medium, AL2023, 30GB gp3 암호화, IMDSv2 필수 |
| aws_eip | 43.202.19.36 |
| 합계 | 13 to add, 0 to change, 0 to destroy. 예상 비용 월 약 44달러(EC2 38 + EBS 2.7 + EIP 3.6) |

MCP 검증 (`execute_code`: `HostsApi.listHosts`, `SpansApi.aggregateSpans host:bitsburg-demo`, `RUMApi.aggregateRUMEvents`, 09:27~09:47 UTC)

| 확인 항목 | 결과 |
| --- | --- |
| host bitsburg-demo | up, Agent 7.85.2, apps agent·trace·docker·container·runtime·bitsburg |
| APM 서비스 (host:bitsburg-demo, 20분) | 9개: api-gateway 293, order 212, auth 84, wallet 54, matching 53, kyc 33, kyc-vendor 11, bank-gateway 5, admin 3 |
| RUM (최근 15분) | `bitsburg-web` 세션 34개, 전부 `user`, version 3.4.2 19 / 3.5.0 15, geo Incheon(EC2 리전) |
| 서비스 합계 | 백엔드 9 + RUM `bitsburg-web` = 10 |
| 로그 (host:bitsburg-demo) | auth·kyc·order·wallet 등 서비스별로 수집 중 |
| 퍼블릭 URL | `GET /` 200, `/api/demo/state` 정상, 토큰 없는 `/admin/state` 401 |

참고: AWS 연동 때문에 같은 인스턴스가 `i-03821f4129b934d82`라는 호스트로도 한 줄 더 보입니다. Agent 데이터는 모두 `bitsburg-demo`로 들어옵니다.

### 7단계. Datadog 설정

- 시작: 2026-11-09 18:49 KST
- 할 일: MCP로 메트릭·태그 확인 → Terraform(infra/datadog)으로 SLO 3개, 모니터 4개(한국어 메시지, team:bitsburg, env:demo-coinone), 백업 대시보드 "Bitsburg Business Overview", Sensitive Data Scanner 규칙(주민번호·휴대폰, service:bitsburg-kyc). API/MCP로 RUM retention filter 100%, RUM operation·Journey, Product Analytics 퍼널, Bits AI SRE 조사 대상 확인. 안 되는 것은 '사람이 할 일'로.
- 종료: 2026-11-09 18:56 KST, **완료** (UI 전용 3건은 '사람이 할 일'로)

결과
- Terraform: `infra/datadog` (datadog provider 3.91, 로컬 state). `infra/datadog/tf.sh plan|apply`가 `.env`의 키를 환경 변수로만 넘깁니다.
- 쿼리는 MCP로 실제 메트릭·태그를 확인해서 맞췄습니다. `rum.measure.operation`은 값이 1인 distribution이라 `sum:...as_count()`가 건수이고, `rum.measure.operation.duration`은 나노초, `trace.express.request`는 초 단위 distribution입니다. RUM 메트릭의 앱 버전 태그는 `version`, 백엔드 메트릭은 `app_version`입니다.
- 3.5.0 KYC 실패율 모니터는 벤더 거절(`operation.failure_reason:other`)을 뺐습니다. 평시 3.5.0 KYC는 5분에 몇 건뿐이라 거절 1건만으로도 20%를 넘어 오탐(= Bits 조사 낭비)이 나기 때문입니다. 장애 시 늘어나는 타임아웃(error)과 사용자 포기(abandoned)만 셉니다.
- krw_deposit SLO는 "성공 / 전체"입니다. 앱이 60초가 지나면 operation을 failure(other)로 끝내므로 성공이 곧 "60초 안에 완료"입니다.
- Journey는 DEM Journeys API(`POST /api/v2/dem/journeys`)로 만들었습니다. API가 시작·종료 2단계만 받아서(3단계 이상은 400 "failed len validation") signup_completed → order_filled로 정의했고, 중간 단계와 operation 연결은 UI에서 합니다.
- Product Analytics 퍼널 저장 API는 찾지 못했습니다. 대신 대시보드에 같은 4단계 RUM 퍼널 위젯을 넣었습니다.

| 리소스 | ID / 링크 |
| --- | --- |
| 모니터 (1) 3.5.0 KYC 실패율 > 20% (5분) | 342560230 |
| 모니터 (2) 입금 대기 pending_seconds > 45 | 342560226 |
| 모니터 (3) bitsburg-order p95 > 1s | 342560231 |
| 모니터 (4) cs.contact{topic:deposit} 이상치 | 342560227 |
| SLO kyc_verification 성공률 95% (7d) | 436cc6753f3e528ab2d41c652f66b265 |
| SLO krw_deposit 60초 내 완료 99% (7d) | 8c929933b694522483a1bebb6d1a4db5 |
| SLO place_order p95 < 1s, time slice 5분, 99% (7d) | d173b34c23ca57548e9284ba5005dcfb |
| 대시보드 Bitsburg Business Overview | https://hyunjin.datadoghq.com/dashboard/efb-z22-iqv |
| RUM retention filter "Bitsburg Exchange 세션 100% (데모)" (리플레이·트레이스 100%) | 8075c698-dc31-4e67-be44-de23a59e5e70 |
| Journey "신규 회원 첫 거래" | d94-wvb-kmd |
| SDS 그룹 "Bitsburg KYC 개인정보" (service:bitsburg-kyc) + 규칙 주민등록번호·휴대폰 번호 | 794855dc-a66e-41d5-890b-28ef4df7d80b |

MCP 검증 (`execute_code`: `MonitorsApi.listMonitors tags=team:bitsburg`, `ServiceLevelObjectivesApi.listSLOs`, `DashboardsApi.getDashboard`, `LogsApi.listLogs`, MCP `search_rum_retention_filters`·`search_rum_operations`)

| 확인 항목 | 결과 |
| --- | --- |
| 모니터 4개 | 생성, 전부 OK, 각각 service 태그 (Bits 조사 시 서비스 연결용) |
| SLO 3개 | 생성 (metric 2, time_slice 1) |
| 대시보드 | 그룹 3개(퍼널, KYC 버전별, 거래·입금), 장애 Event 오버레이 `service:bitsburg-admin` |
| RUM operation | SDK operation 4개(signup, kyc_verification, krw_deposit, place_order) 확인 |
| retention filter | 기본 Sessions 100% + 데모 전용 필터 100% |
| SDS 마스킹 | 규칙 생성(09:54 UTC) 후 kyc 로그 `applicant_note` = "주민번호 [주민번호 마스킹] 연락처 [휴대폰 마스킹]", 이후 미마스킹 0건 |
| Terraform 드리프트 | 재 plan "No changes" |

### 9단계. Datadog App "Bitsburg Pulse"

- 시작: 2026-11-09 18:57 KST
- 할 일: `npm create @datadog/apps` 스캐폴드(apps/bitsburg-pulse, vite-react), 백엔드 함수(Action Catalog만 사용)로 메트릭·RUM·Event·모니터 조회와 admin API 호출, 탭 6개(상황판·운영·CS·PM·DA·캠페인·경영 요약·시나리오 컨트롤), hash 딥링크와 기간 토글, 30초 새로고침, 로컬 dev에서 실데이터로 렌더 확인과 캡처, 컨트롤 탭으로 장애 켜서 신호등 변화 확인, `npm run upload`, MCP 검증. 수치 검증은 사용자 요청대로 하루 뒤 따로.
- 종료: 2026-11-09 21:05 KST, **완료** (렌더·업로드까지. 수치 검증은 다음 날)

결과
- 앱: **https://hyunjin.datadoghq.com/app-builder/apps/93c2badc-45cf-4c9d-aeba-1b87e70a0f81** (게시 버전 `2cde627fe8de1d3f`, 태그 `team:bitsburg`, `env:demo-coinone`, `surface:datadog.dashboard`). 다시 올릴 때는 `apps/bitsburg-pulse`에서 `.env`를 환경 변수로 읽고 `npm run upload` (README 참고). `datadog-app.config.json`의 `id`는 바꾸면 안 됩니다.
- 딥링크: `#/situation|ops|pm|campaign|exec|control?range=1h|6h|24h|fault`. `fault`는 마지막 장애 Event 15분 전 ~ 종료 10분 뒤입니다.
- 데이터 출처: `dd/metrics`(queryScalarData·queryTimeseriesData, 메트릭과 RUM), `dd/events`(listEvents), `dd/monitor`(listMonitorsV2), `dd/rum`(listRUMEvents), `http/http`(admin API, Connection `bitsburg-admin-api` = 4b2edd33-a2c2-4296-8f50-ee0798bd4b55). `fetch`는 쓰지 않았습니다.
- PM 퍼널은 "같은 세션" 기준입니다. RUM 집계로 세션 수만 세면 기존 회원의 주문까지 섞여 첫 주문 전환율이 432%처럼 나와서, 단계별 세션 ID 집합을 받아 가입 세션과 교집합으로 셉니다.
- 평균 첫 입금액·평균 주문액은 RUM 액션 금액 평균(1억 초과 제외)을 씁니다. 아래 이상치 때문에 백엔드 분포 메트릭 평균이 ₩62억으로 튀었습니다.
- 캡처: `docs/screenshots/pulse-<탭>-1h.png`, `pulse-<탭>-fault.png` (1440×900 @2x). 다시 찍기: dev 서버를 띄우고 `node scripts/screenshots.cjs [url] [폴더] [range]`.
- 장애 테스트: 컨트롤 탭에서 확인 모달로 `kyc_vendor_slow`(intensity 0.7, 5분)를 켰습니다(`scripts/toggle-fault.cjs`). 시작 Event 11:49:05 UTC, 자동 해제 Event 11:54:25 UTC. 상황판 KYC 신호등은 50초 시점엔 정상, 3분 20초 시점엔 **장애**(3.5.0 평균 대기 11.3초, 3.4.2 1.7초)였습니다. 그 사이는 재 보지 않아 "2분 안" 여부는 다음 날 리허설에서 확인이 필요합니다.

수정한 문제
- 실제 사람이 웹(http://43.202.19.36)에서 주문 금액 칸에 0을 계속 눌러 **주문 3경 원(3×10^16)과 입금 1조 원**이 한 번씩 들어갔습니다(u_001157, 11:46 UTC). 웹 입력을 1억 원으로 막고(Trade·Deposit), order·wallet 서비스도 1억 초과면 400 `invalid_amount`를 돌려주게 해서 EC2에 재배포했습니다(커밋 688a6fb). 확인: 3경 원 주문 400, 30만 원 주문 200. 이미 들어간 두 건은 지울 수 없어서 **11/10 20:47 KST까지** 24시간 합계(경영 요약 거래대금·첫 입금액, 상황판 24시간 거래대금)가 튑니다.
- RUM 집계 쿼리 이름에 공백이 있으면 400이라 내부 이름을 `q0..`로 바꿨습니다. `listMonitors` 응답이 배열이 아니어서 `listMonitorsV2`로 바꿨습니다. DRUIDS `ProminentTabList`가 두 번째 탭 선택 때 오버플로 메뉴로 접혀서 직접 만든 탭 바로 바꿨습니다.

MCP 검증 (`execute_code`: `EventsApi.listEvents sources=bitsburg-admin`, `MetricsApi.queryScalarData`·`queryTimeseriesData` bitsburg.kyc.*, `MonitorsApi.getMonitor 342560230`) + API `GET /api/v2/app-builder/apps/{id}`

| 확인 항목 | 결과 |
| --- | --- |
| 앱 게시 | 200, name Bitsburg Pulse, 태그 3개, deployment 11:58:21 UTC |
| 클라우드 경로 렌더 (`npm run dev:verify`) | 6개 탭 모두 오류 없이 렌더, 컨트롤 탭이 Connection 거쳐 admin 상태 조회 성공 |
| 장애 Event | 시작 11:49:05, 종료 11:54:25 (5분 자동 해제) |
| kyc v2 대기 (분 단위) | 11:46 1.7초, 11:47 1.0초, 11:48 2.7초, **11:49 20.0초(타임아웃, failed)** |
| 장애 중 표본 | 11:50~11:54 사이에는 v1·v2 모두 KYC 요청이 거의 없었습니다(로그 기준 11:50:18 이후 11:54:57까지 0건, 11:53~11:54는 재배포). 표본이 작아 KYC 모니터(342560230)는 OK 유지 |
| 화면 수치 | 상황판 4단계·타일, PM 퍼널(같은 세션), 추정 손실 ₩400만(장애 구간), 경영 요약 카드 ₩81만, 캠페인 6개 차트 모두 현재 데이터로 그려짐 |

## 최종 요약 (2026-11-09 21:05 KST)

0~7단계와 9단계를 마쳤습니다. 8단계(데이터 점검)는 요청대로 하지 않았고 아래 "다음 날 확인할 것"에 넣었습니다.

| 항목 | 값 |
| --- | --- |
| 웹 | http://43.202.19.36 (EC2 `i-03821f4129b934d82`, baseline 트래픽 10명 상시) |
| Datadog App | https://hyunjin.datadoghq.com/app-builder/apps/93c2badc-45cf-4c9d-aeba-1b87e70a0f81 |
| 백업 대시보드 | https://hyunjin.datadoghq.com/dashboard/efb-z22-iqv |
| 저장소 | https://github.com/leedoing/bitburg-exchange (main) |

만든 리소스
- AWS (ap-northeast-2, 전부 `Purpose=coinone-abm-demo`): VPC·서브넷·IGW·라우트 테이블, 보안 그룹 `bitsburg-demo-web`(80), IAM 역할·인스턴스 프로파일 `bitsburg-demo-ec2`, S3 `bitsburg-demo-artifacts-557652101750`, EC2 t3.medium, EIP 43.202.19.36, SSM 파라미터 `/bitsburg-demo/*` 5개, Budget `bitsburg-demo-monthly-50usd`. 예상 월 약 44달러.
- Datadog: RUM 앱 Bitsburg Exchange, 모니터 4개(342560230·342560226·342560231·342560227), SLO 3개, 대시보드 efb-z22-iqv, RUM retention filter 8075c698…, Journey d94-wvb-kmd, SDS 그룹 794855dc…, HTTP Connection `bitsburg-admin-api` 4b2edd33…, Datadog App Bitsburg Pulse 93c2badc….
- 정리: 행사 다음 날 `infra/teardown.sh`(AWS)와 `infra/datadog/tf.sh destroy`(Datadog Terraform 리소스). retention filter·Journey·Connection·App은 Terraform 밖이라 따로 지워야 합니다. 삭제는 모두 사람 확인 후.

사람이 할 일: 위 "사람이 할 일" 목록 그대로입니다 (Bits 자동 조사 켜기, Journey 중간 단계·operation 연결, PA 퍼널 저장, 리플레이 재생 눈 확인, 앱 열어 보기와 권한, 대시보드에 앱 넣기(선택), 장애 캡처 다시 찍기, delete_after 태그, Cost allocation tag, teardown).

다음 날 확인할 것
1. **11/10 20:47 KST 이후에** 숫자를 보세요. 그 전까지는 이상치 두 건 때문에 24시간 거래대금·입금액 합계가 3경·1조 단위로 나옵니다.
2. 8단계 A 데이터 점검: 버전별 퍼널이 스펙(가입→KYC 80%, KYC→첫 입금 65%)에 가까운지, 3.5.0만 KYC에서 꺾이는지, 세션이 수백 개 쌓였을 때 Pulse PM 탭 퍼널과 대시보드 퍼널 위젯 값이 비슷한지.
3. 장애 리허설: `kyc_vendor_slow`를 10분 이상 켜고 (a) 상황판 KYC가 2분 안에 장애로 바뀌는지, (b) 모니터 342560230이 울리는지, (c) PM 추정 손실이 오르는지. `deposit_delay`(입금 대기 45초 모니터, CS 이상치), `listing_spike`(traffic-gen listing_spike 모드와 함께, 주문 p95 모니터·캠페인 탭)도 같은 방식.
4. SDS: 새 kyc 로그에 주민번호·휴대폰이 계속 마스킹되는지.
5. SLO 3개에 하루치 값이 쌓였는지, CS 이상치 모니터(342560227)의 기준선이 생겼는지(anomaly는 학습 기간 필요).
6. Bits Chat 질문 3개(운영·CS 탭의 복사 카드) 답변 품질.
