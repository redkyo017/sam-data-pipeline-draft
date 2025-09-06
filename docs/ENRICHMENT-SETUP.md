# Enrichment Pipeline Setup Guide

This guide provides comprehensive instructions for setting up and configuring the contact enrichment pipeline with RocketReach and Apollo.io API integrations.

## 🔧 Overview

The enrichment pipeline processes contact data by calling external enrichment APIs to gather additional email addresses and phone numbers. The pipeline uses AWS Parameter Store to securely manage API credentials and supports multiple environments with proper isolation.

### Architecture Components

- **EnrichmentProcessorFunction**: Lambda function that calls RocketReach and Apollo.io APIs
- **EnrichmentMergerFunction**: Lambda function that merges individual enriched files
- **EnrichmentStateMachine**: Step Functions state machine orchestrating the workflow
- **Parameter Store**: Secure storage for API keys and credentials

## 🔐 Parameter Store Configuration

The enrichment pipeline requires API keys to be stored in AWS Systems Manager Parameter Store for secure access.

### Required Parameters

| Parameter Name | Description | Type | Example |
|----------------|-------------|------|---------|
| `/enrichment/rocketreach-api-key` | RocketReach API key | SecureString | `rr_live_12345abcdef` |
| `/enrichment/apollo-api-key` | Apollo.io API key | SecureString | `apollo_12345abcdef` |

### Setting Up Parameters

#### Method 1: AWS CLI (Recommended)

```bash
# Set RocketReach API key
aws ssm put-parameter \
  --name "/enrichment/rocketreach-api-key" \
  --description "RocketReach API key for contact enrichment" \
  --value "your-rocketreach-api-key-here" \
  --type "SecureString" \
  --region ap-southeast-1

# Set Apollo.io API key
aws ssm put-parameter \
  --name "/enrichment/apollo-api-key" \
  --description "Apollo.io API key for contact enrichment" \
  --value "your-apollo-api-key-here" \
  --type "SecureString" \
  --region ap-southeast-1
```

#### Method 2: AWS Console

1. Navigate to **Systems Manager** > **Parameter Store**
2. Click **Create parameter**
3. Set the parameter name: `/enrichment/rocketreach-api-key`
4. Select **SecureString** type
5. Enter your API key value
6. Add description: "RocketReach API key for contact enrichment"
7. Click **Create parameter**
8. Repeat for Apollo.io API key

### Environment-Specific Configuration

For different environments, parameters should be configured separately:

#### Development Environment
```bash
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "dev-key" --type "SecureString" --region ap-southeast-1
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "dev-key" --type "SecureString" --region ap-southeast-1
```

#### Staging Environment
```bash
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "staging-key" --type "SecureString" --region ap-southeast-1
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "staging-key" --type "SecureString" --region ap-southeast-1
```

#### Production Environment
```bash
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "prod-key" --type "SecureString" --region ap-southeast-1
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "prod-key" --type "SecureString" --region ap-southeast-1
```

## 🚀 API Key Setup

### Getting RocketReach API Key

1. Visit [RocketReach Developer Portal](https://rocketreach.co/api)
2. Sign up for an account or log in
3. Navigate to your API dashboard
4. Generate an API key
5. Note down the key format: `rr_live_xxxxxxxxxx`

### Getting Apollo.io API Key

1. Visit [Apollo.io API Documentation](https://apolloio.github.io/apollo-api-docs/)
2. Sign up for an account or log in
3. Go to Settings > API
4. Generate an API key
5. Note down the key format: `xxxxxxxxxx`

## 🧪 Testing Configuration

### Verify Parameter Store Setup

```bash
# Check if parameters exist
aws ssm get-parameter --name "/enrichment/rocketreach-api-key" --with-decryption --region ap-southeast-1
aws ssm get-parameter --name "/enrichment/apollo-api-key" --with-decryption --region ap-southeast-1

# List all enrichment parameters
aws ssm get-parameters-by-path --path "/enrichment" --recursive --region ap-southeast-1
```

### Test API Keys

#### Test RocketReach API
```bash
# Test RocketReach API connectivity
curl -X POST https://api.rocketreach.co/v2/person/search \
  -H "Api-Key: your-rocketreach-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe"}'
```

#### Test Apollo.io API
```bash
# Test Apollo.io API connectivity
curl -X POST https://api.apollo.io/v1/people/search \
  -H "Cache-Control: no-cache" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-apollo-api-key" \
  -d '{"first_name": "John", "last_name": "Doe"}'
```

### Test Enrichment Pipeline

Use the provided test event files to test the enrichment pipeline:

```bash
# Test enrichment pipeline with sample data
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:ap-southeast-1:ACCOUNT:stateMachine:sam-data-pipeline-dev-EnrichmentStateMachine \
  --input file://events/enrichment-api-gateway-event.json \
  --region ap-southeast-1
```

## 📊 Deployment Instructions

### Prerequisites

Ensure you have completed the Parameter Store configuration before deploying:

1. **Set up Parameter Store parameters** (see above)
2. **Have valid API keys** for both RocketReach and Apollo.io
3. **Configure AWS credentials** for your target environment

### Deploy Enrichment Pipeline

#### Method 1: Using Existing Deployment Scripts

```bash
# Deploy to development
./scripts/deploy.sh dev ap-southeast-1 $OPENAI_API_KEY $ROCKETREACH_API_KEY $APOLLO_API_KEY

# Deploy to staging
./scripts/deploy-staging.sh $OPENAI_API_KEY $ROCKETREACH_API_KEY $APOLLO_API_KEY

# Deploy to production
./scripts/deploy-production.sh $OPENAI_API_KEY $ROCKETREACH_API_KEY $APOLLO_API_KEY
```

#### Method 2: Manual SAM Deployment

```bash
# Build the application
sam build

# Deploy with parameter overrides
sam deploy --config-env dev \
  --parameter-overrides \
    OpenAIApiKey=$OPENAI_API_KEY \
    RocketReachApiKey=$ROCKETREACH_API_KEY \
    ApolloApiKey=$APOLLO_API_KEY
```

### Post-Deployment Verification

```bash
# Get enrichment API endpoint
aws cloudformation describe-stacks \
  --stack-name sam-data-pipeline-dev \
  --region ap-southeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`EnrichmentApiUrl`].OutputValue' \
  --output text

# Test the enrichment endpoint
curl -X POST $ENRICHMENT_API_URL \
  -H "Content-Type: application/json" \
  -d @events/enrichment-api-gateway-event.json
```

## 🔧 Configuration Examples

### Development Environment

```bash
# Set development API keys
export ROCKETREACH_DEV_KEY="rr_live_dev123456"
export APOLLO_DEV_KEY="apollo_dev123456"

# Configure Parameter Store
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "$ROCKETREACH_DEV_KEY" --type "SecureString" --overwrite
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "$APOLLO_DEV_KEY" --type "SecureString" --overwrite
```

### Staging Environment

```bash
# Set staging API keys  
export ROCKETREACH_STAGING_KEY="rr_live_staging123456"
export APOLLO_STAGING_KEY="apollo_staging123456"

# Configure Parameter Store
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "$ROCKETREACH_STAGING_KEY" --type "SecureString" --overwrite
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "$APOLLO_STAGING_KEY" --type "SecureString" --overwrite
```

### Production Environment

```bash
# Set production API keys (use strong keys)
export ROCKETREACH_PROD_KEY="rr_live_prod123456789"
export APOLLO_PROD_KEY="apollo_prod123456789"

# Configure Parameter Store
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "$ROCKETREACH_PROD_KEY" --type "SecureString" --overwrite
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "$APOLLO_PROD_KEY" --type "SecureString" --overwrite
```

## 🚨 Troubleshooting

**Note**: The enrichment pipeline maintains **graceful error handling** - vendor API failures (RocketReach, Apollo.io) are handled gracefully and continue processing. The pipeline does not implement systemic failure detection for vendor APIs, allowing partial enrichment results.

### Common Issues

#### 1. Parameter Not Found Error

```
Error: ParameterNotFound - Parameter /enrichment/rocketreach-api-key not found
```

**Solution:**
```bash
# Verify parameters exist
aws ssm describe-parameters --parameter-filters "Key=Name,Values=/enrichment/" --region ap-southeast-1

# Create missing parameters
aws ssm put-parameter --name "/enrichment/rocketreach-api-key" --value "your-key" --type "SecureString"
```

#### 2. Access Denied to Parameter Store

```
Error: AccessDeniedException - User is not authorized to perform ssm:GetParameter
```

**Solution:**
Ensure the Lambda execution role has proper permissions (already configured in template.yaml):
```yaml
- Statement:
    - Effect: Allow
      Action:
        - ssm:GetParameter
      Resource: 
        - !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/enrichment/rocketreach-api-key"
        - !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/enrichment/apollo-api-key"
```

#### 3. API Rate Limiting

```
Error: RocketReach API failed with status 429: Rate limit exceeded
```

**Solution:**
The pipeline includes automatic retry logic with exponential backoff. For persistent rate limiting:
- Check your API plan limits
- Consider upgrading your API plan
- Monitor CloudWatch logs for retry patterns

#### 4. Invalid API Key

```
Error: Apollo.io API failed with status 401: Invalid API key
```

**Solution:**
```bash
# Test API key manually
curl -X POST https://api.apollo.io/v1/people/search \
  -H "X-Api-Key: your-api-key" \
  -d '{"first_name": "test"}'

# Update Parameter Store with correct key
aws ssm put-parameter --name "/enrichment/apollo-api-key" --value "correct-key" --type "SecureString" --overwrite
```

### Monitoring and Debugging

#### View Enrichment Logs

```bash
# View Lambda function logs
aws logs tail /aws/lambda/sam-data-pipeline-dev-EnrichmentProcessorFunction --follow --region ap-southeast-1

# View Step Functions execution logs
aws logs tail /aws/stepfunctions/sam-data-pipeline-dev-enrichment --follow --region ap-southeast-1

# Monitor progress queue for real-time pipeline status
aws sqs receive-message \
  --queue-url https://sqs.ap-southeast-1.amazonaws.com/[account]/progress-queue \
  --wait-time-seconds 20

# Check dead letter queue for critical failures
aws sqs receive-message \
  --queue-url https://sqs.ap-southeast-1.amazonaws.com/[account]/dead-letter-queue \
  --wait-time-seconds 5
```

#### Check Enrichment Metrics

```bash
# Get recent Step Functions executions
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:ap-southeast-1:ACCOUNT:stateMachine:sam-data-pipeline-dev-EnrichmentStateMachine \
  --max-items 10

# Check dead letter queues
aws sqs get-queue-attributes \
  --queue-url https://sqs.ap-southeast-1.amazonaws.com/ACCOUNT/sam-data-pipeline-dev-processing-dlq \
  --attribute-names ApproximateNumberOfMessages
```

## 🛡️ Security Best Practices

### API Key Management

1. **Use SecureString**: Always store API keys as SecureString type in Parameter Store
2. **Principle of Least Privilege**: Lambda functions only have access to required parameters
3. **Regular Rotation**: Rotate API keys periodically
4. **Environment Separation**: Use different API keys for each environment
5. **Monitoring**: Monitor Parameter Store access in CloudTrail

### Production Recommendations

1. **Enable Parameter Store encryption**: Use customer-managed KMS keys for production
2. **Set up CloudWatch alarms**: Monitor failed API calls and parameter access
3. **Implement cost controls**: Monitor API usage to prevent unexpected charges
4. **Regular audits**: Review API key usage and access patterns

## 📈 Performance Optimization

### API Rate Limiting

The enrichment pipeline includes built-in rate limiting:
- **Exponential backoff**: Automatic retry with increasing delays
- **Circuit breaker pattern**: Prevents cascade failures
- **Concurrent request limiting**: Respects API rate limits

### Cost Optimization

- **Monitor API usage**: Track API calls to avoid unexpected charges
- **Optimize batch sizes**: Balance between performance and API costs
- **Cache results**: Consider implementing caching for frequently accessed contacts
- **Use appropriate instance sizes**: Configure Lambda memory based on workload

## 🎯 Next Steps

After successful setup:

1. **Test with sample data**: Use provided test files to validate functionality
2. **Set up monitoring**: Configure CloudWatch dashboards and alarms
3. **Implement data validation**: Add contact data quality checks
4. **Schedule regular maintenance**: Plan for API key rotation and monitoring
5. **Document operational procedures**: Create runbooks for common issues

---

## 📞 Support

For enrichment pipeline issues:

1. **Check Parameter Store**: Verify API keys are correctly configured
2. **Review CloudWatch logs**: Check Lambda function execution logs
3. **Test API connectivity**: Verify external API access
4. **Validate permissions**: Ensure proper IAM roles and policies
5. **Monitor rate limits**: Check for API throttling issues

**Remember**: Always test enrichment configuration in development before deploying to production! 🛡️