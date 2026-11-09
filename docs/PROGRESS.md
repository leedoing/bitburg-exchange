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
