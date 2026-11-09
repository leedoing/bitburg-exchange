output "web_url" {
  value = "http://${aws_eip.demo.public_ip}"
}

output "public_ip" {
  value = aws_eip.demo.public_ip
}

output "instance_id" {
  value = aws_instance.demo.id
}

output "artifact_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "ssm_session_command" {
  value = "aws ssm start-session --region ${var.region} --target ${aws_instance.demo.id}"
}
