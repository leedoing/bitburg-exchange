locals {
  fault_events = [{ q = "service:bitsburg-admin env:${local.env}", tags_execution = "and" }]

  dashboard = {
    title       = "Bitsburg Business Overview"
    description = "Bitsburg Exchange 데모 백업 대시보드. 주인공은 Datadog App \"Bitsburg Pulse\"이고, 이 대시보드는 같은 숫자를 Datadog 기본 화면으로 보여 줍니다. 붉은 선은 장애 주입 Event입니다."
    layout_type = "ordered"
    reflow_type = "fixed"
    tags        = ["team:bitsburg"]
    notify_list = null
    template_variables = [
      { name = "version", prefix = "app_version", available_values = ["3.4.2", "3.5.0"], defaults = ["*"] },
      { name = "campaign", prefix = "campaign", available_values = [], defaults = ["*"] },
    ]
    widgets = [
      {
        definition = {
          type        = "group"
          title       = "신규 회원 퍼널"
          layout_type = "ordered"
          widgets = [
            {
              definition = {
                type  = "funnel"
                title = "가입 완료 → KYC 승인 → 첫 입금 → 첫 주문 (RUM, 세션 기준)"
                requests = [{
                  request_type = "funnel"
                  query = {
                    data_source  = "rum"
                    query_string = "@application.id:${local.rum_app_id} env:${local.env}"
                    steps = [
                      { facet = "@action.name", value = "signup_completed" },
                      { facet = "@action.name", value = "kyc_approved" },
                      { facet = "@action.name", value = "deposit_completed" },
                      { facet = "@action.name", value = "order_filled" },
                    ]
                  }
                }]
              }
              layout = { x = 0, y = 0, width = 6, height = 4 }
            },
            {
              definition = {
                type          = "timeseries"
                title         = "퍼널 단계별 건수 (백엔드 메트릭)"
                show_legend   = true
                legend_layout = "horizontal"
                requests = [{
                  display_type    = "bars"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "signup", query = "sum:bitsburg.signup.completed{env:${local.env},$version,$campaign}.as_count()" },
                    { data_source = "metrics", name = "kyc", query = "sum:bitsburg.kyc.result{env:${local.env},result:approved,$version,$campaign}.as_count()" },
                    { data_source = "metrics", name = "deposit", query = "sum:bitsburg.deposit.completed{env:${local.env},$version,$campaign}.as_count()" },
                    { data_source = "metrics", name = "order", query = "sum:bitsburg.order.filled{env:${local.env},$version,$campaign}.as_count()" },
                  ]
                  formulas = [
                    { formula = "signup", alias = "가입 완료" },
                    { formula = "kyc", alias = "KYC 승인" },
                    { formula = "deposit", alias = "입금 완료" },
                    { formula = "order", alias = "주문 체결" },
                  ]
                }]
                events = local.fault_events
              }
              layout = { x = 6, y = 0, width = 6, height = 4 }
            },
          ]
        }
        layout = { x = 0, y = 0, width = 12, height = 5 }
      },
      {
        definition = {
          type        = "group"
          title       = "KYC (버전별)"
          layout_type = "ordered"
          widgets = [
            {
              definition = {
                type          = "timeseries"
                title         = "버전별 KYC 결과"
                show_legend   = true
                legend_layout = "horizontal"
                requests = [{
                  display_type    = "bars"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "q", query = "sum:bitsburg.kyc.result{env:${local.env},$campaign} by {app_version,result}.as_count()" },
                  ]
                  formulas = [{ formula = "q" }]
                }]
                events = local.fault_events
              }
              layout = { x = 0, y = 0, width = 6, height = 3 }
            },
            {
              definition = {
                type          = "timeseries"
                title         = "버전별 KYC 성공률 (RUM operation, %)"
                show_legend   = true
                legend_layout = "horizontal"
                requests = [{
                  display_type    = "line"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "ok", query = "sum:rum.measure.operation{operation.name:kyc_verification,operation.status:success,env:${local.env}} by {version}.as_count()" },
                    { data_source = "metrics", name = "all", query = "sum:rum.measure.operation{operation.name:kyc_verification,env:${local.env}} by {version}.as_count()" },
                  ]
                  formulas = [{ formula = "100 * ok / all", alias = "성공률" }]
                }]
                events = local.fault_events
              }
              layout = { x = 6, y = 0, width = 6, height = 3 }
            },
          ]
        }
        layout = { x = 0, y = 5, width = 12, height = 4 }
      },
      {
        definition = {
          type        = "group"
          title       = "거래와 입금"
          layout_type = "ordered"
          widgets = [
            {
              definition = {
                type      = "query_value"
                title     = "거래대금 (선택 기간, 원)"
                precision = 0
                autoscale = true
                requests = [{
                  response_format = "scalar"
                  queries = [
                    { data_source = "metrics", name = "q", query = "sum:bitsburg.order.amount_krw{env:${local.env},$version,$campaign}", aggregator = "sum" },
                  ]
                  formulas = [{ formula = "q" }]
                }]
              }
              layout = { x = 0, y = 0, width = 3, height = 2 }
            },
            {
              definition = {
                type        = "timeseries"
                title       = "거래대금 추이 (원, 1분)"
                show_legend = false
                requests = [{
                  display_type    = "bars"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "q", query = "sum:bitsburg.order.amount_krw{env:${local.env},$version,$campaign}.rollup(sum, 60)" },
                  ]
                  formulas = [{ formula = "q", alias = "거래대금" }]
                }]
                events = local.fault_events
              }
              layout = { x = 3, y = 0, width = 9, height = 2 }
            },
            {
              definition = {
                type        = "timeseries"
                title       = "주문 p95 (초, bitsburg-order)"
                show_legend = false
                requests = [{
                  display_type    = "line"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "q", query = "p95:trace.express.request{service:bitsburg-order,env:${local.env}}" },
                  ]
                  formulas = [{ formula = "q", alias = "p95" }]
                }]
                markers = [{ value = "y = 1", display_type = "error dashed", label = "1초" }]
                events  = local.fault_events
              }
              layout = { x = 0, y = 2, width = 6, height = 3 }
            },
            {
              definition = {
                type        = "timeseries"
                title       = "입금 대기 최장 시간 (초)"
                show_legend = false
                requests = [{
                  display_type    = "line"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "q", query = "max:bitsburg.deposit.pending_seconds{env:${local.env}}" },
                  ]
                  formulas = [{ formula = "q", alias = "최장 대기" }]
                }]
                markers = [{ value = "y = 45", display_type = "error dashed", label = "45초" }]
                events  = local.fault_events
              }
              layout = { x = 6, y = 2, width = 6, height = 3 }
            },
            {
              definition = {
                type          = "timeseries"
                title         = "CS 문의 (주제별)"
                show_legend   = true
                legend_layout = "horizontal"
                requests = [{
                  display_type    = "bars"
                  response_format = "timeseries"
                  queries = [
                    { data_source = "metrics", name = "q", query = "sum:bitsburg.cs.contact{env:${local.env}} by {topic}.as_count()" },
                  ]
                  formulas = [{ formula = "q" }]
                }]
                events = local.fault_events
              }
              layout = { x = 0, y = 5, width = 6, height = 3 }
            },
            {
              definition = {
                type  = "list_stream"
                title = "장애·캠페인 Event"
                requests = [{
                  response_format = "event_list"
                  columns         = [{ field = "timestamp", width = "auto" }, { field = "title", width = "auto" }]
                  query           = { data_source = "event_stream", query_string = "service:bitsburg-admin env:${local.env}", event_size = "s" }
                }]
              }
              layout = { x = 6, y = 5, width = 6, height = 3 }
            },
          ]
        }
        layout = { x = 0, y = 9, width = 12, height = 9 }
      },
    ]
  }
}

resource "datadog_dashboard_json" "business_overview" {
  dashboard = jsonencode(local.dashboard)
}
