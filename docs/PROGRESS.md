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
