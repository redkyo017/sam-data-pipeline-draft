# SAM Data Pipeline Setup Guide

A comprehensive setup guide for deploying and configuring your serverless data processing pipeline with AWS SAM. This pipeline features intelligent "spec steering" - automatically guiding data through validation, standardization, and processing workflows.

## Prerequisites

### Required Tools

1. **AWS CLI** (v2.0 or later)
   ```bash
   # Install AWS CLI
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   
   # Configure with your credentials
   aws configure
   ```

2. **AWS SAM CLI** (v1.70.0 or later)
   ```bash
   # macOS
   brew install aws-sam-cli
   
   # Linux/Windows - see https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
   ```

3. **Node.js** (v20.x)
   ```bash
   # Install Node.js 20.x
   # macOS
   brew install node@20
   
   # Or use nvm
   nvm install 20
   nvm use 20
   ```

4. **Docker** (for local testing)
   - Install Docker Desktop from https://docker.com

5. **OpenAI API Key**
   - Get your API key from https://platform.openai.com/api-keys

### AWS Credentials & Permissions

Configure your AWS credentials with appropriate permissions:

```bash
aws configure
AWS Access Key ID [None]: YOUR_ACCESS_KEY
AWS Secret Access Key [None]: YOUR_SECRET_KEY
Default region name [None]: ap-southeast-1
Default output format [None]: json
```

Required AWS permissions:
- Lambda (create, update, invoke functions)
- S3 (create buckets, read/write objects)
- Step Functions (create, execute state machines)
- API Gateway (create, deploy APIs)
- IAM (create roles and policies)
- CloudFormation (create, update stacks)
- SQS (create queues for dead letter handling)
- CloudWatch Logs (create log groups)

## Project Structure

Your SAM project is now organized following best practices:

```
sam-data-pipeline/
├── functions/                          # Lambda function source code
│   ├── nodejs-validate-raw-valid-format/    # CSV format validation
│   ├── nodejs-standardization/              # OpenAI data standardization  
│   ├── nodejs-mapping-raw-valid-input/      # Schema mapping
│   ├── nodejs-process-standardized-data/    # Final data processing
│   └── nodejs-merge-csv-data/               # Result aggregation
├── statemachine/                       # Step Functions definitions
│   └── ingestion_pipeline.asl.json    # Main pipeline state machine
├── events/                             # Test event payloads
├── tests/                              # Unit and integration tests
│   ├── unit/                           # Unit tests for functions
│   └── integration/                    # End-to-end tests
├── scripts/                            # Deployment and utility scripts
├── docs/                               # Additional documentation
├── template.yaml                       # SAM template (Infrastructure as Code)
├── .env.example                        # Environment variables template
├── .gitignore                          # Git ignore patterns
└── samconfig.toml                      # SAM configuration file
```

## Setup Steps

### 1. Environment Configuration

Copy the environment template and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` file:
```env
# Required: OpenAI API Key for data standardization
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Custom bucket names (will use defaults if not specified)
INPUT_BUCKET_NAME=my-custom-input-bucket
OUTPUT_BUCKET_NAME=my-custom-output-bucket
```

### 2. Install Dependencies

Install dependencies for the standardization function (only function with external dependencies):

```bash
cd functions/nodejs-standardization/src
npm install
cd ../../..
```

### 3. Build and Deploy

#### Option A: Quick Deployment Script (Recommended)

```bash
./scripts/deploy.sh dev ap-southeast-1
```

This automated script will:
- Validate the SAM template
- Build all functions
- Deploy with environment-specific configuration
- Display stack outputs

#### Option B: Guided Deployment (First time setup)

```bash
sam build
sam deploy --guided
```

You'll be prompted for:
- Stack name (e.g., `sam-data-pipeline-dev`)
- AWS Region (e.g., `ap-southeast-1`)
- Parameters (OpenAI API key, bucket names)
- Confirmation for resource creation

#### Option C: Manual Deployment

```bash
sam build
sam deploy \
  --stack-name sam-data-pipeline-dev \
  --region ap-southeast-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    OpenAIApiKey=your_openai_key \
    InputBucketName=your-input-bucket \
    OutputBucketName=your-output-bucket
```

### 4. Verify Deployment

After deployment, verify your resources:

```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks --stack-name sam-data-pipeline-dev

# List all created resources
aws cloudformation list-stack-resources --stack-name sam-data-pipeline-dev

# Get stack outputs (API URL, bucket names, etc.)
aws cloudformation describe-stacks \
  --stack-name sam-data-pipeline-dev \
  --query 'Stacks[0].Outputs' \
  --output table

# Delete CloudFormation stack 
aws cloudformation delete-stack --stack-name sam-data-pipeline-dev --region ap-southeast-1

# wait for the stack deletion to complete:
aws cloudformation wait stack-delete-complete --stack-name sam-data-pipeline-dev --region ap-southeast-1
```

## Local Development & Testing

### Testing Functions Locally

Test individual Lambda functions:

```bash
# Test validation function with sample event
sam local invoke ValidateRawValidFormatFunction -e events/test-event.json

# Test with debugging enabled
sam local invoke ValidateRawValidFormatFunction -e events/test-event.json --debug

# Test standardization function
sam local invoke StandardizationFunction -e events/test-event.json

# Start Lambda runtime for all functions
sam local start-lambda
```

### Testing Step Functions Locally

Start local Step Functions endpoint:

```bash
# Start Step Functions Local (requires Docker)
sam local start-stepfunctions

# In another terminal, execute state machine
aws stepfunctions start-execution \
  --endpoint http://localhost:8083 \
  --state-machine-arn "arn:aws:states:ap-southeast-1:123456789012:stateMachine:IngestionStateMachine" \
  --input '{"Bucket": "test-bucket", "Key": "test.csv"}'
```

### Testing API Gateway Locally

Start local API Gateway:

```bash
# Start API Gateway locally
sam local start-api --port 3000

# Test endpoint
curl -X POST http://localhost:3000/pipelines/ingestion/executions \
  -H "Content-Type: application/json" \
  -d '{"Bucket": "test-bucket", "Key": "test.csv"}'
```

## Configuration Management

### Environment-Specific Configuration

Create environment-specific SAM configuration:

```toml
# samconfig.toml
[default]
[default.deploy.parameters]
stack_name = "sam-data-pipeline-dev"
region = "ap-southeast-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "OpenAIApiKey=dev_key_here"

[prod]
[prod.deploy.parameters]
stack_name = "sam-data-pipeline-prod"
region = "ap-southeast-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "OpenAIApiKey=prod_key_here InputBucketName=prod-input-bucket OutputBucketName=prod-output-bucket"
```

Deploy to specific environment:
```bash
sam deploy --config-env prod
```

### Template Parameters

Key parameters you can customize:

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `OpenAIApiKey` | OpenAI API key for standardization | None | Yes |
| `InputBucketName` | Input S3 bucket name | `sam-data-pipeline-input-bucket` | No |
| `OutputBucketName` | Output S3 bucket name | `sam-data-pipeline-output-bucket` | No |

## Using the Data Pipeline

### 1. Supported Data Formats

The pipeline intelligently handles two CSV formats:

**Standard Format** (validated directly, faster processing):
```csv
Org,Company,First Name,Last Name,Title,Organization Name (Parent),Phone,Email,Fax,LinkedIn,Address 1,Address 2,City,State,Zip,Country
Acme Corp,Acme Corp,John,Doe,Manager,Acme Holdings,555-1234,john@acme.com,,linkedin.com/in/johndoe,123 Main St,,Anytown,CA,12345,USA
```

**Non-Standard Format** (standardized via OpenAI, flexible field names):
```csv
full_name,company_name,email_address,phone_number,job_title,address
John Doe,Acme Corp,john@acme.com,555-1234,Manager,123 Main St Anytown CA 12345
```

### 2. Upload Data

Upload your CSV to the input S3 bucket:

```bash
# Get your input bucket name from stack outputs
aws s3 cp your-data.csv s3://your-input-bucket/data/input.csv
```

### 3. Trigger Processing

Two ways to trigger the pipeline:

**Via API Gateway (Recommended):**
```bash
# Get API URL from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name sam-data-pipeline-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{
    "Bucket": "your-input-bucket", 
    "Key": "data/input.csv"
  }'
```

**Direct Step Functions execution:**
```bash
# Get state machine ARN from stack outputs
STATE_MACHINE_ARN=$(aws cloudformation describe-stacks \
  --stack-name sam-data-pipeline-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`StateMachineArn`].OutputValue' \
  --output text)

aws stepfunctions start-execution \
  --state-machine-arn $STATE_MACHINE_ARN \
  --input '{"Bucket": "your-input-bucket", "Key": "data/input.csv"}'
```

### 4. Monitor Execution

Monitor pipeline execution:

```bash
# List recent executions
aws stepfunctions list-executions --state-machine-arn $STATE_MACHINE_ARN

# Get execution details
aws stepfunctions describe-execution --execution-arn your-execution-arn

# View execution history
aws stepfunctions get-execution-history --execution-arn your-execution-arn
```

**AWS Console Monitoring:**
1. **Step Functions Console**: Visual execution flow and status
2. **CloudWatch Logs**: Detailed function execution logs
3. **S3 Console**: Verify output files in output bucket  
4. **SQS Console**: Check dead letter queue for failed messages

## Architecture Overview

### Lambda Functions

1. **ValidateRawValidFormatFunction** - Validates CSV format against expected schema
2. **StandardizationFunction** - Uses OpenAI API to normalize non-standard data
3. **MappingRawValidInputFunction** - Maps validated data to target output format
4. **ProcessStandardizedDataFunction** - Final processing and validation
5. **MergeCsvDataFunction** - Aggregates results from distributed processing

### Step Functions Workflow

The pipeline orchestrates the following intelligent workflow:

1. **Parse Input** - Extract S3 bucket/key from API request
2. **S3 CSV File Ingestion** - Distributed Map processing with CSV reading
3. **Format Validation** - Check if data matches standard format
4. **Conditional Processing**:
   - **Standard Format**: Direct mapping and processing
   - **Non-Standard Format**: OpenAI standardization, then processing
5. **Merge Results** - Combine all processed batches

### Key Features

- **Distributed Processing**: Handles large datasets with parallel execution
- **Intelligent Routing**: Automatically chooses optimal processing path
- **Error Handling**: Systemic failure detection with progress tracking and dead letter queues
- **Monitoring**: CloudWatch logs, X-Ray tracing, and real-time SQS progress queues
- **Security**: IAM least privilege and encryption

## Monitoring & Troubleshooting

### CloudWatch Integration

- **Function Logs**: `/aws/lambda/[function-name]` log groups
- **Step Functions Logs**: `/aws/stepfunctions/[stack-name]-ingestion` log group
- **X-Ray Tracing**: End-to-end request tracing enabled
- **Progress Queue**: Real-time batch progress tracking via SQS
- **Dead Letter Queue**: Critical system failures in SQS for analysis

### Progress Monitoring

Monitor pipeline execution in real-time:

```bash
# Monitor progress queue for batch updates
aws sqs receive-message \
  --queue-url https://sqs.ap-southeast-1.amazonaws.com/[account]/progress-queue \
  --wait-time-seconds 20

# Check for system failures
aws sqs receive-message \
  --queue-url https://sqs.ap-southeast-1.amazonaws.com/[account]/dead-letter-queue \
  --wait-time-seconds 5
```

### Common Issues & Solutions

1. **"Template format error"**
   ```bash
   # Validate template
   sam validate
   ```

2. **"OpenAI API errors"**
   - **Systemic failures** (pipeline stops): Invalid API key, authentication errors, missing model
   - **Non-systemic failures** (pipeline continues): Individual record processing errors
   
   ```bash
   # Test API key
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer your-api-key"
     
   # Check failure queue for systemic issues
   aws sqs receive-message --queue-url [dead-letter-queue-url]
   
   # Check progress queue for partial results
   aws sqs receive-message --queue-url [progress-queue-url]
   ```

3. **"Function timeout"**
   - Check CloudWatch logs for performance issues
   - Consider increasing memory allocation in template.yaml

4. **"S3 access denied"**
   - Verify bucket names match deployment parameters
   - Check IAM permissions in CloudFormation console

### Performance Optimization

- **Memory Allocation**: Functions configured with optimized memory settings
- **Timeout Settings**: Appropriate timeouts for each function type
- **Batch Processing**: Configurable batch sizes for large datasets
- **Concurrent Execution**: Up to 1000 parallel map executions

## Security & Best Practices

### Security Features

- **IAM Least Privilege**: Functions have minimal required permissions
- **Environment Variables**: Sensitive data encrypted at rest
- **API Security**: CORS configured for secure access
- **Network Security**: Can be configured with VPC for additional isolation

### Best Practices Implemented

- **Error Handling**: Comprehensive error handling and retry logic
- **Monitoring**: CloudWatch logs and X-Ray tracing enabled
- **Resource Optimization**: Memory and timeout optimized per function
- **Cost Management**: Pay-per-use serverless architecture

## Advanced Configuration

### Custom VPC Deployment

Add VPC configuration to template.yaml:
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

### CI/CD Integration

Example GitHub Actions workflow:
```yaml
name: Deploy SAM Pipeline
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: aws-actions/setup-sam@v1
      - name: Deploy
        run: ./scripts/deploy.sh prod ap-southeast-1
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Cleanup

To remove all resources:

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name sam-data-pipeline-dev

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete --stack-name sam-data-pipeline-dev

# Remove S3 buckets if needed (be careful with production data!)
aws s3 rb s3://your-input-bucket --force
aws s3 rb s3://your-output-bucket --force
```

## Next Steps

After successful deployment:

1. **Add Monitoring**: Set up CloudWatch alarms and dashboards
2. **Write Tests**: Create unit and integration tests
3. **Set up CI/CD**: Implement automated deployment pipeline
4. **Performance Tuning**: Monitor and optimize configurations
5. **Security Review**: Audit IAM permissions and enable additional security features
6. **Documentation**: Create user guides and API documentation

## Support & Resources

- **AWS SAM Documentation**: https://docs.aws.amazon.com/serverless-application-model/
- **Step Functions Guide**: https://docs.aws.amazon.com/step-functions/
- **OpenAI API Docs**: https://platform.openai.com/docs/
- **Lambda Best Practices**: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html

Your SAM data pipeline with spec steering is now ready for intelligent data processing! 🚀