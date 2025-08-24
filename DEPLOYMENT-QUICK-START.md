# 🚀 Quick Deployment Reference

## Environment Setup

| Environment | Region | Command |
|-------------|--------|---------|
| **Staging** | us-east-1 | `./scripts/deploy-staging.sh $OPENAI_API_KEY` |
| **Production** | us-west-2 | `./scripts/deploy-production.sh $OPENAI_API_KEY_PROD` |

## Common Commands

```bash
# Deploy to staging (quick)
./scripts/deploy-staging.sh $OPENAI_API_KEY

# Deploy to production (with confirmation)
./scripts/deploy-production.sh $OPENAI_API_KEY_PROD

# Check status
./scripts/manage-environments.sh status staging
./scripts/manage-environments.sh status production

# View logs
./scripts/manage-environments.sh logs staging

# Test API
./scripts/manage-environments.sh test staging

# Delete environment (⚠️ destructive)
./scripts/manage-environments.sh delete staging
```

## Environment Variables Setup

```bash
# Recommended setup
export OPENAI_API_KEY_STAGING="sk-staging-key-here"
export OPENAI_API_KEY_PROD="sk-production-key-here"

# Then deploy
./scripts/deploy-staging.sh $OPENAI_API_KEY_STAGING
./scripts/deploy-production.sh $OPENAI_API_KEY_PROD
```

## Resource Configurations

| Setting | Staging | Production |
|---------|---------|------------|
| Lambda Memory | 512 MB | 1024 MB |
| Lambda Timeout | 120s | 300s |
| Step Functions Concurrency | 500 | 1000 |
| Log Retention | 14 days | 30 days |
| Region | us-east-1 | us-west-2 |

## Troubleshooting

```bash
# Validate template
sam validate --region us-east-1

# Check AWS credentials
aws sts get-caller-identity

# Manual deployment
sam build && sam deploy --config-env staging --parameter-overrides OpenAIApiKey=$OPENAI_API_KEY
```

📖 **Full Guide**: See [docs/DEPLOYMENT-GUIDE.md](docs/DEPLOYMENT-GUIDE.md) for complete documentation.