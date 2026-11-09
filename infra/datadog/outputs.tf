output "dashboard_url" {
  value = "${local.app_url}${datadog_dashboard_json.business_overview.url}"
}

output "monitor_ids" {
  value = {
    kyc_failure_v350   = datadog_monitor.kyc_failure_v350.id
    deposit_pending    = datadog_monitor.deposit_pending.id
    order_p95          = datadog_monitor.order_p95.id
    cs_deposit_anomaly = datadog_monitor.cs_deposit_anomaly.id
  }
}

output "slo_ids" {
  value = {
    kyc_verification = datadog_service_level_objective.kyc_verification.id
    krw_deposit      = datadog_service_level_objective.krw_deposit.id
    place_order      = datadog_service_level_objective.place_order.id
  }
}
