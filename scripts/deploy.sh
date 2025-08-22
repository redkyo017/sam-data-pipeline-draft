#!/bin/bash

# Deployment script for SAM Data Pipeline
# Usage: ./scripts/deploy.sh [environment] [region] [openai-api-key]

set -e

ENVIRONMENT=${1:-dev}
REGION=${2:-ap-southeast-1}
OPENAI_API_KEY=${3}
STACK_NAME="sam-data-pipeline-${ENVIRONMENT}"

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API Key is required"
    echo "Usage: ./scripts/deploy.sh [environment] [region] [openai-api-key]"
    exit 1
fi

echo "🚀 Deploying SAM Data Pipeline to ${ENVIRONMENT} environment in ${REGION}"
echo "Stack name: ${STACK_NAME}"

# Validate template
echo "📋 Validating SAM template..."
sam validate --region ${REGION}

# Build the application
echo "🔨 Building SAM application..."
sam build

# Deploy with guided prompts for first time
if [ ! -f samconfig.toml ]; then
    echo "📦 First time deployment - using guided deployment..."
    sam deploy --guided \
        --stack-name ${STACK_NAME} \
        --region ${REGION} \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides \
            Environment=${ENVIRONMENT} \
            OpenAIApiKey=${OPENAI_API_KEY}
else
    echo "📦 Deploying with existing configuration..."
    sam deploy \
        --stack-name ${STACK_NAME} \
        --region ${REGION} \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides \
            Environment=${ENVIRONMENT} \
            OpenAIApiKey=${OPENAI_API_KEY}
fi

echo "✅ Deployment completed!"
echo "📊 Getting stack outputs..."
aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs' \
    --output table