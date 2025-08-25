#!/bin/bash

# Quick deployment script for STAGING environment
# Usage: ./scripts/deploy-staging.sh [openai-api-key]
# 
# Prerequisites:
# - For enrichment pipeline: Set up Parameter Store keys (see docs/ENRICHMENT-SETUP.md)

set -e

OPENAI_API_KEY=${1}

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API Key is required"
    echo "Usage: ./scripts/deploy-staging.sh [openai-api-key]"
    echo ""
    echo "Example:"
    echo "  ./scripts/deploy-staging.sh \$OPENAI_API_KEY"
    echo ""
    echo "💡 Tip: Set your API key as environment variable:"
    echo "  export OPENAI_API_KEY=your-api-key-here"
    echo "  ./scripts/deploy-staging.sh \$OPENAI_API_KEY"
    exit 1
fi

echo "🚀 Quick STAGING Deployment"
echo ""

# Call the main deploy script
./scripts/deploy.sh staging "$OPENAI_API_KEY"