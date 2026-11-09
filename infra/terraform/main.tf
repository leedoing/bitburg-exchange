terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Purpose     = "coinone-abm-demo"
      Owner       = var.owner
      DeleteAfter = var.delete_after
    }
  }
}

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_caller_identity" "me" {}

# ---------------------------------------------------------------- network
resource "aws_vpc" "demo" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "bitsburg-demo" }
}

resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id
  tags   = { Name = "bitsburg-demo" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true
  tags                    = { Name = "bitsburg-demo-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.demo.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo.id
  }
  tags = { Name = "bitsburg-demo-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "web" {
  name        = "bitsburg-demo-web"
  description = "Bitsburg demo: HTTP only, no SSH (use SSM Session Manager)"
  vpc_id      = aws_vpc.demo.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Bitsburg Pulse (shared demo URL)"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "bitsburg-demo-web" }
}

# ---------------------------------------------------------------- IAM (SSM Session Manager + Parameter Store read)
resource "aws_iam_role" "instance" {
  name = "bitsburg-demo-ec2"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = { Name = "bitsburg-demo-ec2" }
}

# AWS managed policy: Session Manager plus ssm:GetParameter(s) (SecureString via the aws/ssm key).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "bitsburg-demo-ec2"
  role = aws_iam_role.instance.name
  tags = { Name = "bitsburg-demo-ec2" }
}

# ---------------------------------------------------------------- code artifact bucket (private repo: no git clone on EC2)
resource "aws_s3_bucket" "artifacts" {
  bucket        = "bitsburg-demo-artifacts-${data.aws_caller_identity.me.account_id}"
  force_destroy = true
  tags          = { Name = "bitsburg-demo-artifacts" }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------- instance
resource "aws_instance" "demo" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  user_data_replace_on_change = false
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    region       = var.region
    artifact_url = var.artifact_url
  })

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
    tags        = { Name = "bitsburg-demo" }
  }

  lifecycle {
    ignore_changes = [ami, user_data]
  }

  tags = { Name = "bitsburg-demo" }
}

resource "aws_eip" "demo" {
  domain   = "vpc"
  instance = aws_instance.demo.id
  tags     = { Name = "bitsburg-demo" }
}
