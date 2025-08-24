# Multi-Environment Deployment Guide

This guide provides a comprehensive approach to deploying your SAM Data Pipeline to both **staging** and **production** environments with complete separation and environment-specific configurations.

## 🏗️ Architecture Overview

Our deployment strategy implements:

- **Geographic Separation**: Different AWS regions for each environment
- **Resource Isolation**: Completely separate stacks and resources  
- **Environment-Specific Sizing**: Optimized configurations per environment
- **Automated Deployment**: Scripts for consistent, reliable deployments
- **Configuration Management**: Centralized environment configurations

### Environment Configuration

| Environment | Region | Stack Name | Lambda Memory | Timeout | Concurrency | Log Retention |
|------------|--------|------------|---------------|---------|-------------|---------------|
| **Staging** | us-east-1 | `sam-data-pipeline-staging` | 512 MB | 120s | 500 | 14 days |
| **Production** | us-west-2 | `sam-data-pipeline-production` | 1024 MB | 300s | 1000 | 30 days |

## 🚀 Quick Start

### 1. Prerequisites Setup

```bash
# Install required tools
brew install aws-sam-cli  # macOS
# OR follow: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Configure AWS credentials
aws configure
```

### 2. Deploy to Staging

```bash
# Quick staging deployment
./scripts/deploy-staging.sh $OPENAI_API_KEY
```

### 3. Deploy to Production

```bash
# Production deployment with confirmation
./scripts/deploy-production.sh $OPENAI_API_KEY_PROD
```

### 4. Environment Management

```bash
# Check environment status
./scripts/manage-environments.sh status staging

# View logs
./scripts/manage-environments.sh logs production

# Test API endpoints
./scripts/manage-environments.sh test staging
```

## 📁 File Structure

The deployment uses the following configuration files:

```
sam-data-pipeline/
├── samconfig.toml                 # Environment-specific SAM configurations
├── template.yaml                  # Main CloudFormation template with mappings
├── scripts/
│   ├── deploy.sh                 # Main deployment script
│   ├── deploy-staging.sh         # Quick staging deployment
│   ├── deploy-production.sh      # Quick production deployment
│   └── manage-environments.sh    # Environment management utilities
└── docs/
    └── DEPLOYMENT-GUIDE.md       # This guide
```

## ⚙️ Configuration Details

### Environment Mappings

The `template.yaml` includes environment-specific mappings:

```yaml
Mappings:
  EnvironmentMap:
    staging:
      LambdaMemorySize: 512
      LambdaTimeout: 120
      LogRetentionDays: 14
      StepFunctionsConcurrency: 500
    production:
      LambdaMemorySize: 1024
      LambdaTimeout: 300
      LogRetentionDays: 30
      StepFunctionsConcurrency: 1000
```

### SAM Configuration

The `samconfig.toml` defines environment-specific deployment parameters:

```toml
[staging.deploy.parameters]
stack_name = "sam-data-pipeline-staging"
region = "us-east-1"
confirm_changeset = false
parameter_overrides = [
    "Environment=staging",
    "InputBucketName=sam-data-pipeline-staging-input-bucket",
    "OutputBucketName=sam-data-pipeline-staging-output-bucket"
]

[production.deploy.parameters]
stack_name = "sam-data-pipeline-production"
region = "us-west-2"
confirm_changeset = true  # Requires manual confirmation
parameter_overrides = [
    "Environment=production",
    "InputBucketName=sam-data-pipeline-prod-input-bucket",
    "OutputBucketName=sam-data-pipeline-prod-output-bucket"
]
```

## 🛠️ Deployment Methods

### Method 1: Quick Deployment Scripts

**For Staging:**
```bash
./scripts/deploy-staging.sh $OPENAI_API_KEY
```

**For Production:**
```bash
./scripts/deploy-production.sh $OPENAI_API_KEY_PROD
```

### Method 2: Manual SAM Commands

**For Staging:**
```bash
sam build
sam deploy --config-env staging --parameter-overrides OpenAIApiKey=$OPENAI_API_KEY
```

**For Production:**
```bash
sam build
sam deploy --config-env production --parameter-overrides OpenAIApiKey=$OPENAI_API_KEY_PROD
```

### Method 3: Direct Deployment Script

```bash
# Custom parameters
./scripts/deploy.sh staging $OPENAI_API_KEY
./scripts/deploy.sh production $OPENAI_API_KEY_PROD
```

## 🔐 Security & Best Practices

### API Key Management

**Recommended approach:**
```bash
# Set environment variables
export OPENAI_API_KEY_STAGING="sk-staging-key-here"
export OPENAI_API_KEY_PROD="sk-production-key-here"

# Deploy with environment variables
./scripts/deploy-staging.sh $OPENAI_API_KEY_STAGING
./scripts/deploy-production.sh $OPENAI_API_KEY_PROD
```

### Production Safety Features

- **Manual Confirmation**: Production deployments require explicit confirmation
- **Different Regions**: Geographic separation reduces risk
- **Separate Resources**: No shared infrastructure between environments
- **Enhanced Monitoring**: Longer log retention in production

## 📊 Environment Management

### Check Environment Status

```bash
./scripts/manage-environments.sh status staging
./scripts/manage-environments.sh status production
```

### View Recent Logs

```bash
./scripts/manage-environments.sh logs staging
./scripts/manage-environments.sh logs production
```

### Test API Endpoints

```bash
./scripts/manage-environments.sh test staging
./scripts/manage-environments.sh test production
```

### Delete Environment (⚠️ Dangerous)

```bash
# This will delete ALL resources including data!
./scripts/manage-environments.sh delete staging
```

## 🧪 Testing Your Deployments

### 1. Verify Stack Deployment

```bash
# Check stack status
aws cloudformation describe-stacks --stack-name sam-data-pipeline-staging --region us-east-1

# Get stack outputs
aws cloudformation describe-stacks \
  --stack-name sam-data-pipeline-staging \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

### 2. Test API Endpoints

```bash
# Get API URL from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name sam-data-pipeline-staging \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# Test with sample data
curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{"Bucket": "your-input-bucket", "Key": "test.csv", "campaign_id": "test"}'
```

### 3. Monitor Execution

```bash
# List Step Functions executions
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:us-east-1:ACCOUNT:stateMachine:sam-data-pipeline-staging-IngestionStateMachine

# View CloudWatch logs
aws logs tail /aws/stepfunctions/sam-data-pipeline-staging-ingestion --region us-east-1
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy SAM Pipeline
on:
  push:
    branches: 
      - develop    # Trigger staging deployment
      - main       # Trigger production deployment

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/setup-sam@v2
      - name: Deploy to Staging
        run: ./scripts/deploy-staging.sh ${{ secrets.OPENAI_API_KEY_STAGING }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/setup-sam@v2
      - name: Deploy to Production
        run: ./scripts/deploy-production.sh ${{ secrets.OPENAI_API_KEY_PROD }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID_PROD }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY_PROD }}
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Template Validation Errors
```bash
# Validate template before deployment
sam validate --region us-east-1
```

#### 2. Permission Issues
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify required permissions
aws iam get-user
```

#### 3. Stack Already Exists
```bash
# If deployment fails due to existing stack
aws cloudformation describe-stacks --stack-name sam-data-pipeline-staging --region us-east-1
```

#### 4. OpenAI API Issues
```bash
# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer your-api-key"
```

### Deployment Rollback

If a deployment fails, SAM automatically rolls back. To manually rollback:

```bash
# For staging
aws cloudformation cancel-update-stack --stack-name sam-data-pipeline-staging --region us-east-1

# For production  
aws cloudformation cancel-update-stack --stack-name sam-data-pipeline-production --region us-west-2
```

## 🔧 Advanced Configuration

### Custom Environment Parameters

You can override any parameter during deployment:

```bash
sam deploy --config-env staging \
  --parameter-overrides \
    OpenAIApiKey=$OPENAI_API_KEY \
    InputBucketName=custom-staging-input \
    OutputBucketName=custom-staging-output
```

### VPC Configuration

To deploy functions in a VPC, add to `template.yaml`:

```yaml
Globals:
  Function:
    VpcConfig:
      SecurityGroupIds:
        - sg-12345678
      SubnetIds:
        - subnet-12345678
        - subnet-87654321
```

### Custom Domain Names

For production, consider adding custom domain names:

```yaml
# In template.yaml
IngestionApi:
  Type: AWS::Serverless::Api
  Properties:
    Domain:
      DomainName: api.yourcompany.com
      CertificateArn: arn:aws:acm:us-west-2:ACCOUNT:certificate/CERT-ID
```

## 📈 Monitoring & Observability

### CloudWatch Dashboards

The deployment includes:
- Lambda function metrics
- Step Functions execution metrics  
- API Gateway performance metrics
- Error tracking and dead letter queues

### Alarms and Notifications

Consider adding CloudWatch alarms for:
- Lambda function errors
- Step Functions failed executions
- API Gateway 4xx/5xx errors
- SQS dead letter queue messages

### Cost Optimization

Monitor costs by:
- Setting up billing alerts
- Using AWS Cost Explorer
- Implementing resource tagging
- Regular environment cleanup

## 🎯 Next Steps

After successful deployment:

1. **Set up monitoring dashboards**
2. **Configure automated testing**
3. **Implement log aggregation**
4. **Create runbooks for incident response**
5. **Set up cost monitoring**
6. **Document operational procedures**

---

## 📞 Support

For deployment issues:
1. Check the troubleshooting section above
2. Review CloudFormation events in AWS Console
3. Check CloudWatch logs for detailed error messages
4. Validate template with `sam validate`

**Remember**: Always test changes in staging before deploying to production! 🛡️