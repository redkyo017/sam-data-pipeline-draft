#!/bin/bash

# Enhanced Deployment script for SAM Data Pipeline with Environment Support
# Usage: ./scripts/deploy.sh [environment] [openai-api-key]
# Supported environments: staging, production (defaults to staging if not specified)

set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "🔧 Loading environment variables from .env file..."
    set -a  # Automatically export all variables
    source .env
    set +a  # Stop automatically exporting
fi

# Configuration
ENVIRONMENT=${1:-staging}
OPENAI_API_KEY=${2:-$OPENAI_API_KEY}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo "❌ Error: Invalid environment '$ENVIRONMENT'"
    echo "Valid environments: dev, staging, production"
    echo "Usage: ./scripts/deploy.sh [environment] [openai-api-key]"
    exit 1
fi

# Check for OpenAI API Key
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API Key is required"
    echo "Usage: ./scripts/deploy.sh [environment] [openai-api-key]"
    echo ""
    echo "Examples:"
    echo "  ./scripts/deploy.sh dev \$OPENAI_API_KEY"
    echo "  ./scripts/deploy.sh staging \$OPENAI_API_KEY"
    echo "  ./scripts/deploy.sh production \$OPENAI_API_KEY_PROD"
    echo "  ./scripts/deploy.sh dev  # Uses OPENAI_API_KEY from .env"
    echo ""
    echo "💡 Tip: Set OPENAI_API_KEY in .env file to avoid passing it as parameter"
    exit 1
fi

# Environment-specific configurations (from samconfig.toml)
if [ "$ENVIRONMENT" = "dev" ]; then
    STACK_NAME="sam-data-pipeline-dev"
    REGION="ap-southeast-1"
elif [ "$ENVIRONMENT" = "staging" ]; then
    STACK_NAME="sam-data-pipeline-staging"
    REGION="ap-southeast-1"
elif [ "$ENVIRONMENT" = "production" ]; then
    STACK_NAME="sam-data-pipeline-production"
    REGION="ap-southeast-1"
fi

echo ""
echo "🚀 Deploying SAM Data Pipeline"
echo "   Environment: ${ENVIRONMENT}"
echo "   Region: ${REGION}"
echo "   Stack: ${STACK_NAME}"
echo "   Input Bucket Base: ${INPUT_BUCKET_BASE_NAME:-data-pipeline-input}"
echo "   Output Bucket Base: ${OUTPUT_BUCKET_BASE_NAME:-data-pipeline-output}"
echo ""

# Pre-deployment validations
echo "🔍 Running pre-deployment validations..."

# Check AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ Error: AWS credentials not configured or invalid"
    echo "Please run: aws configure"
    exit 1
fi

# Check if samconfig.toml exists
if [ ! -f samconfig.toml ]; then
    echo "❌ Error: samconfig.toml not found"
    echo "Please ensure the file exists in the project root"
    exit 1
fi

# Validate template
echo "📋 Validating SAM template..."
sam validate --region ${REGION}

# Build the application
echo "🔨 Building SAM application..."
sam build

# Deploy using environment-specific configuration
echo "📦 Deploying to ${ENVIRONMENT} environment..."
if [ "$ENVIRONMENT" = "production" ]; then
    echo "⚠️  PRODUCTION DEPLOYMENT - Please review changes carefully"
    echo "   This deployment will:"
    echo "   - Deploy to region: ${REGION}"
    echo "   - Create/update stack: ${STACK_NAME}"
    echo "   - Use production-level resource configurations"
    echo ""
    read -p "Continue with production deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Production deployment cancelled"
        exit 1
    fi
fi

# Deploy with environment-specific config and OpenAI API key override
sam deploy \
    --config-env ${ENVIRONMENT} \
    --parameter-overrides \
        Environment=${ENVIRONMENT} \
        OpenAIApiKey=${OPENAI_API_KEY} \
        InputBucketBaseName=${INPUT_BUCKET_BASE_NAME:-data-pipeline-input} \
        OutputBucketBaseName=${OUTPUT_BUCKET_BASE_NAME:-data-pipeline-output}

# Post-deployment actions
echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Stack Information:"
aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].{StackName:StackName,Status:StackStatus,Region:Region}' \
    --output table

echo ""
echo "🔗 Stack Outputs:"
aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs' \
    --output table

echo ""
echo "🎉 ${ENVIRONMENT^} environment is ready!"
echo ""
echo "Next steps:"
echo "  1. Test the API endpoint shown above"
echo "  2. Upload test data to the input bucket"
echo "  3. Monitor CloudWatch logs for execution details"
echo "  4. Check SQS dead letter queues for any failures"