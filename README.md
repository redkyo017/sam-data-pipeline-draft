# SAM Data Processing Pipeline

A serverless data processing pipeline built with AWS SAM (Serverless Application Model) that ingests, validates, standardizes, and processes CSV data using AWS Lambda, Step Functions, S3, and OpenAI integration.

## 🏗️ Architecture

The pipeline consists of:

- **5 Lambda Functions** for data processing stages
- **1 Step Functions State Machine** for orchestration  
- **2 S3 Buckets** for input/output storage
- **1 API Gateway** endpoint for triggering executions
- **1 SQS Dead Letter Queue** for error handling

### Data Flow

1. **Input Validation** - Validates CSV format against expected schema
2. **Data Standardization** - Uses OpenAI to normalize inconsistent data
3. **Schema Mapping** - Maps validated data to target format
4. **Data Processing** - Final processing and storage
5. **Data Merging** - Aggregates results from distributed processing

## 🚀 Quick Start

### Prerequisites

- AWS CLI configured with appropriate permissions
- AWS SAM CLI installed
- Node.js 20.x runtime
- OpenAI API key

### Setup

1. **Clone and configure environment:**
   ```bash
   cp .env.example .env
   # Add your OpenAI API key to .env file
   ```

2. **Deploy the application:**
   ```bash
   # Deploy to development environment
   ./scripts/deploy.sh dev
   
   # Deploy to staging environment  
   ./scripts/deploy.sh staging
   
   # Deploy to production environment
   ./scripts/deploy.sh production
   ```
   
   Or manually:
   ```bash
   sam build
   sam deploy --config-env dev  # or staging/production
   ```

3. **Test the pipeline:**
   ```bash
   # Upload test CSV to input bucket
   aws s3 cp sample-data.csv s3://your-input-bucket/
   
   # Or trigger via API Gateway
   curl -X POST https://your-api-id.execute-api.ap-southeast-1.amazonaws.com/dev/pipelines/ingestion/executions \
     -H "Content-Type: application/json" \
     -d '{"Bucket": "your-input-bucket", "Key": "sample-data.csv", "campaign_id": "test-campaign"}'
   ```

## 📁 Project Structure

```
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
├── scripts/                            # Deployment and utility scripts
├── docs/                               # Additional documentation
└── template.yaml                       # SAM template (Infrastructure as Code)
```

## 🛠️ Development

### Local Testing

```bash
# Test individual functions locally
sam local invoke ValidateRawValidFormatFunction -e events/test-event.json

# Start local Step Functions
sam local start-stepfunctions

# Start local API Gateway
sam local start-api
```

### Function Development

Each Lambda function follows this structure:
```
functions/function-name/
├── src/
│   └── index.js        # Main handler code
└── package.json        # Dependencies and metadata
```

### Building and Deployment

```bash
# Build all functions
sam build

# Deploy to specific environment
./scripts/deploy.sh dev    # or staging/production

# Validate template
sam validate
```

## 🌍 Multi-Environment Deployment

This project supports deployment to multiple environments with different resource configurations:

### Environment Tiers

| Environment | Memory | Timeout | Log Retention | Concurrency | Use Case |
|-------------|--------|---------|---------------|-------------|----------|
| **dev** | 256MB | 60s | 7 days | 100 | Development and testing |
| **staging** | 512MB | 120s | 14 days | 500 | Pre-production validation |  
| **production** | 1024MB | 300s | 30 days | 1000 | Live production workloads |

### Deployment Commands

```bash
# Deploy to development
./scripts/deploy.sh dev

# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production (requires confirmation)
./scripts/deploy.sh production
```

### Environment Cleanup

```bash
# Clean up development environment
./scripts/cleanup.sh dev

# Clean up staging environment  
./scripts/cleanup.sh staging

# Clean up production (requires typing "DELETE")
./scripts/cleanup.sh production

# manual clean up examples:
aws cloudformation delete-stack --stack-name sam-data-pipeline-staging --region ap-southeast-1
aws cloudformation wait stack-delete-complete --stack-name sam-data-pipeline-staging --region ap-southeast-1
```

### Resource Naming

Resources are automatically named with environment suffixes:
- **Stack**: `sam-data-pipeline-{environment}`
- **Buckets**: `{basename}-{environment}-{account-id}`
- **API Stage**: `{environment}`

Example: Dev environment creates `data-pipeline-input-dev-123456789012`

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for data standardization | Yes |
| `OUTPUT_BUCKET` | S3 bucket for processed output | No (auto-configured) |
| `BUCKET_NAME` | S3 bucket for final storage | No (auto-configured) |

### Template Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `OpenAIApiKey` | OpenAI API key | Required |
| `Environment` | Deployment environment | `dev` |
| `InputBucketBaseName` | Base name for input S3 bucket | `data-pipeline-input` |
| `OutputBucketBaseName` | Base name for output S3 bucket | `data-pipeline-output` |

## 📊 Monitoring

- **CloudWatch Logs**: Function execution logs (retention varies by environment)
- **X-Ray Tracing**: Distributed tracing enabled for all functions
- **Dead Letter Queue**: Failed executions sent to SQS for analysis
- **Step Functions Console**: Visual execution monitoring

## 🔐 Security

- **IAM Least Privilege**: Functions have minimal required permissions
- **API CORS**: Configured for secure cross-origin requests  
- **Environment Variables**: Sensitive data encrypted at rest
- **VPC**: Can be configured for additional network isolation

## 📚 API Reference

### Trigger Pipeline Execution

**POST** `/pipelines/ingestion/executions`

```json
{
  "Bucket": "input-bucket-name",
  "Key": "path/to/data.csv",
  "campaign_id": "your-campaign-id"
}
```

**Response:**
```json
{
  "executionArn": "arn:aws:states:...",
  "startDate": "2024-01-15T10:30:00.000Z"
}
```

## 🤝 Contributing

1. Create feature branch from `main`
2. Make changes and add tests
3. Run `sam validate` and `sam build`
4. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

1. **Function timeout**: Increase timeout in `template.yaml`
2. **Memory issues**: Increase MemorySize for data-heavy functions
3. **OpenAI API errors**: Check API key and quotas
4. **S3 permissions**: Verify bucket policies and IAM roles

### Getting Help

- Check CloudWatch Logs for detailed error messages
- Review Step Functions execution history
- Monitor SQS Dead Letter Queue for failed messages