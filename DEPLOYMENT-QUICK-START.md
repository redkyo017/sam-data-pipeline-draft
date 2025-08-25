# 🚀 Quick Deployment Reference

## Environment Setup

| Environment | Region | Memory | Timeout | Command |
|-------------|--------|--------|---------|---------|
| **Dev** | ap-southeast-1 | 256MB | 60s | `./scripts/deploy.sh dev` |
| **Staging** | ap-southeast-1 | 512MB | 120s | `./scripts/deploy.sh staging` |
| **Production** | ap-southeast-1 | 1024MB | 300s | `./scripts/deploy.sh production` |

## Common Commands

```bash
# Deploy to development
./scripts/deploy.sh dev

# Deploy to staging  
./scripts/deploy.sh staging

# Deploy to production (requires confirmation)
./scripts/deploy.sh production

# Delete environment
./scripts/cleanup.sh dev      # Development
./scripts/cleanup.sh staging  # Staging  
./scripts/cleanup.sh production  # Production (requires typing "DELETE")

# Check deployment status
aws cloudformation describe-stacks --stack-name sam-data-pipeline-dev --region ap-southeast-1
aws cloudformation describe-stacks --stack-name sam-data-pipeline-staging --region ap-southeast-1
aws cloudformation describe-stacks --stack-name sam-data-pipeline-production --region ap-southeast-1
```

## Environment Variables Setup

```bash
# Option 1: Use .env file (recommended)
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Then deploy (uses .env automatically)
./scripts/deploy.sh dev

# Option 2: Environment variables
export OPENAI_API_KEY="sk-your-key-here"
./scripts/deploy.sh staging $OPENAI_API_KEY

# Option 3: Different keys per environment
export OPENAI_API_KEY_DEV="sk-dev-key-here"
export OPENAI_API_KEY_STAGING="sk-staging-key-here"
export OPENAI_API_KEY_PROD="sk-production-key-here"

# Then deploy with specific keys
./scripts/deploy.sh dev $OPENAI_API_KEY_DEV
./scripts/deploy.sh staging $OPENAI_API_KEY_STAGING
./scripts/deploy.sh production $OPENAI_API_KEY_PROD
```

## Resource Configurations

| Setting | Dev | Staging | Production |
|---------|-----|---------|------------|
| Lambda Memory | 256 MB | 512 MB | 1024 MB |
| Lambda Timeout | 60s | 120s | 300s |
| Step Functions Concurrency | 100 | 500 | 1000 |
| Log Retention | 7 days | 14 days | 30 days |
| Region | ap-southeast-1 | ap-southeast-1 | ap-southeast-1 |
| API Stage | `dev` | `staging` | `production` |

## Troubleshooting

```bash
# Validate template
sam validate --region ap-southeast-1

# Check AWS credentials
aws sts get-caller-identity

# Manual deployment
sam build && sam deploy --config-env dev --parameter-overrides Environment=dev OpenAIApiKey=$OPENAI_API_KEY
```

📖 **Full Guide**: See [docs/DEPLOYMENT-GUIDE.md](docs/DEPLOYMENT-GUIDE.md) for complete documentation.