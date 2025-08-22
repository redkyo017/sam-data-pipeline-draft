# AWS SAM Architecture Specification

## Overview
This specification defines the architectural patterns and conventions for AWS SAM (Serverless Application Model) resources in the data pipeline project.

## Core Principles

### 1. Serverless-First Architecture
- Use AWS Lambda functions for all computational workloads
- Implement Step Functions for orchestrating complex workflows
- Leverage S3 for data storage and triggers
- Use API Gateway for external interfaces

### 2. Resource Naming Conventions
- **Functions**: Use descriptive, kebab-case names (e.g., `nodejs-validate-raw-valid-format`)
- **State Machines**: Suffix with "StateMachine" (e.g., `IngestionStateMachine`)
- **Buckets**: Follow pattern `{purpose}-bucket` (e.g., `input-bucket`, `output-bucket`)
- **APIs**: Descriptive names with purpose (e.g., `IngestionApi`)

### 3. Function Configuration Standards
```yaml
Function:
  Timeout: 60                    # Default timeout, increase as needed
  MemorySize: 256                # Default memory, scale based on workload
  Runtime: nodejs20.x            # Use latest stable Node.js runtime
  Architectures: [x86_64]        # Standard architecture
  Tracing: Active                # Enable X-Ray tracing for observability
  Environment:
    Variables:
      NODE_OPTIONS: "--enable-source-maps"  # Enable source maps for debugging
```

### 4. Error Handling Architecture
- **Dead Letter Queues**: Every function must have a DLQ for failed executions
- **Retry Logic**: Configure appropriate retry attempts in Step Functions
- **Error Propagation**: Use structured error responses with context

### 5. State Machine Design Patterns

#### Distributed Map Pattern
```json
{
  "Type": "Map",
  "ItemProcessor": {
    "ProcessorConfig": {
      "Mode": "DISTRIBUTED",
      "ExecutionType": "STANDARD"
    }
  },
  "MaxConcurrency": 1000,
  "ItemBatcher": {
    "MaxItemsPerBatch": 15
  }
}
```

#### Choice State Pattern
```json
{
  "Type": "Choice",
  "Choices": [{
    "Variable": "$.validation.Payload.isValidInputFormat",
    "BooleanEquals": true,
    "Next": "ValidPath"
  }],
  "Default": "InvalidPath"
}
```

### 6. Data Flow Architecture
1. **Input Layer**: S3 buckets with event triggers
2. **Validation Layer**: Schema and format validation functions
3. **Processing Layer**: Data transformation and standardization
4. **Output Layer**: Processed data storage and APIs

### 7. Security Best Practices
- Use IAM roles with least privilege principle
- Store sensitive data (API keys) as encrypted parameters
- Enable CORS only for required origins
- Use VPC endpoints for S3 access when possible

### 8. Observability Standards
- Enable CloudWatch logging for all functions
- Use structured logging with consistent format
- Implement X-Ray tracing for distributed requests
- Set up custom metrics for business logic

### 9. Template Structure
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  # Environment-specific parameters
  # Sensitive parameters with NoEcho: true

Globals:
  # Shared function configuration
  # API configuration

Resources:
  # Storage resources (S3 buckets)
  # Compute resources (Lambda functions)
  # Orchestration resources (Step Functions)
  # API resources (API Gateway)
  # Monitoring resources (CloudWatch, DLQ)

Outputs:
  # Key resource ARNs and endpoints
  # Export values for cross-stack references
```

### 10. Environment Management
- Use parameters for environment-specific values
- Implement stack naming conventions: `{project}-{environment}`
- Use CloudFormation exports for cross-stack dependencies
- Maintain separate deployment configurations per environment

## Function-Specific Guidelines

### Validation Functions
- Return structured validation results with boolean flags
- Include validation details for debugging
- Handle both valid and invalid scenarios gracefully

### Processing Functions
- Implement idempotent operations
- Use batch processing for efficiency
- Include progress tracking and status reporting

### Integration Functions
- Handle external API failures gracefully
- Implement exponential backoff for retries
- Log all external interactions for debugging

## State Machine Guidelines
- Use meaningful state names that describe the action
- Include error handling states for each major operation
- Implement proper result path management for data flow
- Use parallel execution where operations are independent

## Deployment Patterns
- Use SAM CLI for local testing and deployment
- Implement blue/green deployments for production
- Use CloudFormation stack policies for protection
- Maintain deployment scripts with parameter validation