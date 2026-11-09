resource "datadog_monitor" "kyc_failure_v350" {
  name = "[Bitsburg] 3.5.0 KYC 실패율 20% 초과"
  type = "query alert"
  # 벤더 거절(failure_reason:other)은 평시에도 약 8% 나오는 정상 업무 결과라 제외합니다.
  # 평시 3.5.0 KYC는 5분에 몇 건뿐이어서, 거절 1건만으로도 20%를 넘어 오탐이 나기 때문입니다.
  query = "sum(last_5m):(sum:rum.measure.operation{operation.name:kyc_verification,operation.status:failure,!operation.failure_reason:other,version:3.5.0,env:${local.env}}.as_count() / sum:rum.measure.operation{operation.name:kyc_verification,version:3.5.0,env:${local.env}}.as_count()) * 100 > 20"

  message = <<-EOT
    {{#is_alert}}
    **신규 앱 버전 3.5.0 사용자의 KYC 인증 실패율이 {{value}}% 입니다 (기준 20%).**
    {{/is_alert}}
    {{#is_recovery}}
    3.5.0 KYC 실패율이 정상으로 돌아왔습니다.
    {{/is_recovery}}

    - 영향: 신규 가입자가 KYC에서 막히면 첫 입금과 첫 거래로 이어지지 않습니다.
    - 먼저 볼 것: 3.4.2(구 KYC 흐름 v1)도 같이 나빠졌는지, `bitsburg-kyc-vendor` 응답 시간, `KYC vendor v2 response timeout` 로그
    - RUM 운영: ${local.app_url}/rum/operation-catalog?query=%40application.id%3A${local.rum_app_id}
    - Bits에게 물어볼 질문: "3.5.0에서만 KYC 실패가 늘어난 원인이 뭐야? 3.4.2와 비교해 줘"
  EOT

  monitor_thresholds {
    critical = 20
    warning  = 10
  }

  require_full_window = false
  notify_no_data      = false
  renotify_interval   = 0
  include_tags        = false

  tags = concat(local.base_tags, ["service:bitsburg-kyc", "scenario:kyc_vendor_slow"])
}

resource "datadog_monitor" "deposit_pending" {
  name  = "[Bitsburg] 원화 입금 대기 45초 초과"
  type  = "query alert"
  query = "max(last_5m):max:bitsburg.deposit.pending_seconds{env:${local.env}} > 45"

  message = <<-EOT
    {{#is_alert}}
    **가장 오래 기다린 원화 입금이 {{value}}초째 확인되지 않고 있습니다 (기준 45초).**
    {{/is_alert}}
    {{#is_warning}}
    원화 입금 대기가 {{value}}초로 길어지고 있습니다.
    {{/is_warning}}
    {{#is_recovery}}
    원화 입금 대기가 정상으로 돌아왔습니다.
    {{/is_recovery}}

    - 영향: 입금을 기다리는 사용자는 45초를 넘기면 CS 문의를 열고 이탈하기 시작합니다.
    - 먼저 볼 것: `bitsburg-wallet` → `bitsburg-bank-gateway` 구간 지연, `Bank confirmation pending` 로그, `bitsburg.cs.contact{topic:deposit}`
    - Bits에게 물어볼 질문: "지금 원화 입금이 늦어지는 원인이 은행 쪽이야, 우리 쪽이야? 영향받은 사용자는 몇 명이야?"
  EOT

  monitor_thresholds {
    critical = 45
    warning  = 30
  }

  require_full_window = false
  notify_no_data      = false
  include_tags        = false

  tags = concat(local.base_tags, ["service:bitsburg-wallet", "scenario:deposit_delay"])
}

resource "datadog_monitor" "order_p95" {
  name  = "[Bitsburg] 주문 서비스 p95 1초 초과"
  type  = "query alert"
  query = "percentile(last_5m):p95:trace.express.request{service:bitsburg-order,env:${local.env}} > 1"

  message = <<-EOT
    {{#is_alert}}
    **주문 서비스(bitsburg-order) 응답 p95가 {{value}}초입니다 (기준 1초).**
    {{/is_alert}}
    {{#is_recovery}}
    주문 서비스 응답 시간이 정상으로 돌아왔습니다.
    {{/is_recovery}}

    - 영향: 주문이 늦어지면 사용자가 매수를 포기하고, 캠페인 구간의 거래대금이 꺾입니다.
    - 먼저 볼 것: 진행 중인 캠페인(`campaign:listing_pups`), `Order DB pool exhausted` 로그, `bitsburg.order.failed`
    - APM: ${local.app_url}/apm/entity/service%3Abitsburg-order?env=${local.env}
    - Bits에게 물어볼 질문: "주문 지연이 시작된 시점과 원인을 알려 줘. 캠페인 트래픽과 관련 있어?"
  EOT

  monitor_thresholds {
    critical = 1
    warning  = 0.7
  }

  require_full_window = false
  notify_no_data      = false
  include_tags        = false

  tags = concat(local.base_tags, ["service:bitsburg-order", "scenario:listing_spike"])
}

resource "datadog_monitor" "cs_deposit_anomaly" {
  name  = "[Bitsburg] 입금 관련 CS 문의 급증 (이상치)"
  type  = "query alert"
  query = "avg(last_4h):anomalies(sum:bitsburg.cs.contact{topic:deposit,env:${local.env}}.as_count(), 'basic', 2, direction='above', interval=60, alert_window='last_10m', count_default_zero='true') >= 1"

  message = <<-EOT
    {{#is_alert}}
    **입금 관련 CS 문의가 평소보다 크게 늘었습니다.**
    {{/is_alert}}
    {{#is_recovery}}
    입금 관련 CS 문의가 평소 수준으로 돌아왔습니다.
    {{/is_recovery}}

    - 영향: 입금이 늦어지는 사용자가 늘고 있다는 신호입니다. CS 대응 인력과 공지 여부를 확인하세요.
    - 먼저 볼 것: `[Bitsburg] 원화 입금 대기 45초 초과` 모니터, `bitsburg.deposit.pending_seconds`
    - Bits에게 물어볼 질문: "입금 문의가 왜 늘었어? 입금 지연과 관련 있어?"
  EOT

  monitor_thresholds {
    critical          = 1
    critical_recovery = 0
  }

  monitor_threshold_windows {
    trigger_window  = "last_10m"
    recovery_window = "last_10m"
  }

  require_full_window = false
  notify_no_data      = false
  include_tags        = false

  tags = concat(local.base_tags, ["service:bitsburg-api-gateway", "scenario:deposit_delay"])
}
