# Bitsburg Exchange 데모: Cursor 단계별 프롬프트

**전제 환경**

  


- Cursor에 AWS 자격 증명(Admin)이 설정돼 있음 (~/.aws 프로필)
- Cursor mcp.json에 Datadog MCP 서버가 설정돼 있고, 같은 곳에 Datadog API 키와 Application 키가 들어 있음

  


**사용법**

  


- 단계마다 **새 Agent 채팅**을 열고, 아래 코드 블록을 그대로 붙여 넣습니다. 첫 줄의 @docs/...가 문서를 읽게 합니다.
- 단계가 끝나면 **MCP 검증 결과**와 **완료 기준**을 확인하고, git commit 후 다음 단계로 넘어갑니다.
- terraform apply, AWS 리소스 생성·삭제, Datadog 리소스 생성, npm run upload는 Cursor가 실행 전에 보여주면 **직접 읽고 승인**합니다.

  



| **단계** | **내용**                         | **예상 시간** |
| ------ | ------------------------------ | --------- |
| 0      | 환경 점검, 키 정리, RUM 앱 준비          | 30분       |
| 1      | 저장소 뼈대, 규칙 파일, 로컬 실행           | 1~2시간     |
| 2      | 백엔드 서비스와 APM·로그·메트릭            | 2~3시간     |
| 3      | 프론트엔드와 RUM                     | 2~3시간     |
| 4      | 장애 스위치와 Datadog Event          | 1시간       |
| 5      | 트래픽 생성기                        | 1~2시간     |
| 6      | AWS EC2 배포                     | 1시간       |
| 7      | Datadog 설정 (RUM, 퍼널, SLO, 모니터) | 1~2시간     |
| 8      | MCP로 데이터 검증, 장애 리허설            | 1시간       |
| 9      | Datadog App "Bitsburg Pulse"   | 반나절~1일    |
| 10     | 리허설                            | 1시간       |


  


시간은 대략적인 추정입니다. **데모 3일 전까지 6단계(배포)를 끝내고 평소(baseline) 트래픽을 돌려 두는 것**이 목표입니다. 그래야 그래프에 "평소"가 쌓입니다.

  




---



## 0단계. 환경 점검과 키 정리

사전에 직접 할 일은 두 가지뿐입니다.

  


1. 빈 저장소 bitsburg-demo를 만들어 Cursor로 열고, 01_DATA_[SPEC.md](http://SPEC.md) → docs/DATA_[SPEC.md](http://SPEC.md), 이 파일 → docs/CURSOR_[PROMPTS.md](http://PROMPTS.md)로 넣습니다.
2. 터미널에서 Datadog Apps 스킬을 설치하고 Cursor를 재시작합니다.

  


npx skills add datadog-labs/agent-skills --skill datadog-app --full-depth -y

  


@docs/DATA_[SPEC.md](http://SPEC.md) @docs/CURSOR_[PROMPTS.md](http://PROMPTS.md) 를 읽고 이 프로젝트를 시작하자. 이번 단계는 점검과 키 정리만 해. 비밀값(키, 토큰)은 어떤 경우에도 채팅이나 터미널에 출력하지 마.

  


1) AWS: aws sts get-caller-identity 로 계정·사용자 확인, 사용할 리전은 ap-northeast-2.

2) Datadog MCP: 연결된 org 이름과 Datadog site([datadoghq.com](http://datadoghq.com), [ap1.datadoghq.com](http://ap1.datadoghq.com) 등)를 확인해.

   site는 이후 RUM, Agent, Terraform, Datadog Apps 설정에 모두 같은 값으로 써야 해.

3) Cursor mcp.json 에 들어 있는 Datadog API 키와 Application 키를 찾아서, 값은 출력하지 말고 저장소 루트 .env 에

   DD_API_KEY, DD_APP_KEY, DD_SITE 로 옮겨 써 줘. .env 가 .gitignore 에 들어가 있는지도 확인.

   ADMIN_TOKEN 은 openssl rand -hex 24 로 생성해서 .env 에 넣어.

4) Application 키 권한 확인: Datadog Apps 업로드에는 Actions API Access 가 켜진 키가 필요해.

   확인할 수 없으면 내가 Organization Settings > Application Keys 에서 켜야 한다고 알려 줘.

5) RUM: Datadog MCP 또는 API로 'Bitsburg Exchange' 브라우저 RUM 앱이 있는지 찾아.

   없으면 RUM Applications API로 만드는 요청을 보여주고, 내 승인 후 생성해서 application id 와 client token 을

   .env 의 DD_RUM_APP_ID, DD_RUM_CLIENT_TOKEN 에 저장해 (출력 금지).

6) 데모 org에서 RUM without Limits 가 켜져 있는지 확인할 수 있으면 확인하고, 모르면 내가 확인할 항목으로 남겨.

7) AWS Budget 알림(월 50달러, 내 이메일)을 만드는 명령을 보여주고 승인 후 생성.

  


마지막에 아래 표로 정리해 줘: 항목 / 상태(준비됨·필요) / 내가 할 일.

  


**완료 기준:** 표의 모든 항목이 "준비됨". .env에 DD_API_KEY, DD_APP_KEY, DD_SITE, DD_RUM_APP_ID, DD_RUM_CLIENT_TOKEN, ADMIN_TOKEN이 있고 git에 올라가지 않음.

  




---



## 1단계. 저장소 뼈대와 로컬 실행

@docs/DATA_[SPEC.md](http://SPEC.md) 를 이 프로젝트의 기준으로 삼아 줘.

  


먼저 .cursor/rules/demo.mdc 규칙 파일을 만들어서 아래를 항상 지키게 해:

- 서비스 이름, RUM View/Action/Operation 이름, 메트릭 이름, 태그 키는 DATA_[SPEC.md](http://SPEC.md)와 글자 하나까지 같게 쓴다.

- Datadog API 키, App 키, admin 토큰은 프론트엔드 코드·저장소·로그에 절대 넣지 않고 출력하지 않는다. 브라우저 RUM은 clientToken만 쓴다.

- 코인원 이름, 로고, 색상은 쓰지 않는다. 앱 이름은 Bitsburg Exchange.

- AWS 리소스는 ap-northeast-2 에, 태그 Purpose=coinone-abm-demo 를 붙여서만 만든다. AWS·Datadog 리소스 생성/삭제와 terraform apply 는 실행 전에 명령이나 plan 을 보여주고 승인받는다.

- 각 단계가 끝나면 Datadog MCP 로 실제 데이터가 들어왔는지 확인하고 결과를 표로 보고한다.

- DD_SITE 는 .env 값을 모든 설정(RUM, Agent, Terraform, Datadog Apps)에 똑같이 쓴다.

  


그다음 모노레포 뼈대를 만들어 줘:

- pnpm workspace, TypeScript.

- apps/web (React + Vite), services/{api-gateway,auth,kyc,kyc-vendor-mock,wallet,bank-gateway-mock,order,matching-engine,admin} (Express), tools/traffic-gen (Playwright).

- docker-compose.yml: 위 서비스 + postgres + datadog-agent(.env 의 DD_API_KEY, DD_SITE 사용). 웹은 nginx로 빌드 결과를 서빙하고 /api 는 api-gateway로 프록시.

- .env.example (값 없이 키 이름만, APP_VERSION_STABLE=3.4.2, APP_VERSION_NEW=3.5.0 포함).

- 비즈니스 로직은 비워 두고, 각 서비스는 /healthz 200.

- Makefile: make up, make down, make logs, make seed.

  


docker compose up 으로 전체가 뜨는지 확인하고, Datadog MCP 로 이 머신의 Agent(host)가 Datadog에 보이는지 확인해 줘.

  


**완료 기준:** 모든 컨테이너 healthy, [http://localhost에](http://localhost에) 빈 화면, MCP 조회로 Agent host가 보임.

  




---



## 2단계. 백엔드 서비스와 APM·로그·메트릭

@docs/DATA_[SPEC.md](http://SPEC.md) 2장, 5장, 6장을 기준으로 백엔드를 구현해 줘.

  


1) 각 서비스 엔드포인트를 5.1 표대로 구현. 정상 응답 시간과 승인율도 표대로.

   - kyc 서비스는 body의 flow(v1|v2)에 따라 kyc-vendor-mock 의 /vendor/v1/check 또는 /vendor/v2/check 를 호출.

   - wallet 서비스: deposit 요청 시 id를 돌려주고, bank-gateway-mock 확인이 끝나면 상태를 completed로. 프론트는 GET으로 폴링.

     장애 deposit_delay 중에는 에러 없이 HTTP 200 + status:'pending'만 오래 유지.

   - order 서비스: matching-engine 호출 후 postgres 저장. 커넥션 풀 크기는 환경변수(기본 10).

2) 모든 서비스에 dd-trace 자동 계측 (DD_SERVICE=DATA_SPEC 의 bitsburg-* 이름, DD_ENV=demo-coinone, DD_VERSION).

   DD_LOGS_INJECTION=true, DD_RUNTIME_METRICS_ENABLED=true.

   프론트가 보내는 X-App-Version, X-Campaign-Id 헤더를 span 태그 app.version, [campaign.id](http://campaign.id) 로 남겨.

3) 로그는 pino JSON stdout. DATA_SPEC 5.2 의 필드와 장애 시 고정 문구 그대로.

   datadog-agent 가 docker 라벨([com.datadoghq.ad](http://com.datadoghq.ad).logs)로 수집하게 설정 (source:nodejs, service 이름).

4) DogStatsD(hot-shots)로 DATA_SPEC 5.3 의 비즈니스 메트릭 전송. 태그 env, app_version, platform, campaign, scenario.

5) kyc 서비스 로그에 DATA_SPEC 7장대로 무작위 가짜 주민번호·휴대폰 형식 값을 한 필드에 남겨 (마스킹 시연용).

6) (선택) postgres DBM: datadog 사용자, pg_stat_statements, agent postgres 체크. 실패해도 다른 기능은 동작해야 함.

  


scripts/[smoke.sh](http://smoke.sh) 로 가입→KYC→입금→주문 한 사이클 호출하는 스모크 테스트를 만들어 돌려 줘.

그다음 Datadog MCP 로 확인해서 표로 보고해:

- env:demo-coinone 의 bitsburg-* 서비스 목록과 서비스 간 호출 관계

- 최근 15분 trace 수와 에러 수

- 로그에 dd.trace_id 가 붙어 있는지

- bitsburg.* 메트릭 목록

  


**완료 기준:** 스모크 테스트 성공, MCP 보고에서 서비스 10개, 트레이스, 로그-트레이스 연결, 메트릭 확인.

  




---



## 3단계. 프론트엔드와 RUM

@docs/DATA_[SPEC.md](http://SPEC.md) 3장, 4장을 기준으로 apps/web 을 구현해 줘.

  


화면:

- 상단에 항상 "Datadog 데모용 가상 서비스입니다" 배너.

- home, signup, kyc, deposit, trade, login. 다크 테마의 깔끔한 거래소 느낌. 가상 코인 BITS, DOGE2, WOOF, PUPS 의 호가·차트는 가짜 데이터.

- 우측 하단 고객센터 문의 플로팅 버튼. 누르면 topic 선택 후 cs_contact_opened.

  


RUM:

- @datadog/browser-rum, @datadog/browser-logs 6.x 최신 (operations 때문에 6.20.0 이상).

- init 은 DATA_SPEC 4.1 그대로. site 는 .env 의 DD_SITE. trackViewsManually=true, 라우트 변경마다 startView({name}).

- 앱 버전: URL ?appv= 또는 쿠키로 3.4.2 / 3.5.0 결정 후 init 전에 읽어 version 에. 3.5.0이면 kyc_flow_v2=true,

  addFeatureFlagEvaluation('kyc_flow_v2', ...).

- setUser, setGlobalContextProperty 로 4.2 표 속성 전부. client.platform, [campaign.id](http://campaign.id), campaign.source, demo.scenario 는

  URL 쿼리(?platform=&campaign=&source=&scenario=)로 받기 (트래픽 생성기가 사용).

- 4.4 표의 Custom Action 12개를 정확한 이름과 context 로 addAction. 금액은 number.

- 4.5 표의 RUM Operation 4개. Operations Monitoring 공식 문서 Browser 탭의 API 시그니처를 확인해서 start / succeed / fail 구현.

- API 호출에 X-App-Version, X-Campaign-Id 헤더. 실패는 addError.

- deposit 화면: 2초 폴링, 60초 넘게 pending 이면 deposit_stuck + "입금 확인이 지연되고 있어요" 안내.

  


로컬에서 직접 한 사이클 돌아 볼 수 있게 띄워 줘. 내가 클릭해 본 뒤 말하면, Datadog MCP 로 확인해서 표로 보고해:

- 최근 15분 RUM 세션 수, @session.type 분포

- Action 이름별 개수 (12개 이름이 스펙과 정확히 같은지)

- operation 이벤트가 들어왔는지 (@[operation.name](http://operation.name), @operation.status)

- /api 리소스에서 APM trace 로 연결되는지

  


**완료 기준:** 직접 클릭한 세션의 Session Replay가 재생되고, MCP 보고에서 Action 12개 이름과 operation 4개 확인.

  




---



## 4단계. 장애 스위치와 Datadog Event

@docs/DATA_[SPEC.md](http://SPEC.md) 6장을 기준으로 admin 서비스를 구현해 줘.

  


- POST /admin/faults {fault, enabled, intensity, durationMin}  (X-Admin-Token 필수)

- POST /admin/campaign {id: 'none'|'listing_pups'|'promo_deposit_bonus', enabled}

- GET /admin/state : 켜진 장애, 캠페인, 자동 해제까지 남은 시간

- 상태 저장은 postgres 테이블. 각 서비스는 5초마다 상태를 읽어 동작을 바꿈.

- 장애 동작:

  - kyc_vendor_slow: kyc-vendor-mock 의 v2 만 8~15초 지연, intensity 비율만큼 20초 타임아웃.

  - deposit_delay: bank-gateway-mock 응답 30~90초 지연, 에러 없음.

  - listing_spike: 캠페인 listing_pups ON + order 서비스 DB 풀 3으로 축소, 쿼리마다 소폭 지연.

- 켜고 끌 때 Datadog Events API 로 이벤트 전송: "[Bitsburg] 장애 주입 시작: <fault>" / "종료",

  tags scenario:<fault>, source:bitsburg-admin, env:demo-coinone.

- durationMin(기본 15) 후 자동 해제 + 종료 이벤트.

- scripts/[fault.sh](http://fault.sh) <fault> on|off 편의 스크립트.

  


kyc_vendor_slow 를 5분 켰다 끄고, Datadog MCP 로 확인해서 보고해:

- 시작·종료 이벤트가 들어왔는지

- 그 5분 동안 bitsburg-kyc-vendor 의 v2 엔드포인트 지연과, v1 은 그대로인지

  


**완료 기준:** v2만 느려지고, Events에 시작·종료가 찍힘.

  




---



## 5단계. 트래픽 생성기

@docs/DATA_[SPEC.md](http://SPEC.md) 8장을 기준으로 tools/traffic-gen 을 Playwright(Chromium)로 구현해 줘.

  


- 가상 사용자 1명 = 브라우저 컨텍스트 1개. 일반 데스크톱 Chrome User-Agent 를 명시 (헤드리스 기본 UA 금지).

- 모드: baseline, listing_spike. 예: pnpm traffic --mode baseline --concurrency 10 --duration 0(무한) --target <URL>

- 사용자 유형: 신규 40%(home→signup→kyc→deposit→trade), 기존 60%(login→trade).

- 버전 3.4.2:60%, 3.5.0:40%. 플랫폼 web/ios/android 30/40/30. URL 쿼리로 전달.

- 전환 확률과 금액 분포는 DATA_SPEC 8장 표대로.

- 장애에 반응하는 '포기 규칙'만 둔다 (확률을 직접 낮추지 않음):

  KYC 대기 12초 초과 시 50% 이탈(kyc_failed reason:abandoned),

  입금 대기 45초 초과 시 cs_contact_opened(topic:deposit) 후 70% 이탈,

  주문 응답 3초 초과 시 30% 이탈.

- listing_spike: Playwright 15명 + autocannon(또는 k6)으로 /api/orders HTTP 부하. campaign=listing_pups, 대부분 PUPS 매수.

- 입력 사이 300~1500ms 랜덤 대기, 세션 길이 1~4분.

- EC2에서 baseline 상시 실행용 systemd 서비스 파일 (tools/traffic-gen/bitsburg-traffic.service).

  


로컬에서 baseline 3명으로 10분 돌린 뒤 Datadog MCP 로 확인해서 표로 보고해:

- @session.type 분포 (user 여야 함. synthetic 이면 원인 찾아서 수정)

- @version 별 세션 수, client.platform 별 세션 수

- 퍼널 단계별 Action 수와 단계 간 전환율 (DATA_SPEC 8장 표와 비교)

  


**완료 기준:** 세션이 user로 잡히고, 전환율이 스펙 표와 대략 비슷함.

  




---



## 6단계. AWS EC2 배포

이 데모를 AWS에 배포해 줘. Cursor에 설정된 AWS 자격 증명을 사용해.

  


- 리전 ap-northeast-2, Terraform (infra/terraform), state 는 로컬 파일로 충분.

- EC2 1대: t3.medium (Amazon Linux 2023), 30GB gp3.

  태그 Name=bitsburg-demo, Purpose=coinone-abm-demo, Owner=<내 이메일>, DeleteAfter=<데모 다음 날>.

- 보안 그룹: 80 만 0.0.0.0/0. SSH(22)는 열지 말고 SSM Session Manager 로 접속 (인스턴스 프로파일에 AmazonSSMManagedInstanceCore).

- .env 의 비밀값을 SSM Parameter Store SecureString (/bitsburg-demo/*) 으로 올리는 스크립트. 값은 출력 금지.

- user-data: docker, docker compose 설치 → 코드 배포(git clone 또는 S3 아티팩트) → SSM 에서 .env 생성 → make up

  → traffic-gen baseline systemd 시작 (--target [http://localhost](http://localhost)).

- Elastic IP 하나. 출력값: 웹 URL, SSM 접속 명령.

- infra/[teardown.sh](http://teardown.sh): terraform destroy + SSM 파라미터 삭제.

  


apply 전에 terraform plan 결과를 보여주고 승인받아.

배포 후 Datadog MCP 로 확인해서 보고해: host bitsburg-demo 의 Agent, 서비스 10개, 최근 15분 RUM 세션이 EC2 트래픽에서 들어오는지.

  


**완료 기준:** 퍼블릭 URL 접속, MCP 보고에서 EC2 host·서비스·RUM 세션 확인. **행사 다음 날 infra/[teardown.sh](http://teardown.sh) 실행.**

  


t3.small로 가실 경우: traffic-gen은 노트북에서 --target <EC2 URL>로 돌리고, postgres DBM은 끕니다.

  




---



## 7단계. Datadog 설정

**직접 하실 것 (UI, 각 5분 내외)**

  


- ![unchecked](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAA1ElEQVR4Ae3bMQ4BURSFYY2xBuwQ7BIkTGxFRj9Oo9RdkXn5TvL3L19u+2ZmZmZmZhVbpH26pFcaJ9IrndMudb/CWadHGiden1bll9MIzqd79SUd0thY20qga4NA50qgoUGgoRJo/NL/V/N+QIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIEyFeEZyXQpUGgUyXQrkGgTSVQl/qGcG5pnkq3Sn0jOMv0k3Vpm05pmNjfsGPalFyOmZmZmdkbSS9cKbtzhxMAAAAASUVORK5CYII=)
  RUM without Limits retention filter: Bitsburg Exchange 세션 100% 보관
- ![unchecked](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAA1ElEQVR4Ae3bMQ4BURSFYY2xBuwQ7BIkTGxFRj9Oo9RdkXn5TvL3L19u+2ZmZmZmZhVbpH26pFcaJ9IrndMudb/CWadHGiden1bll9MIzqd79SUd0thY20qga4NA50qgoUGgoRJo/NL/V/N+QIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIEyFeEZyXQpUGgUyXQrkGgTSVQl/qGcG5pnkq3Sn0jOMv0k3Vpm05pmNjfsGPalFyOmZmZmdkbSS9cKbtzhxMAAAAASUVORK5CYII=)
  RUM > Operations: 4개 operation 확인 → Journey "신규 회원 첫 거래"로 묶기
- ![unchecked](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAA1ElEQVR4Ae3bMQ4BURSFYY2xBuwQ7BIkTGxFRj9Oo9RdkXn5TvL3L19u+2ZmZmZmZhVbpH26pFcaJ9IrndMudb/CWadHGiden1bll9MIzqd79SUd0thY20qga4NA50qgoUGgoRJo/NL/V/N+QIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIEyFeEZyXQpUGgUyXQrkGgTSVQl/qGcG5pnkq3Sn0jOMv0k3Vpm05pmNjfsGPalFyOmZmZmdkbSS9cKbtzhxMAAAAASUVORK5CYII=)
  Product Analytics 퍼널 저장: signup_completed → kyc_approved → deposit_completed → order_filled, Compare by @version
- ![unchecked](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAA1ElEQVR4Ae3bMQ4BURSFYY2xBuwQ7BIkTGxFRj9Oo9RdkXn5TvL3L19u+2ZmZmZmZhVbpH26pFcaJ9IrndMudb/CWadHGiden1bll9MIzqd79SUd0thY20qga4NA50qgoUGgoRJo/NL/V/N+QIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIEyFeEZyXQpUGgUyXQrkGgTSVQl/qGcG5pnkq3Sn0jOMv0k3Vpm05pmNjfsGPalFyOmZmZmdkbSS9cKbtzhxMAAAAASUVORK5CYII=)
  Sensitive Data Scanner: 주민번호·휴대폰 번호 규칙을 service:bitsburg-kyc 로그에 적용, 마스킹 확인
- ![unchecked](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAA1ElEQVR4Ae3bMQ4BURSFYY2xBuwQ7BIkTGxFRj9Oo9RdkXn5TvL3L19u+2ZmZmZmZhVbpH26pFcaJ9IrndMudb/CWadHGiden1bll9MIzqd79SUd0thY20qga4NA50qgoUGgoRJo/NL/V/N+QIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIEyFeEZyXQpUGgUyXQrkGgTSVQl/qGcG5pnkq3Sn0jOMv0k3Vpm05pmNjfsGPalFyOmZmZmdkbSS9cKbtzhxMAAAAASUVORK5CYII=)
  Bits AI SRE: 아래 모니터가 자동 조사 대상인지 확인

  


**Cursor 프롬프트**

  


@docs/DATA_[SPEC.md](http://SPEC.md) 9장을 기준으로 Datadog 리소스를 Terraform(datadog provider, infra/datadog)으로 만들어 줘.

provider 는 .env 의 DD_API_KEY, DD_APP_KEY, DD_SITE 를 환경변수로 사용.

  


먼저 Datadog MCP 로 실제 들어온 메트릭 이름과 태그를 확인해서 쿼리를 맞춰 줘 (rum.measure.operation 의 [operation.name](http://operation.name), operation.status 태그 포함).

- SLO 3개: kyc_verification 성공률 95%, krw_deposit 60초 내 완료 99%, place_order p95 1초.

- 모니터 4개 (메시지 한국어, 태그 team:bitsburg, env:demo-coinone):

  (1) version:3.5.0 의 kyc_verification 실패율 > 20% (5분)

  (2) bitsburg.deposit.pending_seconds > 45

  (3) bitsburg-order 서비스 p95 > 1s

  (4) [bitsburg.cs.contact](http://bitsburg.cs.contact){topic:deposit} 이상치(anomaly)

- 백업 대시보드 1개 (Bitsburg Business Overview): 퍼널 단계별 수, 버전별 KYC 결과, 거래대금, 주문 p95, 장애 Event 오버레이.

  


terraform plan 을 보여주고 승인받은 뒤 apply. 끝나면 MCP 로 모니터 4개와 SLO 3개가 생성됐는지 확인해.

  




---



## 8단계. MCP로 데이터 검증과 장애 리허설

baseline을 **최소 하루** 돌린 뒤 진행합니다.

  


@docs/DATA_[SPEC.md](http://SPEC.md) 기준으로 데모 데이터를 검증해 줘. Datadog MCP 로 직접 조회하고 결과를 체크리스트 표로 보고해. 장애는 내가 승인할 때만 켜.

  


A. 평시 데이터 (최근 24시간)

- RUM 세션 @session.type 이 user 인지, @version 이 3.4.2 / 3.5.0 두 값으로 나뉘는지

- Custom Action 12개가 모두 있고 @context.order.amount_krw, @context.deposit.amount_krw 가 숫자인지

- operation 4개의 성공률

- 퍼널 전환율이 DATA_SPEC 8장 표(가입 75%, KYC 80%, 입금 65%, 주문 80%)와 비슷한지

  


B. 장애 리허설 (하나씩, 각 10분 ON → OFF, 사이에 10분 휴식)

1) kyc_vendor_slow: 3.5.0 만 KYC 전환율이 떨어지는지, 3.4.2 는 그대로인지, 모니터 (1) 알림

2) listing_spike: 캠페인 유입 증가, 주문 p95 상승, order_failed 증가, 거래대금 정체, 모니터 (3) 알림

3) deposit_delay: 에러율은 그대로인데 pending_seconds 와 cs_contact_opened(topic:deposit) 증가, 모니터 (2)(4) 알림

  


장애마다 장애 구간과 직전 같은 길이 구간의 숫자를 비교 표로 보여줘.

기대와 다르면 원인을 추정하고 고칠 방법을 제안해 (코드 수정은 승인 후).

  


리허설 중에는 Datadog 웹에서 **Bits Chat에 10단계 질문 3개**를 직접 던져 답을 확인하세요.

  




---



## 9단계. Datadog App "Bitsburg Pulse"

datadog-app 스킬을 사용해서 Datadog App 을 만들어 줘. 이름 bitsburg-pulse, 위치 apps/bitsburg-pulse.

@docs/DATA_[SPEC.md](http://SPEC.md) 10장의 탭 구성과 데이터를 그대로 구현해.

  


인증·설정:

- 로컬 개발과 업로드는 .env 의 DD_API_KEY, DD_APP_KEY 사용 (App 키에 Actions API Access 필요). 안 되면 OAuth 로.

- vite.config.ts 의 [auth.site](http://auth.site) 는 .env 의 DD_SITE 와 같게.

  


데이터:

- 전부 *.backend.ts 백엔드 함수에서 가져와. @datadog/action-catalog 의 Datadog API 액션(메트릭 쿼리, RUM 집계, 이벤트 조회, 모니터 상태)을 우선 쓰고,

  없으면 스킬이 안내하는 방법(DDSQL 등)을 써. 쓴 액션을 README 에 표로 정리.

- 쿼리를 만들기 전에 Datadog MCP 로 실제 메트릭·RUM 속성 이름을 확인해서 맞춰.

- 브라우저 코드에는 어떤 키·토큰도 두지 마. 장애 스위치(admin API) 호출은 백엔드 함수에서 HTTP 액션 + Connection(또는 시크릿)으로.

- DatadogAppProvider 로 감싸서 탭마다 딥링크(URL).

- 시간 범위: 최근 1시간 / 6시간 / 24시간 / 장애 구간. 30초 자동 새로고침.

  


디자인 (화려하지만 한눈에):

- 상황판: 퍼널 4단계 가로 신호등(정상 초록 / 주의 주황 / 장애 빨강), 장애 중이면 상단 붉은 배너와 경과 시간.

- 큰 숫자 타일 + 카운트업 애니메이션, 장애 구간은 차트 위 붉은 밴드(Datadog Event 기준).

- 색만으로 상태를 말하지 말고 항상 글자 라벨(정상/주의/장애) 병기.

  


탭: 1) 상황판(기본) 2) 운영·CS 3) PM·DA 4) 캠페인 5) 경영 요약 6) 시나리오 컨트롤(발표자용)

- PM·DA 추정 손실 = (장애 구간 이탈 사용자 수 - 평시 기준 이탈 예상치) × 평균 첫 입금액. 평균 입금액은 실데이터 기본값 + 슬라이더. 계산식을 화면 하단에 작게 표시.

- 운영·CS 탭에 'Bits에게 물어볼 질문' 카드 3개(복사 버튼): docs/CURSOR_[PROMPTS.md](http://PROMPTS.md) 10단계 질문.

- 시나리오 컨트롤 탭은 버튼 누르기 전에 확인 대화상자.

  


먼저 npm run dev 로 로컬에서 보여주고, 내가 확인하면 npm run upload 로 올려. 올린 뒤 대시보드 임베드 방법도 알려 줘.

  


**완료 기준:** 장애 하나를 켜면 2분 안에 상황판 신호등이 바뀌고, PM 탭의 추정 손실이 움직임. 각 탭 화면 캡처를 장표 제작용으로 저장.

  




---



## 10단계. 리허설 스크립트 (50분 세션 기준)


| **시간** | **장면**            | **발표자 동작**                                              | **화면**                                        |
| ------ | ----------------- | ------------------------------------------------------- | --------------------------------------------- |
| 0~5분   | 오프닝               | "같은 장애, 부서마다 다른 질문"                                     | Bitsburg Pulse 상황판 (평시, 전부 초록)                |
| 5~20분  | **A. 퍼널 영향**      | 시나리오 컨트롤에서 kyc_vendor_slow ON (세션 10분 전에 켜 두기 권장)       | 상황판 KYC 빨강 → PM 탭 버전별 퍼널 → 추정 손실 → 이탈 세션 리플레이 |
| 20~33분 | **B. 캠페인**        | listing_spike ON                                        | 캠페인 탭: 유입은 오르는데 주문 성공률·거래대금이 꺾이는 구간 → 경영 요약   |
| 33~45분 | **C. AI에게 먼저 묻기** | deposit_delay ON → 운영·CS 탭에서 CS 문의 증가 확인 → Bits Chat 질의 | 에러율은 정상인데 입금 대기만 길어진 화면, Bits 답변              |
| 45~50분 | 마무리               | "이 앱도 AI 코딩 에이전트로 만들었습니다"                               | Cursor 화면 또는 저장소                              |


  


**Bits Chat 질문 (리허설 때 답변 확인)**

  


1. 시나리오 C: "고객센터에 '입금이 반영이 안 된다'는 문의가 늘고 있어요. 지금 bitsburg 입금 쪽에 문제가 있나요? 영향받는 고객 수와 원인을 요약해 줘."
2. 시나리오 A: "오늘 신규 가입자의 KYC 완료율이 떨어졌다는데, 앱 버전별로 차이가 있어? 원인이 뭐야?"
3. 시나리오 B: "오늘 PUPS 상장 이벤트 시간대에 주문 성공률과 응답 시간이 평소와 비교해 어땠는지, 경영진 보고용으로 요약해 줘."

  


**발표 전 안전장치**

  


- 장애는 세션 시작 10분 전에 켜 두면 데이터가 충분히 쌓인 상태로 보여줄 수 있습니다 (반영 지연 1~2분 대비).
- 각 장면을 리허설 때 녹화해 백업으로 둡니다. Bits 답변은 매번 달라질 수 있습니다.
- 세션이 끝나면 모든 장애 OFF 확인, 행사 다음 날 infra/[teardown.sh](http://teardown.sh).

