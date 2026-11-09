resource "datadog_sensitive_data_scanner_group" "kyc" {
  name         = "Bitsburg KYC 개인정보"
  description  = "bitsburg-kyc 로그의 주민번호·휴대폰 번호를 마스킹합니다 (데모용 가짜 값)."
  product_list = ["logs"]
  is_enabled   = true

  filter {
    query = "service:bitsburg-kyc env:${local.env}"
  }

  samplings {
    product = "logs"
    rate    = 100
  }
}

resource "datadog_sensitive_data_scanner_rule" "kr_rrn" {
  name        = "주민등록번호"
  description = "YYMMDD-GNNNNNN 형식 (성별 자리 1~4)"
  group_id    = datadog_sensitive_data_scanner_group.kyc.id
  pattern     = "\\b\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])-?[1-4]\\d{6}\\b"
  is_enabled  = true
  tags        = ["sensitive_data:kr_rrn", "sensitive_data_category:pii"]

  text_replacement {
    type               = "replacement_string"
    replacement_string = "[주민번호 마스킹]"
  }
}

resource "datadog_sensitive_data_scanner_rule" "kr_mobile" {
  name        = "휴대폰 번호"
  description = "010-XXXX-XXXX 형식"
  group_id    = datadog_sensitive_data_scanner_group.kyc.id
  pattern     = "\\b01[016789]-?\\d{3,4}-?\\d{4}\\b"
  is_enabled  = true
  tags        = ["sensitive_data:kr_mobile", "sensitive_data_category:pii"]

  text_replacement {
    type               = "replacement_string"
    replacement_string = "[휴대폰 마스킹]"
  }
}
