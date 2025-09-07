#!/bin/bash

# Enhanced Deployment script for SAM Data Pipeline with Environment Support
# Usage: ./scripts/deploy.sh [environment] [openai-api-key] [rocketreach-api-key] [apollo-api-key]
# Supported environments: dev, staging, production (defaults to staging if not specified)
# 
# Prerequisites:
# - AWS credentials configured
# - API keys can be provided as parameters OR set in Parameter Store OR in .env file
# 
# Parameter Store setup (optional - keys can be passed directly):
#   aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "your-key" --type "SecureString"
#   aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "your-key" --type "SecureString"

set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "🔧 Loading environment variables from .env file..."
    set -a  # Automatically export all variables
    source .env
    set +a  # Stop automatically exporting
fi

# Configuration - Fixed parameter expansion
ENVIRONMENT=${1:-staging}
OPENAI_API_KEY=${2:-$OPENAI_API_KEY}

# Fix: Use proper nested parameter expansion
ROCKETREACH_API_KEY=${3:-${ROCKETREACH_API_KEY:-${ROCKETREACH_STAGING_KEY:-""}}}
APOLLO_API_KEY=${4:-${APOLLO_API_KEY:-${APOLLO_STAGING_KEY:-""}}}

# Debug: Show API key status (first 8 characters only for security)
if [ "${DEBUG:-false}" = "true" ]; then
    echo "🐛 DEBUG: API Key Status"
    echo "  ROCKETREACH_API_KEY: ${ROCKETREACH_API_KEY:0:8}... (length: ${#ROCKETREACH_API_KEY})"
    echo "  APOLLO_API_KEY: ${APOLLO_API_KEY:0:8}... (length: ${#APOLLO_API_KEY})"
    echo "  OPENAI_API_KEY: ${OPENAI_API_KEY:0:8}... (length: ${#OPENAI_API_KEY})"
    echo ""
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo "❌ Error: Invalid environment '$ENVIRONMENT'"
    echo "Valid environments: dev, staging, production"
    echo "Usage: ./scripts/deploy.sh [environment] [openai-api-key] [rocketreach-api-key] [apollo-api-key]"
    exit 1
fi

# Check for required API Keys
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API Key is required"
    echo "Usage: ./scripts/deploy.sh [environment] [openai-api-key] [rocketreach-api-key] [apollo-api-key]"
    echo ""
    echo "Examples:"
    echo "  # Pass all keys as parameters"
    echo "  ./scripts/deploy.sh dev \$OPENAI_API_KEY \$ROCKETREACH_API_KEY \$APOLLO_API_KEY"
    echo "  # Use keys from .env file"
    echo "  ./scripts/deploy.sh dev"
    echo "  # Mix: required key as parameter, optional keys from .env"
    echo "  ./scripts/deploy.sh staging \$OPENAI_API_KEY"
    echo ""
    echo "💡 Tip: Set API keys in .env file to avoid passing them as parameters"
    exit 1
fi

# Validate enrichment API keys (at least one should be available)
if [ -z "$ROCKETREACH_API_KEY" ] && [ -z "$APOLLO_API_KEY" ]; then
    echo "⚠️  Warning: No enrichment API keys provided"
    echo "   - RocketReach and Apollo API keys not found in parameters or .env file"
    echo "   - Enrichment pipeline will fall back to Parameter Store or be disabled"
    echo "   - To provide keys: ./scripts/deploy.sh $ENVIRONMENT \$OPENAI_API_KEY \$ROCKETREACH_KEY \$APOLLO_KEY"
    echo ""
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
echo "   Input Bucket: ${INPUT_BUCKET_NAME:-data-pipeline-input}"
echo "   Output Bucket: ${OUTPUT_BUCKET_NAME:-data-pipeline-output}"
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

# Check if buckets already exist
echo "🔍 Checking if S3 buckets already exist..."
INPUT_BUCKET_EXISTS="false"
OUTPUT_BUCKET_EXISTS="false"

if aws s3 ls "s3://${INPUT_BUCKET_NAME:-data-pipeline-input}" > /dev/null 2>&1; then
    INPUT_BUCKET_EXISTS="true"
    echo "✅ Input bucket '${INPUT_BUCKET_NAME:-data-pipeline-input}' already exists"
else
    echo "❌ Input bucket '${INPUT_BUCKET_NAME:-data-pipeline-input}' does not exist - will be created"
fi

if aws s3 ls "s3://${OUTPUT_BUCKET_NAME:-data-pipeline-output}" > /dev/null 2>&1; then
    OUTPUT_BUCKET_EXISTS="true"
    echo "✅ Output bucket '${OUTPUT_BUCKET_NAME:-data-pipeline-output}' already exists"
else
    echo "❌ Output bucket '${OUTPUT_BUCKET_NAME:-data-pipeline-output}' does not exist - will be created"
fi
echo ""

# Check enrichment API key availability
echo "🔍 Checking enrichment API key availability..."
KEY_STATUS=""
KEYS_AVAILABLE=false

# Check direct parameters/env vars
if [ -n "$ROCKETREACH_API_KEY" ]; then
    KEY_STATUS="${KEY_STATUS}✅ RocketReach: Provided as parameter/env var\n"
    KEYS_AVAILABLE=true
else
    # Check Parameter Store fallback
    if aws ssm get-parameter --name "/enrichment/rocketreach-api-key" --region ${REGION} > /dev/null 2>&1; then
        KEY_STATUS="${KEY_STATUS}✅ RocketReach: Available in Parameter Store\n"
        KEYS_AVAILABLE=true
    else
        KEY_STATUS="${KEY_STATUS}❌ RocketReach: Not available (parameter or Parameter Store)\n"
    fi
fi

if [ -n "$APOLLO_API_KEY" ]; then
    KEY_STATUS="${KEY_STATUS}✅ Apollo: Provided as parameter/env var\n"
    KEYS_AVAILABLE=true  
else
    # Check Parameter Store fallback
    if aws ssm get-parameter --name "/enrichment/apollo-api-key" --region ${REGION} > /dev/null 2>&1; then
        KEY_STATUS="${KEY_STATUS}✅ Apollo: Available in Parameter Store\n"
        KEYS_AVAILABLE=true
    else
        KEY_STATUS="${KEY_STATUS}❌ Apollo: Not available (parameter or Parameter Store)\n"
    fi
fi

echo -e "$KEY_STATUS"
if [ "$KEYS_AVAILABLE" = false ]; then
    echo "⚠️  Warning: No enrichment API keys available. Enrichment pipeline will be disabled."
    echo ""
fi

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

# Deploy with environment-specific config and API key overrides
# Build parameter overrides with bucket existence logic
PARAM_OVERRIDES="Environment=${ENVIRONMENT}"
PARAM_OVERRIDES="${PARAM_OVERRIDES} OpenAIApiKey=${OPENAI_API_KEY}"
PARAM_OVERRIDES="${PARAM_OVERRIDES} RocketReachApiKey=${ROCKETREACH_API_KEY:-\"\"}"
PARAM_OVERRIDES="${PARAM_OVERRIDES} ApolloApiKey=${APOLLO_API_KEY:-\"\"}"
PARAM_OVERRIDES="${PARAM_OVERRIDES} InputBucketName=${INPUT_BUCKET_NAME:-data-pipeline-input}"
PARAM_OVERRIDES="${PARAM_OVERRIDES} OutputBucketName=${OUTPUT_BUCKET_NAME:-data-pipeline-output}"

# Set bucket creation parameters based on existence
if [ "$INPUT_BUCKET_EXISTS" = "true" ]; then
    PARAM_OVERRIDES="${PARAM_OVERRIDES} CreateInputBucket=false"
else
    PARAM_OVERRIDES="${PARAM_OVERRIDES} CreateInputBucket=true"
fi

if [ "$OUTPUT_BUCKET_EXISTS" = "true" ]; then
    PARAM_OVERRIDES="${PARAM_OVERRIDES} CreateOutputBucket=false"
else
    PARAM_OVERRIDES="${PARAM_OVERRIDES} CreateOutputBucket=true"
fi

sam deploy \
    --config-env ${ENVIRONMENT} \
    --parameter-overrides ${PARAM_OVERRIDES}

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
echo "Available endpoints:"
echo "  📥 Ingestion: /pipelines/ingestion/executions"
echo "  🔍 Enrichment: /pipelines/enrichment/executions"
echo ""
echo "Next steps:"
echo "  1. Test the API endpoints shown above"
echo "  2. Upload test data to the input bucket"  
echo "  3. For enrichment: Ensure API keys are set in Parameter Store (see docs/ENRICHMENT-SETUP.md)"
echo "  4. Monitor CloudWatch logs for execution details"
echo "  5. Check SQS dead letter queues for any failures"