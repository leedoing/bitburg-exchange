variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "owner" {
  type    = string
  default = "hyunjin.lee@datadoghq.com"
}

variable "delete_after" {
  description = "Day after the demo (YYYY-MM-DD). Update when the event date is fixed."
  type        = string
  default     = "TBD-day-after-demo"
}

variable "artifact_url" {
  description = "Pre-signed S3 URL of the code tarball (set by infra/deploy.sh)."
  type        = string
  default     = ""
}
