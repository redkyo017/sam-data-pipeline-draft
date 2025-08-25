#!/bin/bash

# Enhanced Cleanup script for SAM Data Pipeline with Environment Support
# Usage: ./scripts/cleanup.sh [environment]
# Supported environments: staging, production (defaults to staging if not specified)

set -e

# Configuration
ENVIRONMENT=${1:-staging}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production|dev)$ ]]; then
    echo "❌ Error: Invalid environment '$ENVIRONMENT'"
    echo "Valid environments: staging, production, dev"
    echo "Usage: ./scripts/cleanup.sh [environment]"
    exit 1
fi

# Environment-specific configurations (from samconfig.toml)
if [ "$ENVIRONMENT" = "staging" ]; then
    STACK_NAME="sam-data-pipeline-staging"
    REGION="ap-southeast-1"
elif [ "$ENVIRONMENT" = "production" ]; then
    STACK_NAME="sam-data-pipeline-production"
    REGION="ap-southeast-1"
elif [ "$ENVIRONMENT" = "dev" ]; then
    STACK_NAME="sam-data-pipeline-dev"
    REGION="ap-southeast-1"
fi

echo ""
echo "🗑️  Deleting SAM Data Pipeline"
echo "   Environment: ${ENVIRONMENT}"
echo "   Region: ${REGION}"  
echo "   Stack: ${STACK_NAME}"
echo ""

# Pre-deletion validations
echo "🔍 Running pre-deletion validations..."

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

# Production safety check
if [ "$ENVIRONMENT" = "production" ]; then
    echo "⚠️  PRODUCTION CLEANUP - This will permanently delete all resources!"
    echo "   This will delete:"
    echo "   - All Lambda functions and their code"
    echo "   - S3 buckets and ALL their contents"
    echo "   - Step Functions state machines and execution history"
    echo "   - API Gateway and all endpoints"
    echo "   - SQS queues and messages"
    echo "   - CloudWatch logs (based on retention settings)"
    echo "   - IAM roles created by the stack"
    echo ""
    read -p "Type 'DELETE' to confirm production cleanup: " -r
    echo
    if [ "$REPLY" != "DELETE" ]; then
        echo "❌ Production cleanup cancelled"
        exit 1
    fi
fi

# Check if stack exists
if aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} > /dev/null 2>&1; then
    echo "🔍 Stack exists, proceeding with deletion..."
    
    # Use SAM delete for proper cleanup of SAM-specific resources
    echo "🗑️  Deleting SAM application..."
    sam delete \
        --config-env ${ENVIRONMENT} \
        --no-prompts
    
    echo ""
    echo "✅ SAM application deleted successfully!"
    echo ""
    echo "🧹 Cleanup completed for ${ENVIRONMENT} environment"
else
    echo "ℹ️  Stack ${STACK_NAME} does not exist or has already been deleted"
fi

echo ""
echo "📋 Post-cleanup verification:"
echo "  1. Verify no resources remain in AWS console"
echo "  2. Check S3 buckets are fully deleted"  
echo "  3. Confirm CloudWatch logs retention as expected"
echo "  4. Review any remaining IAM roles/policies"