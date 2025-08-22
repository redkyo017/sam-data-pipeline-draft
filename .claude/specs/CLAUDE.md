# Claude Code Steering Instructions

## Project Context
This is a serverless data processing pipeline built with AWS SAM that ingests CSV data, validates formats, standardizes data using OpenAI, and outputs processed results. The architecture uses Step Functions for orchestration, Lambda functions for processing, and S3 for storage.

## Core Development Principles

### 1. Always Reference Specifications
Before implementing any feature or fix, consult the relevant specification files:
- **Architecture decisions**: `aws-sam-architecture.md`
- **Data processing logic**: `data-processing-patterns.md` 
- **Error handling**: `error-handling-logging.md`
- **Testing/deployment**: `testing-deployment.md`

### 2. Follow Established Patterns
- Use existing naming conventions for functions, resources, and variables
- Implement error handling with graceful degradation and DLQ patterns
- Follow the distributed map processing architecture for data workflows
- Maintain structured logging with request correlation IDs

### 3. Prioritize Reliability
- Always include Dead Letter Queue configuration for Lambda functions
- Return empty arrays instead of throwing errors in processing functions
- Implement proper retry logic and exponential backoff for external APIs
- Use X-Ray tracing for distributed request tracking

### 4. Security First
- Never hardcode API keys or sensitive information
- Use environment variables for configuration
- Validate and sanitize all input data
- Follow least privilege principle for IAM roles

## Development Workflow

### When Adding New Lambda Functions:
1. Follow the function template pattern from `aws-sam-architecture.md`
2. Include proper error handling from `error-handling-logging.md`
3. Add Dead Letter Queue configuration
4. Implement structured logging with correlation IDs
5. Add unit tests following patterns in `testing-deployment.md`

### When Modifying Data Processing:
1. Reference data schemas in `data-processing-patterns.md`
2. Maintain backward compatibility with existing data formats
3. Test with both valid and invalid data scenarios
4. Ensure OpenAI integration follows established prompt patterns
5. Validate memory and timeout configurations

### When Working with Step Functions:
1. Use the distributed map pattern for parallel processing
2. Implement choice states for conditional logic
3. Include proper error handling with retry and catch blocks
4. Maintain result path consistency for data flow
5. Set appropriate concurrency and batch size limits

## Code Quality Standards

### Logging Requirements:
```javascript
// Always include request correlation
const requestId = context.awsRequestId;

// Use structured logging
console.log(`[${requestId}] Processing started`, {
  itemCount: items.length,
  timestamp: new Date().toISOString()
});

// Log errors with full context
console.error(`[${requestId}] Processing failed`, {
  error: error.message,
  stack: error.stack,
  input: sanitizedInput
});
```

### Error Handling Pattern:
```javascript
try {
  // Processing logic
  const result = await processData(input);
  return result || [];
} catch (error) {
  console.error(`Processing failed: ${error.message}`);
  // Return empty array to continue pipeline
  return [];
}
```

### Environment Validation:
```javascript
// Always validate required configuration
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable not set');
}
```

## Testing Requirements

### Before Any Code Changes:
- Run unit tests locally: `npm test`
- Validate SAM template: `sam validate`
- Test functions individually: `sam local invoke`

### For New Features:
- Add unit tests with >80% coverage
- Include integration tests for Step Function workflows
- Test error scenarios and edge cases
- Validate performance with realistic data volumes

## Deployment Standards

### Always Use:
- Environment-specific configuration
- Parameter overrides for secrets
- CloudFormation stack naming conventions
- Post-deployment health checks

### Never Do:
- Deploy without running tests
- Hardcode environment-specific values
- Skip security scans
- Deploy directly to production without staging validation

## AI Integration Guidelines

### OpenAI Standardization Function:
- Use structured prompts for consistent results
- Validate JSON responses before processing
- Implement proper error handling for API failures
- Set appropriate temperature (0.1) for deterministic results
- Include retry logic with exponential backoff

### Data Quality Rules:
- Remove emoji characters from text fields
- Standardize name capitalization
- Validate email formats
- Normalize phone number formats
- Extract valid LinkedIn URLs

## Common Commands

### Local Development:
```bash
# Test individual function
sam local invoke FunctionName --event test/events/sample.json

# Start API locally  
sam local start-api

# Run tests
npm test

# Deploy to dev
./scripts/deploy.sh dev ap-southeast-1 $OPENAI_API_KEY
```

### Debugging:
```bash
# View CloudWatch logs
aws logs tail /aws/lambda/function-name --follow

# Check Step Function executions
aws stepfunctions list-executions --state-machine-arn arn:aws:states:...

# Monitor DLQ messages
aws sqs receive-message --queue-url https://sqs...
```

## Performance Considerations

### Memory and Timeout Settings:
- Validation functions: 256MB, 60s timeout
- Standardization (OpenAI): 512MB, 300s timeout  
- Merge operations: 512MB, 300s timeout
- Simple mapping: 256MB, 60s timeout

### Concurrency Settings:
- Distributed map: MaxConcurrency 1000
- Item batching: 15 items per batch
- Monitor memory usage and adjust accordingly

## Troubleshooting Guide

### Common Issues:
1. **OpenAI API failures**: Check API key, validate prompts, implement retries
2. **Memory errors**: Increase function memory or optimize data processing
3. **Timeout issues**: Review processing logic, increase timeout, or split into smaller batches
4. **DLQ messages**: Review error logs, fix root cause, replay messages

### Monitoring:
- Check CloudWatch metrics for error rates
- Review X-Ray traces for performance bottlenecks
- Monitor DLQ message counts
- Validate S3 output file generation

## Remember:
- **Specifications are authoritative** - always reference them
- **Error handling is critical** - never let failures break the pipeline
- **Testing is mandatory** - no code ships without tests
- **Security is paramount** - protect sensitive data and API keys
- **Documentation matters** - maintain clear, accurate specifications