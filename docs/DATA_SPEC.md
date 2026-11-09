# Bitsburg Exchange 데모: 데이터 스펙

코인원 ABM 14:30 세션 「그 장애, 얼마짜리였을까?」용 데모 환경의 데이터 스펙입니다. 이 문서가 **단일 기준(source of truth)**입니다. Cursor 작업 중 이름이나 속성이 헷갈리면 항상 이 문서로 돌아옵니다.

  




---



## 0. 데모가 보여줘야 하는 것 (시나리오 3종)


| **#** | **시나리오**               | **청중**        | **데모에서 보여줄 한 장면**                                                          |
| ----- | ---------------------- | ------------- | -------------------------------------------------------------------------- |
| A     | **장애가 퍼널에 준 영향**       | 프로덕트·DA·경영    | "신규 앱 버전에서만 KYC 벤더가 느려졌고, 그 결과 KYC 전환율이 X%p 떨어져 첫 입금 예상액 ₩Y를 놓쳤다"          |
| B     | **캠페인 트래픽과 성과**        | 그로스·거래지원·사업개발 | "신규 상장 이벤트로 트래픽이 6배 몰렸고, 주문 지연이 커진 구간에서 주문 성공률과 거래대금이 꺾였다"                 |
| C     | **CS 인입 시 AI에게 먼저 묻기** | 서비스운영·CS      | "'입금이 반영이 안 돼요' 문의가 늘자 Bits Chat에 물어보니, 에러는 없지만 은행 연동이 30초 이상 지연 중이라고 답했다" |


  


모든 데이터는 이 세 장면을 만들기 위해서만 존재합니다. 장면에 안 쓰이는 데이터는 만들지 않습니다.

  




---



## 1. 앱 이름과 브랜딩

- 앱 이름: **Bitsburg Exchange (비츠버그 거래소)**. Datadog 데모 세계관의 가상 도시 이름입니다.
- **코인원 이름, 로고, 색상, 화면 디자인은 쓰지 않습니다.** 실제 거래소처럼 보이는 공개 웹을 코인원 브랜드로 띄우면 오해 소지가 있습니다. 발표에서는 "코인원의 가입 → KYC → 입금 → 주문과 같은 흐름을 가진 가상 거래소"로 소개합니다.
- 코인 심볼은 가상 코인: BITS, DOGE2, WOOF, 신규 상장 코인 PUPS.
- 화면 상단에 "Datadog 데모용 가상 서비스입니다" 배너를 항상 표시합니다.

  




---



## 2. 아키텍처

EC2 한 대에 docker compose로 올립니다.

  


[브라우저: exchange-web (React, RUM SDK)]

        │  /api/* (RUM ↔ APM 연결: allowedTracingUrls)

        ▼

[api-gateway] ─┬─▶ [auth-service]     ── Postgres(users)

               ├─▶ [kyc-service]      ──▶ [kyc-vendor-mock]   (외부 KYC 벤더 흉내)

               ├─▶ [wallet-service]   ──▶ [bank-gateway-mock] (은행 실명계좌 연동 흉내)

               └─▶ [order-service]    ──▶ [matching-engine]   ── Postgres(orders)

[admin-service]  : 장애 주입 스위치, 캠페인 모드 (토큰 인증)

[datadog-agent]  : APM, 로그, DogStatsD, (선택) DBM

[traffic-gen]    : Playwright 가상 사용자 + 스파이크용 HTTP 부하 (별도 실행 권장)

  


- 서비스 이름은 bitsburg- 접두사: bitsburg-web, bitsburg-api-gateway, bitsburg-auth, bitsburg-kyc, bitsburg-kyc-vendor, bitsburg-wallet, bitsburg-bank-gateway, bitsburg-order, bitsburg-matching, bitsburg-admin.
- 공통 태그: env:demo-coinone, team:bitsburg, version:<서비스 버전>.
- 언어: 백엔드 Node.js (TypeScript, Express) + dd-trace, 로그는 pino JSON + trace ID 주입.
- 인스턴스: **t3.medium 권장** (2 vCPU, 4GB). t3.small(2GB)은 컨테이너 10개와 Agent만으로 빠듯하고, Playwright 트래픽까지 같이 돌리면 부족합니다. t3.small로 가려면 traffic-gen은 노트북이나 별도 인스턴스에서 실행합니다.

  




---



## 3. 화면(View)과 퍼널


| **단계**  | **View 이름 (startView / 라우트)** | **핵심 버튼** | **다음 단계로 가는 조건**                              |
| ------- | ----------------------------- | --------- | --------------------------------------------- |
| 0       | home                          | 회원가입 시작   |                                               |
| 1       | signup                        | 가입 완료     | /api/auth/signup 성공                           |
| 2       | kyc                           | 신분증 제출    | /api/kyc/verify 결과 approved                   |
| 3       | deposit                       | 원화 입금 요청  | /api/wallet/deposit 후 상태가 completed가 될 때까지 폴링 |
| 4       | trade                         | 매수 주문     | /api/orders 결과 filled                         |
| (기존 회원) | login → trade                 |           | 캠페인 트래픽은 대부분 기존 회원의 매수                        |


  


- RUM trackViewsManually: true로 두고, 라우트 변경 시 startView({ name })를 호출해 View 이름을 위 표와 정확히 맞춥니다. Product Analytics 퍼널을 View 기준으로도, Action 기준으로도 만들 수 있게 하기 위해서입니다.

  




---



## 4. RUM 계측 스펙

### 4.1 초기화

datadogRum.init({

  applicationId, clientToken, site,          // .env 로 주입 (클라이언트 토큰만, API 키 금지)

  service: 'bitsburg-web',

  env: 'demo-coinone',

  version: APP_VERSION,                      // 아래 4.3 참고: '3.4.2' 또는 '3.5.0'

  sessionSampleRate: 100,

  sessionReplaySampleRate: 100,

  trackUserInteractions: true,

  trackResources: true,

  trackLongTasks: true,

  trackViewsManually: true,

  defaultPrivacyLevel: 'mask-user-input',

  allowedTracingUrls: [{ match: window.location.origin, propagatorTypes: ['datadog', 'tracecontext'] }],

  enableExperimentalFeatures: ['feature_operation_vital'],   // RUM Operations (Browser SDK 6.20.0+)

});

datadogLogs.init({ clientToken, site, service: 'bitsburg-web', env: 'demo-coinone', forwardErrorsToLogs: true });

  


- 사전 조건: org에서 **RUM without Limits**가 켜져 있어야 RUM Operations와 Product Analytics를 제대로 쓸 수 있습니다. 데모 앱은 retention filter로 세션 100% 보관합니다.

### 4.2 사용자와 전역 속성


| **키**                                                | **설정 방법**                | **값 예시**                                                | **용도**                 |
| ---------------------------------------------------- | ------------------------ | ------------------------------------------------------- | ---------------------- |
| [usr.id](http://usr.id), [usr.name](http://usr.name) | setUser                  | u_000123, 데모회원123                                       | 세션 리플레이, 영향 사용자 수      |
| usr.tier                                             | setUser                  | new, regular, vip                                       | 세그먼트                   |
| client.platform                                      | setGlobalContextProperty | web, ios, android (**시뮬레이션**)                           | 플랫폼별 비교                |
| [campaign.id](http://campaign.id)                    | setGlobalContextProperty | none, listing_pups, promo_deposit_bonus                 | 시나리오 B                 |
| campaign.source                                      | setGlobalContextProperty | organic, push, kakao_ad, naver_sa                       | 유입 경로                  |
| demo.scenario                                        | setGlobalContextProperty | baseline, kyc_vendor_slow, deposit_delay, listing_spike | 장애 구간 필터 (트래픽 생성기가 설정) |


  


- 플랫폼은 실제 모바일 앱이 아니라 웹에서 속성으로 흉내 낸 값입니다. 발표 노트에도 그렇게 적습니다.
- PII 금지: 실명, 전화번호, 주민번호처럼 보이는 값은 RUM에 넣지 않습니다. (로그의 마스킹 시연은 7장 참고)

### 4.3 앱 버전 (시나리오 A의 핵심)

- 두 버전을 동시에 운영합니다: **3.4.2 (안정 버전, 트래픽 60%)**, **3.5.0 (신규 버전, 트래픽 40%)**.
- 버전은 URL 쿼리 ?appv=3.5.0 또는 쿠키로 정하고, RUM init 전에 읽어서 version에 넣습니다.
- 3.5.0은 새 KYC 흐름(kyc_flow_v2 플래그 ON)을 씁니다. 장애 A는 **v2 흐름이 호출하는 KYC 벤더 엔드포인트만** 느려지게 만들어, "신규 버전에서만 전환율이 떨어졌다"는 그림이 나오게 합니다.
- 플래그 평가는 datadogRum.addFeatureFlagEvaluation('kyc_flow_v2', true|false)로 남깁니다.

### 4.4 Custom Actions (addAction)

이름은 반드시 아래 그대로 씁니다. 퍼널, 앱, 모니터가 모두 이 이름에 의존합니다.

  



| **Action 이름**     | **언제**               | **context 필드**                                                     |
| ----------------- | -------------------- | ------------------------------------------------------------------ |
| signup_started    | 가입 화면 진입 후 첫 입력      | step: 'signup'                                                     |
| signup_completed  | 가입 API 성공            | step: 'signup'                                                     |
| kyc_submitted     | 신분증 제출 클릭            | step: 'kyc', kyc.flow (v1 또는 v2)                                   |
| kyc_approved      | KYC 승인 결과 수신         | step: 'kyc', kyc.flow, kyc.wait_ms                                 |
| kyc_failed        | 거절, 타임아웃, 사용자 이탈(취소) | step: 'kyc', kyc.flow, kyc.reason (timeout / rejected / abandoned) |
| deposit_requested | 입금 요청 클릭             | step: 'deposit', deposit.amount_krw                                |
| deposit_completed | 입금 상태 completed 확인   | step: 'deposit', deposit.amount_krw, deposit.wait_ms               |
| deposit_stuck     | 폴링 60초 넘게 pending    | step: 'deposit', deposit.amount_krw, deposit.wait_ms               |
| order_placed      | 매수 버튼 클릭             | step: 'trade', order.symbol, order.amount_krw, order.side: 'buy'   |
| order_filled      | 체결 응답                | 위와 동일 + order.latency_ms                                           |
| order_failed      | 주문 실패/타임아웃           | 위와 동일 + order.reason                                               |
| cs_contact_opened | "고객센터 문의" 버튼 클릭      | cs.topic (deposit / kyc / order)                                   |


  


- 금액은 원 단위 정수(number)입니다. 문자열로 넣으면 PM 탭의 금액 합계가 깨집니다.
- cs_contact_opened는 시나리오 C에서 "CS 문의가 늘었다"를 RUM 데이터로 보여주는 장치입니다.

### 4.5 RUM Operations (Journeys와 연결)


| **Operation 이름** | **시작**            | **성공**              | **실패**                                    |
| ---------------- | ----------------- | ------------------- | ----------------------------------------- |
| signup           | 가입 화면 진입          | signup_completed 시점 | 가입 API 에러, 이탈                             |
| kyc_verification | kyc_submitted     | kyc_approved        | kyc_failed (timeout, rejected, abandoned) |
| krw_deposit      | deposit_requested | deposit_completed   | deposit_stuck 또는 에러                       |
| place_order      | order_placed      | order_filled        | order_failed                              |


  


- Browser SDK의 operation API(startFeatureOperation 계열)를 씁니다. 정확한 성공·실패 함수 시그니처는 공식 문서 Operations Monitoring의 Browser 탭을 확인해 맞춥니다.
- 네 operation을 하나의 Journey **"신규 회원 첫 거래"**로 묶습니다. 자동 생성 메트릭 rum.measure.operation, rum.measure.operation.duration(태그 [operation.name](http://operation.name), operation.status, operation.failure_reason)을 앱과 모니터에서 씁니다.

### 4.6 에러

- API 실패는 datadogRum.addError(err, { step, api })로 남깁니다.
- **장애 B(입금 지연)는 일부러 에러를 내지 않습니다.** HTTP 200에 status: 'pending'만 계속 돌아오게 해서 "에러는 없는데 입금이 안 된다"는 상황을 만듭니다. Bits Chat이 이걸 지연으로 짚어내는 것이 시나리오 C의 하이라이트입니다.

  




---



## 5. 백엔드 스펙

### 5.1 API


| **서비스**           | **엔드포인트**                                                  | **정상 동작**                           |
| ----------------- | ---------------------------------------------------------- | ----------------------------------- |
| api-gateway       | /api/* 프록시                                                 | 하위 서비스 호출                           |
| auth              | POST /api/auth/signup, POST /api/auth/login                | 80~200ms                            |
| kyc               | POST /api/kyc/verify (body의 flow: v1 또는 v2)                | kyc-vendor 호출, 1~3초, 승인율 92%        |
| kyc-vendor-mock   | POST /vendor/v1/check, POST /vendor/v2/check               | 장애 스위치로 v2만 지연·타임아웃                 |
| wallet            | POST /api/wallet/deposit, GET /api/wallet/deposit/:id      | bank-gateway 호출 후 3~8초 뒤 completed  |
| bank-gateway-mock | POST /bank/transfer-confirm                                | 장애 스위치로 응답 지연(30~90초)               |
| order             | POST /api/orders                                           | matching-engine 호출, 50~300ms, DB 저장 |
| matching-engine   | POST /match                                                | 체결                                  |
| admin             | POST /admin/faults, POST /admin/campaign, GET /admin/state | X-Admin-Token 헤더 필수                 |


### 5.2 APM과 로그

- 모든 서비스에 dd-trace 자동 계측, DD_LOGS_INJECTION=true, DD_RUNTIME_METRICS_ENABLED=true.
- 비즈니스 속성은 span 태그로도 남깁니다: order.symbol, order.amount_krw, deposit.amount_krw, kyc.flow, [campaign.id](http://campaign.id), app.version(프론트에서 헤더 X-App-Version으로 전달).
- 로그는 JSON, 필드: level, msg, service, dd.trace_id, dd.span_id, [usr.id](http://usr.id), step, 그리고 금액·코인 등 비즈니스 필드.
- 장애 시 대표 로그 문구를 고정합니다 (Bits와 로그 패턴이 깔끔하게 잡히도록):
  - KYC vendor v2 response timeout after {ms}ms
  - Bank confirmation pending, retry {n}
  - Order DB pool exhausted, waited {ms}ms

### 5.3 비즈니스 메트릭 (DogStatsD)

Datadog App의 큰 숫자 타일과 모니터용입니다. 태그는 모두 env, app_version, platform, campaign, scenario를 붙입니다.

  



| **메트릭**                                           | **타입**                                     | **의미**                 |
| ------------------------------------------------- | ------------------------------------------ | ---------------------- |
| bitsburg.signup.completed                         | count                                      | 가입 완료 수                |
| bitsburg.kyc.result                               | count, 태그 result (approved / failed), flow | KYC 결과                 |
| bitsburg.kyc.wait_ms                              | distribution                               | KYC 대기 시간              |
| bitsburg.deposit.requested / .completed           | count                                      | 입금 요청·완료 수             |
| bitsburg.deposit.amount_krw                       | distribution                               | 입금액                    |
| bitsburg.deposit.pending_seconds                  | gauge                                      | 현재 가장 오래 기다린 입금의 대기 시간 |
| bitsburg.order.placed / .filled / .failed         | count                                      | 주문 수                   |
| bitsburg.order.amount_krw                         | distribution                               | 주문액 (거래대금 합계 계산용)      |
| [bitsburg.cs.contact](http://bitsburg.cs.contact) | count, 태그 topic                            | CS 문의 버튼 클릭 수          |


  




---



## 6. 장애 시나리오와 스위치

POST /admin/faults 바디 예: { "fault": "kyc_vendor_slow", "enabled": true, "intensity": 0.7 }

  



| **fault 이름**    | **영향**                                               | **기대되는 데이터 변화**                                                           | **연결 시나리오** |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ----------- |
| kyc_vendor_slow | kyc-vendor **v2만** 8~15초 지연, intensity 비율만큼 20초 타임아웃 | 3.5.0의 kyc_verification 실패율 급증, KYC 전환율 하락, 첫 입금 감소                       | A           |
| deposit_delay   | bank-gateway 응답 30~90초 지연, 에러 없음                     | deposit_stuck 증가, pending_seconds 상승, cs_contact_opened(topic:deposit) 증가 | C (와 A)     |
| listing_spike   | 캠페인 모드 listing_pups ON, 트래픽 5~8배, order DB 커넥션 풀 고갈  | 주문 p95 상승, order_failed 증가, 캠페인 유입 대비 거래대금 정체                             | B           |


  


- 스위치를 켜고 끌 때마다 **Datadog Event**를 보냅니다 (title 예: [Bitsburg] 장애 주입 시작: kyc_vendor_slow, 태그 scenario:kyc_vendor_slow, source:bitsburg-admin). 앱과 그래프에서 "여기서부터 장애"를 표시하는 기준선이 됩니다.
- 모든 스위치는 자동 해제 타이머(기본 15분)를 가집니다. 켜 둔 채 잊어도 데모 데이터가 망가지지 않게 하기 위해서입니다.

  




---



## 7. 준법·보안 시연 포인트 (선택)

- KYC 서비스 로그에 일부러 **가짜 주민번호·휴대폰 번호 형식의 값**을 남기고, **Sensitive Data Scanner**가 수집 단계에서 마스킹하는 것을 보여줍니다. 값은 무작위로 생성한 가짜 데이터만 씁니다. SDS 기본 규칙이 형식을 엄격하게 검사할 수 있으니, 먼저 규칙에 걸리는지 확인하고 안 걸리면 커스텀 정규식 규칙을 추가합니다.
- Audit Trail은 준법(내부통제) 질문 "누가 이 대시보드·데이터를 봤나"용으로 한 장면만.
- AML 쪽은 "이상거래 감시 시스템에 들어가는 데이터가 제때 흐르는가" 관점입니다. 이 데모 범위 밖이므로 데이터는 따로 만들지 않습니다.

  




---



## 8. 트래픽 프로필 (traffic-gen)


| **모드**        | **가상 사용자**                           | **내용**                                                      |
| ------------- | ------------------------------------ | ----------------------------------------------------------- |
| baseline      | 동시 8~12명, 상시                         | 신규 회원 퍼널 40%, 기존 회원 매수 60%                                  |
| listing_spike | 동시 50~80명 (Playwright 15명 + HTTP 부하) | [campaign.id](http://campaign.id)=listing_pups, 대부분 PUPS 매수 |
| warmup        | 데모 3일 전부터 baseline 상시                | 그래프에 "평소"가 보이도록                                             |


  


**기본 전환 확률 (baseline)**

  



| **단계**           | **다음 단계로 갈 확률** |
| ---------------- | --------------- |
| home → signup 완료 | 75%             |
| signup → KYC 승인  | 80% (v1, v2 동일) |
| KYC → 첫 입금 완료    | 65%             |
| 입금 → 첫 주문 체결     | 80%             |


  


- 장애 중에는 이 확률을 코드로 낮추지 않습니다. **장애로 생긴 지연과 타임아웃 때문에 가상 사용자가 실제로 포기하는 규칙**(예: KYC 대기 12초 넘으면 50% 확률로 이탈, 입금 대기 45초 넘으면 cs_contact_opened 후 이탈)만 둡니다. 그래야 데이터가 "장애 → 이탈"로 자연스럽게 이어집니다.
- 금액 분포: 입금 10만~~500만원(로그정규), 주문 5만~~300만원. VIP는 3배.
- Playwright는 일반 데스크톱 Chrome User-Agent를 지정합니다. 헤드리스 기본 UA는 봇·합성 트래픽으로 분류될 수 있어, Product Analytics 집계에서 빠질 수 있습니다. 첫 실행 후 RUM에서 @session.type:user로 잡히는지 확인합니다.

  




---



## 9. Datadog 쪽 설정


| **항목**                 | **내용**                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RUM 앱                  | Bitsburg Exchange (Browser), RUM without Limits retention filter 100%                                                                                                                |
| Product Analytics      | 퍼널: signup_completed → kyc_approved → deposit_completed → order_filled, 버전·캠페인으로 비교                                                                                                  |
| Journey                | "신규 회원 첫 거래" = 4개 operation                                                                                                                                                          |
| SLO                    | kyc_verification 성공률 95%, krw_deposit 60초 내 완료 99%, place_order p95 1초                                                                                                               |
| 모니터                    | (1) 3.5.0 KYC 실패율 > 20% (2) bitsburg.deposit.pending_seconds > 45 (3) 주문 p95 > 1s (4) [bitsburg.cs.contact](http://bitsburg.cs.contact){topic:deposit} 급증(이상치). 모두 Bits AI SRE 조사 대상 |
| Sensitive Data Scanner | 주민번호 패턴, 휴대폰 번호 패턴 마스킹                                                                                                                                                               |
| 대시보드                   | 최소한만 (백업용). 주인공은 Datadog App                                                                                                                                                         |


  




---



## 10. Datadog App "Bitsburg Pulse" (페르소나 탭)


| **탭**               | **대상**        | **핵심 화면**                                                                             | **데이터**                                                  |
| ------------------- | ------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **상황판** (기본)        | 전원            | 퍼널 4단계 신호등, 진행 중 장애 배너, 최근 Event 타임라인                                                 | operation 메트릭, Events                                    |
| **운영 · CS**         | 서비스운영·거래지원    | "지금 장애인가?" 단계별 상태, 입금 대기 최장 시간, CS 문의 추이, "Bits에게 물어볼 질문" 복사 버튼                       | pending_seconds, [cs.contact](http://cs.contact), 모니터 상태 |
| **PM · DA**         | 프로덕트·전략기획     | 버전별 퍼널(3.4.2 vs 3.5.0), 단계별 이탈, **추정 손실 = 이탈 사용자 × 평균 입금액**(입력값 조절 가능), 이탈 세션 리플레이 링크 | RUM actions 집계, deposit.amount_krw                       |
| **캠페인**             | 그로스·사업개발·거래지원 | 캠페인 vs 평시: 유입, 가입, 주문 수, 거래대금, 주문 p95와 실패율을 한 타임라인에 겹침                                | order.* 메트릭, RUM [campaign.id](http://campaign.id)       |
| **경영 요약**           | 팀장급           | 오늘의 한 줄 요약, 장애별 추정 영향(건수·금액·사용자) 카드                                                   | 위 데이터 요약                                                 |
| **시나리오 컨트롤** (발표자용) | 발표자           | 장애 3종 ON/OFF 버튼, 남은 자동 해제 시간                                                          | admin API (백엔드 함수에서만 호출, 토큰은 Connection/시크릿)             |


  


- 백엔드 함수에서 Datadog 데이터를 읽습니다(@datadog/action-catalog 또는 Datadog API). 브라우저 코드에 API 키나 admin 토큰을 넣지 않습니다.
- 디자인: DRUIDS 컴포넌트를 기본으로 하되, 숫자 타일은 크게, 장애 구간은 붉은 밴드로, 숫자가 바뀔 때 카운트업 애니메이션. 한눈에 "지금 괜찮은지 / 얼마나 손해인지"가 보여야 합니다.
- 탭은 URL(딥링크)로 바로 열리게 합니다. 발표 중 탭 전환을 링크로 미리 준비해 둘 수 있습니다.

