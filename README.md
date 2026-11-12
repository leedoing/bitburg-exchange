# Bitsburg Exchange (비츠버그 거래소)

가입 → KYC → 원화 입금 → 첫 주문으로 이어지는 가상 거래소입니다. Datadog RUM·APM·로그·메트릭과 Datadog App으로 "그 장애, 얼마짜리였을까?"를 보여 주는 데모입니다. 실제 서비스가 아니며, 화면 상단에 항상 데모용 배너가 뜹니다.

- 기준 문서: [`docs/DATA_SPEC.md`](docs/DATA_SPEC.md). 서비스·View·Action·메트릭·태그 이름은 이 문서와 글자 하나까지 같습니다.
- 단계별 작업 지시와 완료 기준: [`docs/CURSOR_PROMPTS.md`](docs/CURSOR_PROMPTS.md)
- 진행 기록, 만든 리소스, 남은 일: [`docs/PROGRESS.md`](docs/PROGRESS.md)

## 보여 주는 세 장면

| # | 시나리오 | 장면 | 장애 스위치 |
| --- | --- | --- | --- |
| A | 장애가 퍼널에 준 영향 | 신규 앱 버전(3.5.0)에서만 KYC 벤더가 느려져 KYC 전환율이 떨어지고, 그만큼 첫 입금 예상액을 놓침 | `kyc_vendor_slow` |
| B | 캠페인 트래픽과 성과 | 신규 상장(PUPS) 이벤트로 트래픽이 몰리고, 주문 지연 구간에서 주문 성공률과 거래대금이 꺾임 | `listing_spike` |
| C | CS 인입 시 AI에게 먼저 묻기 | "입금이 안 돼요" 문의가 늘 때 Bits Chat에 물으면, 에러는 없지만 은행 연동이 30초 넘게 지연 중이라고 답함 | `deposit_delay` |

## 구성

```
[브라우저: bitsburg-web (React + RUM SDK)]
        │  /api/*  (allowedTracingUrls로 RUM ↔ APM 연결)
        ▼
[api-gateway] ─┬─▶ auth ──────────────── Postgres
               ├─▶ kyc ────▶ kyc-vendor-mock      (외부 KYC 벤더 흉내)
               ├─▶ wallet ─▶ bank-gateway-mock    (은행 연동 흉내)
               └─▶ order ──▶ matching-engine ──── Postgres
[admin]          장애 주입·캠페인 모드 (X-Admin-Token)
[datadog-agent]  APM, 로그, DogStatsD
[traffic-gen]    Playwright 가상 사용자 + 스파이크용 HTTP 부하
```

| 경로 | 내용 |
| --- | --- |
| `apps/web` | 거래소 웹 (React, Vite, nginx). RUM 계측은 `src/rum.ts` |
| `apps/bitsburg-pulse` | Datadog App "Bitsburg Pulse" (부서별 탭). [README](apps/bitsburg-pulse/README.md) |
| `services/*` | 백엔드 (Node.js, TypeScript, Express, dd-trace, pino). 공통 코드는 `services/common` |
| `tools/traffic-gen` | 가상 사용자 트래픽 (`baseline`, `listing_spike`, `verify` 모드) |
| `infra/terraform` | AWS (ap-northeast-2, 모든 리소스 `Purpose=coinone-abm-demo` 태그): VPC, EC2 t3.medium, EIP, S3 아티팩트, IAM 역할 |
| `infra/datadog` | Datadog Terraform: 모니터 4개, SLO 3개, 백업 대시보드, Sensitive Data Scanner 규칙 |
| `infra/db` | Postgres 스키마와 시드 |
| `scripts` | `fault.sh`(장애 스위치), `smoke.sh`, `ddapi.sh` |

서비스 이름은 모두 `bitsburg-` 접두사이고, 공통 태그는 `env:demo-coinone`, `team:bitsburg`, `version:<버전>`입니다.

## RUM 계측

자동 수집(View 타이밍, 리소스, long task, 클릭, 세션 리플레이 100%)에 더해 `apps/web/src/rum.ts`에서 아래를 직접 넣습니다.

| 종류 | 내용 |
| --- | --- |
| View 이름 | `trackViewsManually` + `startView`: `home`, `login`, `signup`, `kyc`, `deposit`, `trade` |
| Custom Action | 12개: `signup_started`, `signup_completed`, `kyc_submitted`, `kyc_approved`, `kyc_failed`, `deposit_requested`, `deposit_completed`, `deposit_stuck`, `order_placed`, `order_filled`, `order_failed`, `cs_contact_opened`. 이벤트 context로 `kyc.reason`, `deposit.amount_krw`, `order.amount_krw`, `cs.topic` 등 |
| 전역 context | `client.platform`, `campaign.id`, `campaign.source`, `demo.scenario` |
| 사용자 | `usr.id`, `usr.name`, `usr.tier` (`new`, `regular`, `vip`) |
| 앱 버전 | `version` = `3.4.2`(안정) / `3.5.0`(신규, KYC v2 흐름) |
| Feature flag | `kyc_flow_v2` |
| Feature Operation | `signup`, `kyc_verification`, `krw_deposit`, `place_order` (시작·성공·실패) |
| 에러 | API 실패 시 `addError`에 `step`, `api`, `status` |

## 로컬 실행

필요한 것: Docker, pnpm(10.x), jq.

```bash
cp .env.example .env     # 값 채우기 (DD_API_KEY, DD_APP_KEY, DD_SITE, DD_RUM_APP_ID, DD_RUM_CLIENT_TOKEN, ADMIN_TOKEN 등)
make up                  # 전체 빌드와 기동 (Postgres 첫 기동 때 스키마·기존 회원 시드 자동 적용)
make smoke               # API 연기 테스트
open http://localhost    # WEB_PORT 기본값 80
```

| 명령 | 내용 |
| --- | --- |
| `make ps` / `make logs` / `make down` | 상태, 로그, 종료 |
| `make seed` | 기존 회원 시드 다시 넣기 |
| `make traffic` / `make traffic-stop` | traffic-gen 컨테이너 시작·중지 (`TRAFFIC_MODE`, `TRAFFIC_CONCURRENCY` 등은 `.env`) |
| `scripts/fault.sh kyc_vendor_slow on 0.7 15` | 장애 켜기 (intensity 0.7, 15분 뒤 자동 해제) |
| `scripts/fault.sh kyc_vendor_slow off` | 장애 끄기 |
| `scripts/fault.sh state` | 현재 장애·캠페인 상태 |

원격 호스트에 장애를 걸 때는 `BASE=http://<host> scripts/fault.sh ...`처럼 씁니다. 장애를 켜고 끌 때마다 admin 서비스가 `source:bitsburg-admin` Datadog Event를 남기고, Pulse 차트의 붉은 띠가 이 Event로 그려집니다.

## Datadog App "Bitsburg Pulse"

상황판, 운영·CS, PM·DA, BI·그로스, 캠페인, 경영 요약, 시나리오 컨트롤 탭이 있습니다. 그래프·타일·퍼널 칸을 누르면 해당 시리즈와 시간 구간으로 필터된 RUM Explorer가 열립니다.

```bash
cd apps/bitsburg-pulse
npm install
set -a; . ../../.env; set +a
npm run dev        # 로컬 (http://localhost:5173)
npm run upload     # Datadog에 게시
```

자세한 탭 구성과 데이터 출처는 [`apps/bitsburg-pulse/README.md`](apps/bitsburg-pulse/README.md)에 있습니다.

발표 때 참석자가 Datadog 계정 없이 같이 보도록 EC2에서도 Pulse를 띄웁니다: `http://<EIP>:8080` (`terraform output pulse_url`). 이 주소는 로그인 없이 열리고 시나리오 컨트롤 탭도 누를 수 있습니다.
- compose `pulse` 서비스(profile `pulse`)가 `datadog-apps dev`를 컨테이너로 돌립니다. 백엔드 함수는 Datadog에서 실행되고, 컨테이너에는 Pulse 코드와 환경변수 키만 있습니다.
- 키는 이 용도 전용 App 키 `bitsburg-pulse-ec2`입니다. `infra/pulse-key.sh`가 키를 만들고 Actions API에 등록한 뒤 SSM `/bitsburg-demo/PULSE_DD_APP_KEY`에 넣습니다. 값은 출력하지 않습니다. 행사 후 `infra/pulse-key.sh revoke`로 폐기합니다(`teardown.sh`도 호출).
- 조회 함수(`get*`) 응답은 컨테이너에서 20초 동안 공유합니다(`shared-cache.vite.ts`). 그래서 시청자 수와 상관없이 Datadog 호출량이 일정합니다. 장애 스위치 상태는 3초만 공유하고, 토글하면 바로 비웁니다.

## AWS 배포

저장소가 private이라 EC2는 git clone 대신 S3 아티팩트로 코드를 받습니다. 비밀값은 SSM Parameter Store `/bitsburg-demo/*`에 둡니다.

```bash
infra/ssm-push.sh                        # .env 값을 SSM에 저장
infra/deploy.sh --url-only               # 아티팩트 업로드, presigned URL을 tfvars에 기록
terraform -chdir=infra/terraform apply   # 인프라 생성 (plan 먼저 확인)
infra/deploy.sh                          # 이후 재배포 (SSM Run Command)
infra/datadog/tf.sh apply                # Datadog 모니터·SLO·대시보드·SDS
```

인프라를 지웠다가 다시 만들면 EIP가 바뀝니다. 그때는 시나리오 컨트롤이 쓰는 admin API 주소 두 곳을 새 IP로 맞춥니다. 하나는 `apps/bitsburg-pulse/src/server/config.ts`의 `ADMIN_BASE_URL`, 다른 하나는 Datadog HTTP Connection `bitsburg-admin-api`의 base URL입니다. 맞춘 뒤 `infra/deploy.sh`와 `npm run upload`를 다시 실행합니다. API로 Connection을 고칠 때는 credentials(헤더 `X-Admin-Token`, 토큰 `adminToken`)를 함께 보내야 base URL이 반영됩니다.

EC2에서는 `bitsburg-traffic.service`가 baseline 트래픽을 상시로 돌립니다. 예상 비용은 월 약 44달러이고, 월 50달러 AWS Budget 알림이 걸려 있습니다.

## 정리

행사가 끝나면 `infra/teardown.sh`(AWS, Pulse 전용 App 키 폐기 포함)와 `infra/datadog/tf.sh destroy`(Datadog Terraform 리소스)를 실행합니다. RUM retention filter, Journey, HTTP Connection, Datadog App은 Terraform 밖에서 만들었으므로 따로 지웁니다. 목록은 `docs/PROGRESS.md`의 최종 요약에 있습니다. 삭제는 모두 사람이 확인한 뒤 진행합니다.

## 보안 원칙

- Datadog API 키, App 키, admin 토큰은 `.env`(커밋 제외)와 SSM에만 둡니다. 브라우저 RUM은 clientToken만 씁니다.
- `DD_SITE`는 `.env` 값을 RUM, Agent, Terraform, Datadog App 설정에 똑같이 씁니다.
- KYC 로그의 주민등록번호·휴대폰 번호는 Sensitive Data Scanner 규칙으로 마스킹됩니다.
