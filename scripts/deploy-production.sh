#!/bin/bash

# Quick deployment script for PRODUCTION environment
# Usage: ./scripts/deploy-production.sh [openai-api-key]

set -e

OPENAI_API_KEY=${1}

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API Key is required"
    echo "Usage: ./scripts/deploy-production.sh [openai-api-key]"
    echo ""
    echo "Example:"
    echo "  ./scripts/deploy-production.sh \$OPENAI_API_KEY_PROD"
    echo ""
    echo "💡 Tip: Use separate API keys for production:"
    echo "  export OPENAI_API_KEY_STAGING=your-staging-api-key"
    echo "  export OPENAI_API_KEY_PROD=your-production-api-key"
    echo "  ./scripts/deploy-production.sh \$OPENAI_API_KEY_PROD"
    exit 1
fi

echo "🚀 Quick PRODUCTION Deployment"
echo ""

# Call the main deploy script
./scripts/deploy.sh production "$OPENAI_API_KEY"