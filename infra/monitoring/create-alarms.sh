#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:?Set SNS_TOPIC_ARN}"

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "thinkai-api-latency-high" \
  --metric-name "ApiLatencyMs" \
  --namespace "ThinkAI/Services" \
  --statistic "Average" \
  --period 60 \
  --evaluation-periods 5 \
  --threshold 1200 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions "$SNS_TOPIC_ARN"

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "thinkai-api-error-rate-high" \
  --metric-name "ApiErrorCount" \
  --namespace "ThinkAI/Services" \
  --statistic "Sum" \
  --period 60 \
  --evaluation-periods 5 \
  --threshold 25 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions "$SNS_TOPIC_ARN"

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "thinkai-queue-processing-slow" \
  --metric-name "QueueProcessingTimeMs" \
  --namespace "ThinkAI/Services" \
  --statistic "Average" \
  --period 60 \
  --evaluation-periods 5 \
  --threshold 5000 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions "$SNS_TOPIC_ARN"

aws cloudwatch put-metric-alarm \
  --region "$REGION" \
  --alarm-name "thinkai-ai-cost-spike" \
  --metric-name "AiEstimatedCostUsd" \
  --namespace "ThinkAI/Services" \
  --statistic "Sum" \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 10 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions "$SNS_TOPIC_ARN"
