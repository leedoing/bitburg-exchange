terraform {
  required_version = ">= 1.6"
  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.60"
    }
  }
}

# Credentials come from the environment: DD_API_KEY, DD_APP_KEY (see ./tf.sh, which loads ../../.env).
provider "datadog" {
  api_url = "https://api.${var.dd_site}/"
}

locals {
  env        = "demo-coinone"
  rum_app_id = "b6478d57-baa4-4ff1-b07c-f9fd12d514d8"
  base_tags  = ["team:bitsburg", "env:demo-coinone"]
  app_url    = "https://app.${var.dd_site}"
}
