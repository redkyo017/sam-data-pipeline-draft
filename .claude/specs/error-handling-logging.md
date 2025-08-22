# Error Handling and Logging Specification

## Overview
This specification defines comprehensive error handling strategies, logging patterns, and observability practices for the serverless data pipeline.

## Core Error Handling Principles

### 1. Graceful Degradation
- Never allow single record failures to stop entire pipeline
- Return empty arrays instead of throwing errors in processing functions
- Continue pipeline execution with partial results
- Use Dead Letter Queues to capture failed messages for manual review

### 2. Error Classification

#### Recoverable Errors
- Network timeouts
- Temporary API rate limits  
- Transient AWS service issues
- **Strategy**: Automatic retry with exponential backoff

#### Non-Recoverable Errors
- Invalid API keys or authentication
- Malformed data that cannot be processed
- Missing required environment variables
- **Strategy**: Fail fast, log detailed error, send to DLQ

#### Business Logic Errors
- Data validation failures
- Schema mismatches
- Processing rule violations
- **Strategy**: Log warning, continue with best-effort processing

### 3. Function-Level Error Patterns

#### Lambda Function Template
```javascript
exports.handler = async (event, context) => {
  // Request ID for correlation
  const requestId = context.awsRequestId;
  
  try {
    // Input validation
    if (!event || !event.items) {
      throw new Error('Invalid input: missing required fields');
    }
    
    // Environment validation
    if (!process.env.REQUIRED_CONFIG) {
      throw new Error('Configuration error: missing environment variables');
    }
    
    // Log processing start
    console.log(`[${requestId}] Processing started`, {
      itemCount: event.items?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    // Main processing logic
    const result = await processItems(event.items);
    
    // Log success
    console.log(`[${requestId}] Processing completed`, {
      outputCount: result?.length || 0,
      processingTime: Date.now() - startTime
    });
    
    return result || [];
    
  } catch (error) {
    // Structured error logging
    console.error(`[${requestId}] Processing failed`, {
      error: error.message,
      stack: error.stack,
      input: JSON.stringify(event, null, 2),
      timestamp: new Date().toISOString()
    });
    
    // For data processing functions, return empty array
    // to continue pipeline execution
    if (error.name === 'ProcessingError') {
      return [];
    }
    
    // For critical errors, propagate to trigger DLQ
    throw error;
  }
};
```

### 4. Dead Letter Queue Configuration

#### DLQ Setup Pattern
```yaml
ProcessingFunction:
  Type: AWS::Serverless::Function
  Properties:
    # Function configuration
    DeadLetterQueue:
      Type: SQS
      TargetArn: !GetAtt ProcessingDeadLetterQueue.Arn

ProcessingDeadLetterQueue:
  Type: AWS::SQS::Queue  
  Properties:
    QueueName: !Sub "${AWS::StackName}-processing-dlq"
    MessageRetentionPeriod: 1209600  # 14 days
    VisibilityTimeoutSeconds: 300
```

#### DLQ Message Structure
```json
{
  "errorMessage": "Processing failed: Invalid data format",
  "errorType": "ProcessingError",
  "requestId": "12345-67890-abcde",
  "functionName": "nodejs-standardization",
  "timestamp": "2024-01-15T10:30:00Z",
  "originalEvent": {
    // Original event that caused the error
  },
  "context": {
    // Lambda context information
  }
}
```

### 5. Step Functions Error Handling

#### State-Level Error Configuration
```json
{
  "Validate input format": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Retry": [
      {
        "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }
    ],
    "Catch": [
      {
        "ErrorEquals": ["States.TaskFailed"],
        "Next": "ProcessingError",
        "ResultPath": "$.error"
      }
    ]
  },
  "ProcessingError": {
    "Type": "Fail",
    "Cause": "Data processing failed",
    "Error": "ProcessingFailure"
  }
}
```

#### State Machine Error Patterns
- **Retry Logic**: 3 attempts with exponential backoff (2x multiplier)
- **Catch Blocks**: Capture errors and route to error handling states
- **Result Path**: Preserve error information in state data
- **Graceful Fallbacks**: Alternative processing paths for non-critical failures

### 6. Logging Standards

#### Structured Logging Format
```javascript
const logEntry = {
  level: 'INFO|WARN|ERROR',
  timestamp: new Date().toISOString(),
  requestId: context.awsRequestId,
  functionName: context.functionName,
  message: 'Human readable message',
  data: {
    // Relevant structured data
    itemCount: 100,
    processingTime: 1500,
    // ... other metrics
  },
  error: {
    // Only for ERROR level
    message: error.message,
    stack: error.stack,
    type: error.name
  }
};

console.log(JSON.stringify(logEntry));
```

#### Log Levels and Usage

**ERROR**: Failures that prevent processing
```javascript
console.error(`[${requestId}] Processing failed`, {
  error: error.message,
  stack: error.stack,
  input: sanitizedInput,
  timestamp: new Date().toISOString()
});
```

**WARN**: Issues that don't prevent processing
```javascript
console.warn(`[${requestId}] Data quality issue`, {
  issue: 'Missing required field',
  record: record.id,
  fallback: 'Using default value'
});
```

**INFO**: Normal processing milestones
```javascript
console.log(`[${requestId}] Processing completed`, {
  itemCount: results.length,
  processingTime: endTime - startTime,
  successRate: successCount / totalCount
});
```

### 7. External API Error Handling

#### OpenAI API Error Pattern
```javascript
async function standardizeWithOpenAI(data) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const response = await openai.chat.completions.create({
        // API configuration
      });
      
      if (!response.choices || response.choices.length === 0) {
        throw new Error('Empty response from OpenAI API');
      }
      
      const content = response.choices[0].message.content;
      
      // Validate JSON response
      try {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          throw new Error('Response is not an array');
        }
        return parsed;
      } catch (parseError) {
        console.error('Failed to parse OpenAI response', {
          content: content.substring(0, 500),
          error: parseError.message
        });
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
      
    } catch (error) {
      attempt++;
      
      // Log attempt
      console.warn(`OpenAI API attempt ${attempt} failed`, {
        error: error.message,
        attemptsRemaining: maxRetries - attempt
      });
      
      // Check if should retry
      if (attempt >= maxRetries) {
        console.error('OpenAI API max retries exceeded', {
          error: error.message,
          attempts: attempt
        });
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 8. Monitoring and Alerting

#### CloudWatch Metrics
```javascript
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

async function publishMetric(metricName, value, unit = 'Count') {
  const params = {
    Namespace: 'DataPipeline',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date(),
      Dimensions: [
        {
          Name: 'Function',
          Value: context.functionName
        }
      ]
    }]
  };
  
  await cloudwatch.putMetricData(params).promise();
}
```

#### Key Metrics to Track
- **ProcessingSuccess**: Number of successfully processed records
- **ProcessingFailure**: Number of failed records
- **ProcessingLatency**: Time taken for processing operations  
- **APICallSuccess**: Successful external API calls
- **APICallFailure**: Failed external API calls
- **DataQualityIssues**: Records with quality problems

### 9. X-Ray Tracing Integration

#### Tracing Configuration
```yaml
Globals:
  Function:
    Tracing: Active  # Enable X-Ray tracing
    Environment:
      Variables:
        _X_AMZN_TRACE_ID: !Ref AWS::NoValue
```

#### Custom Trace Annotations
```javascript
const AWSXRay = require('aws-x-ray-sdk-core');

exports.handler = AWSXRay.captureAsyncFunc('handler', async (event, context) => {
  const segment = AWSXRay.getSegment();
  
  // Add annotations for filtering
  segment.addAnnotation('functionName', context.functionName);
  segment.addAnnotation('itemCount', event.items?.length || 0);
  
  // Add metadata for debugging
  segment.addMetadata('processingParams', {
    batchSize: event.items?.length,
    timestamp: new Date().toISOString()
  });
  
  // Processing logic...
});
```

### 10. Health Check and Monitoring Patterns

#### Function Health Check
```javascript
// Health check endpoint pattern
exports.healthCheck = async (event, context) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    function: context.functionName,
    checks: {}
  };
  
  try {
    // Check environment variables
    health.checks.environment = process.env.REQUIRED_VAR ? 'ok' : 'missing';
    
    // Check external dependencies
    if (process.env.OPENAI_API_KEY) {
      health.checks.openai = 'configured';
    } else {
      health.checks.openai = 'missing';
      health.status = 'degraded';
    }
    
    // Check AWS services connectivity
    // ... additional checks
    
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
  }
  
  return {
    statusCode: health.status === 'healthy' ? 200 : 503,
    body: JSON.stringify(health)
  };
};
```

### 11. Error Recovery Procedures

#### Manual Intervention Guidelines
1. **Check DLQ Messages**: Review failed records for patterns
2. **Validate Configuration**: Ensure all environment variables are set
3. **Test External APIs**: Verify API keys and service availability
4. **Replay Failed Records**: Use DLQ redrive policy for recovery
5. **Monitor Metrics**: Check CloudWatch for error trends

#### Automated Recovery
- Use SQS redrive policy to automatically retry DLQ messages
- Implement circuit breaker pattern for external API calls
- Set up CloudWatch alarms for automatic scaling
- Use Lambda provisioned concurrency for critical functions