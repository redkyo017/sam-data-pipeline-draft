# Testing and Deployment Specification

## Overview
This specification defines testing strategies, deployment procedures, and quality assurance practices for the serverless data pipeline.

## Testing Strategy

### 1. Testing Pyramid Architecture

```
                    /\
                   /  \
                  /    \
                 /  E2E  \    ← End-to-End Tests (Few)
                /________\
               /          \
              /Integration \   ← Integration Tests (Some)  
             /______________\
            /                \
           /   Unit Tests     \  ← Unit Tests (Many)
          /____________________\
```

### 2. Unit Testing Standards

#### Lambda Function Unit Tests
```javascript
// test/validate-format.test.js
const { handler } = require('../src/index');

describe('ValidateRawValidFormatFunction', () => {
  const validEvent = {
    items: [{
      "First Name": "John",
      "Last Name": "Doe", 
      "Email": "john@example.com",
      "Phone": "555-0123"
      // ... other valid columns
    }]
  };
  
  test('should return valid for correctly formatted data', async () => {
    const result = await handler(validEvent, {});
    
    expect(result.isValidInputFormat).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      "First Name": "John",
      "Last Name": "Doe"
    });
  });
  
  test('should return invalid for malformed data', async () => {
    const invalidEvent = {
      items: [{
        "InvalidColumn": "value",
        "AnotherInvalid": "value"
      }]
    };
    
    const result = await handler(invalidEvent, {});
    expect(result.isValidInputFormat).toBe(false);
  });
  
  test('should handle empty input gracefully', async () => {
    const emptyEvent = { items: [] };
    const result = await handler(emptyEvent, {});
    expect(result.isValidInputFormat).toBe(false);
  });
});
```

#### Test Configuration (jest.config.js)
```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/functions'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### 3. Integration Testing

#### Step Functions Integration Tests
```javascript
// test/integration/step-function.test.js  
const AWS = require('aws-sdk');
const stepfunctions = new AWS.StepFunctions();

describe('Ingestion Pipeline Integration', () => {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;
  
  test('should process valid CSV data end-to-end', async () => {
    const input = {
      Bucket: process.env.TEST_BUCKET,
      Key: 'test-data/valid-contact-data.csv'
    };
    
    // Start execution
    const execution = await stepfunctions.startExecution({
      stateMachineArn,
      input: JSON.stringify(input),
      name: `test-${Date.now()}`
    }).promise();
    
    // Wait for completion (with timeout)
    let status = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (status === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
      
      const result = await stepfunctions.describeExecution({
        executionArn: execution.executionArn
      }).promise();
      
      status = result.status;
      attempts++;
    }
    
    expect(status).toBe('SUCCEEDED');
    
    // Verify output in S3
    const s3 = new AWS.S3();
    const objects = await s3.listObjectsV2({
      Bucket: process.env.OUTPUT_BUCKET,
      Prefix: 'processed/'
    }).promise();
    
    expect(objects.Contents.length).toBeGreaterThan(0);
  }, 300000); // 5 minute timeout
});
```

#### API Gateway Integration Tests
```javascript
// test/integration/api.test.js
const axios = require('axios');

describe('Ingestion API Integration', () => {
  const apiUrl = process.env.API_GATEWAY_URL;
  
  test('should trigger pipeline execution via API', async () => {
    const requestBody = {
      Bucket: process.env.TEST_BUCKET,
      Key: 'test-data/sample.csv'
    };
    
    const response = await axios.post(
      `${apiUrl}/pipelines/ingestion/executions`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('executionArn');
    expect(response.data.executionArn).toMatch(/^arn:aws:states/);
  });
  
  test('should handle invalid input gracefully', async () => {
    const invalidBody = { invalidField: 'value' };
    
    try {
      await axios.post(`${apiUrl}/pipelines/ingestion/executions`, invalidBody);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data).toHaveProperty('message');
    }
  });
});
```

### 4. Local Testing with SAM

#### SAM Local Configuration
```yaml
# samconfig.toml
version = 0.1
[default]
[default.local_invoke]
[default.local_invoke.parameters]
parameter_overrides = [
  "OpenAIApiKey=test-key",
  "InputBucketName=test-input-bucket", 
  "OutputBucketName=test-output-bucket"
]
```

#### Local Testing Commands
```bash
# Test individual function
sam local invoke ValidateRawValidFormatFunction \
  --event test/events/validation-event.json \
  --parameter-overrides OpenAIApiKey=test-key

# Test API Gateway locally  
sam local start-api \
  --parameter-overrides OpenAIApiKey=test-key

# Test Step Functions locally (requires Step Functions Local)
sam local start-lambda
```

#### Test Event Templates
```json
// test/events/validation-event.json
{
  "items": [
    {
      "First Name": "John",
      "Last Name": "Doe",
      "Email": "john.doe@example.com", 
      "Phone": "555-0123",
      "Company": "Acme Corp",
      "Title": "Software Engineer"
    }
  ]
}
```

### 5. Performance Testing

#### Load Testing with Artillery
```yaml
# artillery-config.yml
config:
  target: 'https://your-api-gateway-url'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300  
      arrivalRate: 50
      name: "Load test"

scenarios:
  - name: "Pipeline execution"
    flow:
      - post:
          url: "/pipelines/ingestion/executions"
          json:
            Bucket: "test-bucket"
            Key: "test-data/large-dataset.csv"
```

#### Memory and Performance Benchmarks
```javascript
// test/performance/memory-usage.test.js
describe('Memory Usage Tests', () => {
  test('should process large datasets within memory limits', async () => {
    const largeDataset = generateTestData(10000); // 10k records
    const startMemory = process.memoryUsage();
    
    const result = await handler({ items: largeDataset }, {});
    
    const endMemory = process.memoryUsage();
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
    
    // Should not exceed 200MB for 10k records
    expect(memoryUsed).toBeLessThan(200 * 1024 * 1024);
    expect(result).toBeDefined();
  });
});
```

### 6. Security Testing

#### Input Validation Tests
```javascript
describe('Security Tests', () => {
  test('should sanitize malicious input', async () => {
    const maliciousEvent = {
      items: [{
        "First Name": "<script>alert('xss')</script>",
        "Email": "'; DROP TABLE users; --",
        "Phone": "javascript:void(0)"
      }]
    };
    
    const result = await handler(maliciousEvent, {});
    
    // Verify malicious content is handled safely
    expect(result.items[0]['First Name']).not.toContain('<script>');
    expect(result.items[0]['Email']).not.toContain('DROP TABLE');
  });
  
  test('should handle oversized payloads', async () => {
    const oversizedData = 'x'.repeat(10 * 1024 * 1024); // 10MB string
    const largeEvent = {
      items: [{ "First Name": oversizedData }]
    };
    
    await expect(handler(largeEvent, {})).rejects.toThrow();
  });
});
```

## Deployment Strategy

### 1. Environment Management

#### Environment-Specific Configuration
```yaml
# dev environment
Parameters:
  Environment: dev
  OpenAIApiKey: !Ref DevOpenAIKey
  InputBucketName: sam-data-pipeline-dev-input
  OutputBucketName: sam-data-pipeline-dev-output

# prod environment  
Parameters:
  Environment: prod
  OpenAIApiKey: !Ref ProdOpenAIKey
  InputBucketName: sam-data-pipeline-prod-input
  OutputBucketName: sam-data-pipeline-prod-output
```

### 2. CI/CD Pipeline Configuration

#### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy SAM Data Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: |
          cd functions/nodejs-validate-raw-valid-format && npm ci
          cd ../nodejs-standardization && npm ci
          # ... other functions
          
      - name: Run unit tests
        run: |
          npm test
          
      - name: Run integration tests
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          npm run test:integration

  deploy-dev:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup SAM CLI
        uses: aws-actions/setup-sam@v2
        
      - name: Deploy to dev
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          OPENAI_API_KEY: ${{ secrets.DEV_OPENAI_API_KEY }}
        run: |
          sam build
          sam deploy \
            --stack-name sam-data-pipeline-dev \
            --parameter-overrides \
              Environment=dev \
              OpenAIApiKey=$OPENAI_API_KEY \
            --no-confirm-changeset

  deploy-prod:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.PROD_AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.PROD_AWS_SECRET_ACCESS_KEY }}
          OPENAI_API_KEY: ${{ secrets.PROD_OPENAI_API_KEY }}
        run: |
          sam build
          sam deploy \
            --stack-name sam-data-pipeline-prod \
            --parameter-overrides \
              Environment=prod \
              OpenAIApiKey=$OPENAI_API_KEY \
            --no-confirm-changeset
```

### 3. Deployment Script Best Practices

#### Enhanced Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

ENVIRONMENT=${1:-dev}
REGION=${2:-ap-southeast-1}
OPENAI_API_KEY=${3}
STACK_NAME="sam-data-pipeline-${ENVIRONMENT}"

# Validation
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API Key is required"
    exit 1
fi

# Pre-deployment checks
echo "🔍 Running pre-deployment checks..."

# Validate template
sam validate --region ${REGION}

# Run tests
echo "🧪 Running tests..."
npm test

# Security scan (optional)
if command -v checkov &> /dev/null; then
    echo "🔒 Running security scan..."
    checkov -f template.yaml
fi

# Build
echo "🔨 Building application..."
sam build

# Deploy
echo "🚀 Deploying to ${ENVIRONMENT}..."
sam deploy \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        Environment=${ENVIRONMENT} \
        OpenAIApiKey=${OPENAI_API_KEY} \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

# Post-deployment validation
echo "✅ Running post-deployment validation..."

# Get API endpoint
API_URL=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text)

# Health check
if [ ! -z "$API_URL" ]; then
    echo "🏥 Running health check on ${API_URL}"
    # Add health check logic here
fi

echo "🎉 Deployment completed successfully!"
```

### 4. Blue/Green Deployment Strategy

#### Canary Deployment Configuration
```yaml
# template.yaml - Production deployment
IngestionStateMachine:
  Type: AWS::Serverless::StateMachine
  Properties:
    # ... other properties
    AutoPublishAlias: live
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      Hooks:
        PreTraffic: !Ref PreTrafficHook
        PostTraffic: !Ref PostTrafficHook

PreTrafficHook:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: hooks/
    Handler: pre-traffic.handler
    Runtime: nodejs20.x

PostTrafficHook:
  Type: AWS::Serverless::Function  
  Properties:
    CodeUri: hooks/
    Handler: post-traffic.handler
    Runtime: nodejs20.x
```

### 5. Rollback Procedures

#### Automated Rollback Script
```bash
#!/bin/bash
# scripts/rollback.sh

ENVIRONMENT=${1:-dev}
REGION=${2:-ap-southeast-1}
STACK_NAME="sam-data-pipeline-${ENVIRONMENT}"

echo "⚠️  Initiating rollback for ${STACK_NAME}"

# Get current stack events to find the last successful deployment
aws cloudformation describe-stack-events \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'StackEvents[?ResourceStatus==`UPDATE_COMPLETE`][0].{Time:Timestamp,Status:ResourceStatus}' \
    --output table

# Cancel in-progress deployment if any
aws cloudformation cancel-update-stack \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    2>/dev/null || true

# Wait for cancellation
aws cloudformation wait stack-update-complete \
    --stack-name ${STACK_NAME} \
    --region ${REGION}

echo "✅ Rollback completed"
```

### 6. Monitoring and Validation

#### Post-Deployment Health Checks
```javascript
// scripts/health-check.js
const AWS = require('aws-sdk');
const axios = require('axios');

async function healthCheck() {
  const cloudformation = new AWS.CloudFormation();
  const stackName = process.env.STACK_NAME;
  
  try {
    // Get stack outputs
    const stack = await cloudformation.describeStacks({
      StackName: stackName
    }).promise();
    
    const outputs = stack.Stacks[0].Outputs.reduce((acc, output) => {
      acc[output.OutputKey] = output.OutputValue;
      return acc;
    }, {});
    
    // Test API Gateway endpoint
    const response = await axios.get(`${outputs.ApiUrl}/health`);
    console.log('✅ API Gateway health check passed');
    
    // Test Step Function
    const stepfunctions = new AWS.StepFunctions();
    await stepfunctions.listExecutions({
      stateMachineArn: outputs.StateMachineArn,
      maxResults: 1
    }).promise();
    console.log('✅ Step Functions health check passed');
    
    return true;
    
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

healthCheck().then(success => {
  process.exit(success ? 0 : 1);
});
```

### 7. Quality Gates

#### Pre-deployment Quality Checks
- Unit test coverage > 80%
- Integration tests pass
- Security scan (no high/critical vulnerabilities)
- Template validation passes
- Function memory/timeout limits validated

#### Post-deployment Quality Checks  
- All endpoints return 200 status
- Step Function executions complete successfully
- CloudWatch metrics show normal patterns
- No error spikes in logs
- Performance benchmarks met

### 8. Documentation Requirements

#### Deployment Documentation
- README with setup instructions
- Environment-specific configuration guide
- Troubleshooting guide for common deployment issues
- Architecture diagrams showing data flow
- API documentation for external integrations

#### Testing Documentation
- Test strategy and coverage requirements
- How to run tests locally
- Integration test setup and prerequisites  
- Performance testing procedures
- Security testing checklist