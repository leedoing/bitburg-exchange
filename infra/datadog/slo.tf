resource "datadog_service_level_objective" "kyc_verification" {
  name        = "[Bitsburg] KYC 인증 성공률 (kyc_verification)"
  type        = "metric"
  description = "RUM operation kyc_verification 중 성공 비율. 실패에는 벤더 거절(other), 타임아웃(error), 사용자 포기(abandoned)가 모두 포함됩니다."

  query {
    numerator   = "sum:rum.measure.operation{operation.name:kyc_verification,operation.status:success,env:${local.env}}.as_count()"
    denominator = "sum:rum.measure.operation{operation.name:kyc_verification,env:${local.env}}.as_count()"
  }

  thresholds {
    timeframe = "7d"
    target    = 95
    warning   = 97
  }

  tags = concat(local.base_tags, ["service:bitsburg-kyc", "journey:first-trade"])
}

resource "datadog_service_level_objective" "krw_deposit" {
  name        = "[Bitsburg] 원화 입금 60초 내 완료 (krw_deposit)"
  type        = "metric"
  description = "RUM operation krw_deposit 중 성공 비율. 앱은 입금 대기가 60초를 넘으면 operation을 failure(other)로 끝내므로, 성공 = 60초 안에 입금 완료입니다."

  query {
    numerator   = "sum:rum.measure.operation{operation.name:krw_deposit,operation.status:success,env:${local.env}}.as_count()"
    denominator = "sum:rum.measure.operation{operation.name:krw_deposit,env:${local.env}}.as_count()"
  }

  thresholds {
    timeframe = "7d"
    target    = 99
    warning   = 99.5
  }

  tags = concat(local.base_tags, ["service:bitsburg-wallet", "journey:first-trade"])
}

resource "datadog_service_level_objective" "place_order" {
  name        = "[Bitsburg] 주문 p95 1초 이내 (place_order)"
  type        = "time_slice"
  description = "5분 구간마다 RUM operation place_order 소요 시간 p95가 1초 미만이면 정상 구간입니다."

  sli_specification {
    time_slice {
      comparator             = "<"
      threshold              = 1000000000 # rum.measure.operation.duration 단위는 나노초
      query_interval_seconds = 300
      query {
        formula {
          formula_expression = "query1"
        }
        query {
          metric_query {
            name        = "query1"
            data_source = "metrics"
            query       = "p95:rum.measure.operation.duration{operation.name:place_order,env:${local.env}}"
          }
        }
      }
    }
  }

  thresholds {
    timeframe = "7d"
    target    = 99
    warning   = 99.5
  }

  tags = concat(local.base_tags, ["service:bitsburg-order", "journey:first-trade"])
}
