#!/bin/bash

# Environment Management Script for SAM Data Pipeline
# Usage: ./scripts/manage-environments.sh [action] [environment]
# Actions: status, delete, logs
# Environments: staging, production

set -e

ACTION=${1}
ENVIRONMENT=${2}

show_usage() {
    echo "Usage: ./scripts/manage-environments.sh [action] [environment]"
    echo ""
    echo "Actions:"
    echo "  status     - Show stack status and outputs"
    echo "  delete     - Delete the environment stack"
    echo "  logs       - Show recent CloudWatch logs"
    echo "  test       - Test the API endpoint"
    echo ""
    echo "Environments:"
    echo "  staging    - Staging environment (ap-southeast-1)"
    echo "  production - Production environment (ap-southeast-1)"
    echo ""
    echo "Examples:"
    echo "  ./scripts/manage-environments.sh status staging"
    echo "  ./scripts/manage-environments.sh delete staging"
    echo "  ./scripts/manage-environments.sh logs production"
    echo "  ./scripts/manage-environments.sh test staging"
}

if [ -z "$ACTION" ] || [ -z "$ENVIRONMENT" ]; then
    show_usage
    exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    echo "❌ Error: Invalid environment '$ENVIRONMENT'"
    show_usage
    exit 1
fi

# Set environment-specific variables
if [ "$ENVIRONMENT" = "staging" ]; then
    STACK_NAME="sam-data-pipeline-staging"
    REGION="ap-southeast-1"
elif [ "$ENVIRONMENT" = "production" ]; then
    STACK_NAME="sam-data-pipeline-production"
    REGION="ap-southeast-1"
fi

case "$ACTION" in
    "status")
        echo "📊 Stack Status for ${ENVIRONMENT^} Environment"
        echo "   Stack: ${STACK_NAME}"
        echo "   Region: ${REGION}"
        echo ""
        
        # Check if stack exists
        if aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} > /dev/null 2>&1; then
            echo "Stack Information:"
            aws cloudformation describe-stacks \
                --stack-name ${STACK_NAME} \
                --region ${REGION} \
                --query 'Stacks[0].{StackName:StackName,Status:StackStatus,CreationTime:CreationTime,LastUpdatedTime:LastUpdatedTime}' \
                --output table
            
            echo ""
            echo "Stack Outputs:"
            aws cloudformation describe-stacks \
                --stack-name ${STACK_NAME} \
                --region ${REGION} \
                --query 'Stacks[0].Outputs' \
                --output table
        else
            echo "❌ Stack ${STACK_NAME} does not exist in region ${REGION}"
            exit 1
        fi
        ;;
        
    "delete")
        echo "🗑️  Delete ${ENVIRONMENT^} Environment"
        echo "   Stack: ${STACK_NAME}"
        echo "   Region: ${REGION}"
        echo ""
        echo "⚠️  WARNING: This will permanently delete all resources!"
        echo "   - Lambda functions"
        echo "   - S3 buckets (and all data!)"
        echo "   - Step Functions state machine"
        echo "   - CloudWatch logs"
        echo "   - SQS queues"
        echo ""
        read -p "Are you sure you want to delete the ${ENVIRONMENT} environment? (type 'DELETE' to confirm): " confirmation
        
        if [ "$confirmation" = "DELETE" ]; then
            echo "🗑️  Deleting stack..."
            aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}
            
            echo "⏳ Waiting for deletion to complete..."
            aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME} --region ${REGION}
            
            echo "✅ ${ENVIRONMENT^} environment successfully deleted!"
        else
            echo "❌ Deletion cancelled"
            exit 1
        fi
        ;;
        
    "logs")
        echo "📋 CloudWatch Logs for ${ENVIRONMENT^} Environment"
        echo ""
        
        # Get log group name
        LOG_GROUP="/aws/stepfunctions/${STACK_NAME}-ingestion"
        
        echo "Recent logs from: ${LOG_GROUP}"
        echo ""
        
        # Check if log group exists and get recent logs
        if aws logs describe-log-groups --log-group-name-prefix ${LOG_GROUP} --region ${REGION} | grep -q ${LOG_GROUP}; then
            aws logs tail ${LOG_GROUP} --region ${REGION} --since 1h
        else
            echo "❌ Log group ${LOG_GROUP} not found in region ${REGION}"
            echo "💡 The stack may not be deployed or no executions have run yet"
        fi
        ;;
        
    "test")
        echo "🧪 Testing ${ENVIRONMENT^} Environment"
        echo ""
        
        # Get API URL from stack outputs
        API_URL=$(aws cloudformation describe-stacks \
            --stack-name ${STACK_NAME} \
            --region ${REGION} \
            --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
            --output text 2>/dev/null)
        
        if [ -z "$API_URL" ]; then
            echo "❌ Could not retrieve API URL from stack outputs"
            echo "💡 Make sure the stack is deployed and has completed successfully"
            exit 1
        fi
        
        echo "API Endpoint: ${API_URL}"
        echo ""
        echo "Testing with sample payload..."
        
        # Test with a sample payload
        curl -X POST "${API_URL}" \
            -H "Content-Type: application/json" \
            -d '{
                "Bucket": "test-bucket", 
                "Key": "test-data.csv",
                "campaign_id": "test-campaign"
            }' \
            -w "\n\nHTTP Status: %{http_code}\nResponse Time: %{time_total}s\n" \
            -s
        ;;
        
    *)
        echo "❌ Invalid action: $ACTION"
        show_usage
        exit 1
        ;;
esac