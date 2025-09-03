# Project Structure & Conventions

## Directory Organization

### Root Level Structure
```
├── functions/                          # Lambda function source code
├── statemachine/                       # Step Functions definitions
├── events/                             # Test event payloads
├── tests/                              # Unit and integration tests
├── scripts/                            # Deployment and utility scripts
├── docs/                               # Additional documentation
├── template.yaml                       # SAM template (Infrastructure as Code)
├── samconfig.toml                      # SAM deployment configurations
├── makefile                            # Build automation
└── README.md                           # Project documentation
```

### Function Organization
```
functions/
├── nodejs-validate-raw-valid-format/   # CSV/JSON format validation
├── nodejs-standardization/             # OpenAI data standardization  
├── nodejs-mapping-raw-valid-input/     # Schema mapping
├── nodejs-process-standardized-data/   # Final data processing
├── nodejs-merge-csv-data/              # Result aggregation
└── [future-pipeline-functions]/        # Additional pipeline functions
```

### State Machine Organization
```
statemachine/
├── ingestion_pipeline.asl.json         # Main ingestion pipeline
├── test/                               # State machine test definitions
└── [future-pipelines]/                 # Additional pipeline state machines
```

## Naming Conventions

### Resource Naming Patterns
- **Lambda Functions**: `{language}-{purpose}-{type}` (e.g., `nodejs-validate-raw-valid-format`)
- **S3 Buckets**: `{basename}-{environment}-{account-id}` (e.g., `data-pipeline-input-dev-123456789012`)
- **Stack Names**: `sam-data-pipeline-{environment}` (e.g., `sam-data-pipeline-production`)
- **API Stages**: `{environment}` (e.g., `dev`, `staging`, `production`)

### Function Structure Pattern
```
functions/function-name/
├── src/
│   ├── index.js/.mjs                   # Main handler code
│   └── [additional-modules].js/.mjs    # Supporting modules
└── package.json                        # Dependencies and metadata
```

### Code Naming
- **Files**: Use kebab-case for directories and files
- **Functions**: Use camelCase for JavaScript functions
- **Variables**: Use camelCase for local variables
- **Constants**: Use UPPER_SNAKE_CASE for constants
- **Environment Variables**: Use UPPER_SNAKE_CASE

## File Organization Patterns

### Lambda Function Standards
```javascript
// Standard handler pattern
export const handler = async (event, context) => {
    // Function implementation
};
```

### Package.json Structure
```json
{
  "name": "function-name",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    // Production dependencies only
  }
}
```

### Environment Configuration
- **Development**: Optimized for rapid iteration and debugging
- **Staging**: Production-like for integration testing
- **Production**: Optimized for performance and reliability

## Infrastructure as Code Patterns

### SAM Template Structure
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: > 
  Pipeline-specific description

Parameters:        # Environment and configuration parameters
Mappings:         # Environment-specific resource configurations  
Globals:          # Shared function configurations
Resources:        # AWS resources (Functions, APIs, Storage)
Outputs:          # Stack outputs for cross-stack references
```

### Resource Definition Pattern
```yaml
FunctionName:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: functions/function-directory/
    Handler: src/index.handler
    Description: 'Function purpose description'
    Policies: [Required IAM policies]
    Environment:
      Variables: [Function-specific environment variables]
    DeadLetterQueue:
      Type: SQS
      TargetArn: !GetAtt ProcessingDeadLetterQueue.Arn
```

## Deployment Patterns

### Environment Configuration Structure
```toml
[{env}.global.parameters]
stack_name = "sam-data-pipeline-{env}"
region = "ap-southeast-1"

[{env}.deploy.parameters]
capabilities = "CAPABILITY_IAM CAPABILITY_NAMED_IAM"
confirm_changeset = true
resolve_s3 = true
```

### Script Organization
```
scripts/
├── deploy.sh                          # Main deployment script
├── deploy-{environment}.sh             # Environment-specific deployment
├── cleanup.sh                         # Environment cleanup
└── manage-environments.sh              # Environment management utilities
```

## Testing Organization

### Test Structure
```
tests/
├── unit/                               # Unit tests for individual functions
│   ├── function-name/
│   │   └── test-handler.js
├── integration/                        # Integration tests for workflows
│   ├── pipeline-tests/
│   │   └── ingestion-pipeline.test.js
└── fixtures/                           # Test data and fixtures
```

### Event Payload Organization
```
events/
├── api-gateway-event.json             # API Gateway trigger events
├── test-event.json                    # General test events
└── pipeline-specific/                 # Pipeline-specific test events
```

## Error Handling Patterns

### Dead Letter Queue Integration
- All functions include DLQ configuration
- Standardized error message format
- Environment-specific retention policies

### Error Response Format
```javascript
{
  "errorType": "ValidationError",
  "errorMessage": "Descriptive error message",
  "stackTrace": [...],
  "timestamp": "ISO-8601-timestamp",
  "requestId": "lambda-request-id"
}
```

## Logging Patterns

### Structured Logging
```javascript
console.log('Processing batch raw Data:', event, context);
console.error('Error processing data:', error);
console.info('Successfully processed:', resultSummary);
```

### Log Retention
- **Development**: 7 days
- **Staging**: 14 days  
- **Production**: 30 days

## Development Workflow

### Local Development
1. Use SAM CLI for local function testing
2. Test individual functions with event payloads
3. Validate SAM template before deployment
4. Run integration tests locally when possible

### Code Quality Standards
- ES modules for all new code
- Consistent error handling patterns
- Environment variable validation
- Input parameter validation
- Comprehensive logging

### Deployment Workflow
1. Validate template: `sam validate`
2. Build application: `sam build`
3. Deploy to target environment: `./scripts/deploy.sh {env}`
4. Verify deployment with test execution
5. Monitor logs and metrics post-deployment

## Multi-Pipeline Support

### Adding New Pipelines
1. **Create State Machine**: Add new ASL definition in `statemachine/`
2. **Add Functions**: Create pipeline-specific functions in `functions/`
3. **Update Template**: Add resources to `template.yaml`
4. **Configure Deployment**: Update scripts and configurations
5. **Add Tests**: Create pipeline-specific test suites

### Shared Resource Patterns
- Reusable functions across pipelines where appropriate
- Common error handling and monitoring
- Standardized IAM policies and roles
- Consistent naming and tagging

## Configuration Management

### Environment Variables
- Secure handling with SAM parameter encryption
- Environment-specific values via mappings
- No hardcoded sensitive data in code
- Validation of required environment variables

### Parameter Management
- Template parameters for deployment-time configuration
- Environment mappings for resource sizing
- Default values with override capabilities
- Clear parameter documentation

## Documentation Standards

### Code Documentation
- Function-level JSDoc comments for complex logic
- README files for each major component
- Inline comments for business logic
- API documentation for external interfaces

### Architecture Documentation
- Keep diagrams and documentation current
- Document deployment procedures
- Maintain troubleshooting guides
- Update documentation with each major change