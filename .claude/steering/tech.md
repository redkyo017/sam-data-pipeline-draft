# Technology Stack & Architecture

## Infrastructure & Cloud Services

### AWS Serverless Architecture
- **AWS SAM (Serverless Application Model)**: Infrastructure as Code with CloudFormation
- **AWS Lambda**: Node.js 20.x runtime with ES module support
- **AWS Step Functions**: Pipeline orchestration with distributed processing
- **Amazon S3**: Input/output data storage with multi-environment buckets
- **Amazon API Gateway**: RESTful endpoints for pipeline triggers
- **Amazon SQS**: Dead letter queues for error handling and batch failures
- **Amazon CloudWatch**: Logging, monitoring, and metrics
- **AWS X-Ray**: Distributed tracing for performance analysis

### Deployment & Configuration
- **Region**: ap-southeast-1 (Asia Pacific - Singapore)
- **Multi-Environment Support**: dev, staging, production with different resource allocations
- **SAM Configuration**: `samconfig.toml` with environment-specific settings
- **Automated Deployment**: Shell scripts for environment-specific deployments

## Runtime & Development Stack

### Node.js Environment
- **Runtime**: Node.js 20.x
- **Module System**: ES modules (type: "module")
- **Architecture**: x86_64
- **Source Maps**: Enabled for debugging
- **Environment Variables**: Secure handling with NoEcho parameters

### Key Dependencies
- **OpenAI API**: Data standardization and intelligent processing
- **AWS SDK**: Native integration with AWS services (implied through SAM)
- **Native AWS Lambda Runtime**: No additional framework dependencies

## Architecture Patterns

### Serverless Microservices
- **Function-per-Purpose**: Individual Lambda functions for each processing stage
- **Stateless Design**: No persistent connections or state between invocations
- **Event-Driven**: Step Functions coordinate execution flow
- **Distributed Processing**: Parallel execution with configurable concurrency

### Data Flow Architecture
```
API Gateway → Step Functions → [Validation → Standardization → Mapping → Processing → Merging]
                    ↓
               S3 Storage + SQS Error Handling
```

### Multi-Pipeline Support
- **Modular Design**: Each pipeline type as separate Step Function state machine
- **Shared Infrastructure**: Common Lambda functions reusable across pipelines
- **Pipeline-Specific Logic**: Dedicated functions for specialized processing

## Resource Configuration

### Environment-Specific Settings
| Resource | Development | Staging | Production |
|----------|------------|---------|------------|
| Lambda Memory | 256MB | 512MB | 1024MB |
| Lambda Timeout | 60s | 120s | 300s |
| Log Retention | 7 days | 14 days | 30 days |
| Step Functions Concurrency | 100 | 500 | 1000 |

### Storage & Naming
- **S3 Buckets**: `{basename}-{environment}-{account-id}` pattern
- **Stack Names**: `sam-data-pipeline-{environment}`
- **API Stages**: Environment-specific stage names

## Security & Compliance

### IAM Security
- **Least Privilege**: Functions have minimal required permissions
- **Role-Based Access**: Separate IAM roles per function
- **Resource-Level Permissions**: Fine-grained S3 and Lambda access
- **Cross-Service Policies**: Secure Step Functions → Lambda invocation

### Data Security
- **Environment Variable Encryption**: Sensitive data encrypted at rest
- **API Security**: CORS configuration for secure cross-origin requests
- **Network Isolation**: Can be configured for VPC deployment
- **Audit Trails**: Complete execution logging and tracing

## Performance & Scalability

### Concurrent Processing
- **Distributed Maps**: Step Functions handle large dataset processing
- **Batch Processing**: Configurable batch sizes for efficiency
- **Auto-scaling**: Lambda automatic scaling based on demand
- **Timeout Management**: Environment-specific timeout configurations

### Data Processing
- **Stream Processing**: ItemReader for efficient S3 CSV/JSON processing
- **Error Tolerance**: Configurable failure thresholds
- **Memory Optimization**: Function-specific memory allocations
- **Cost Optimization**: Right-sized resources per environment

## External Integrations

### OpenAI Integration
- **API**: GPT models for data standardization
- **Authentication**: Secure API key management
- **Error Handling**: Circuit breaker patterns for external API failures
- **Rate Limiting**: Configurable retry logic

### Future Integration Points
- **Geolocation APIs**: For address enhancement
- **External Reference Data**: Third-party data enrichment
- **Machine Learning**: Custom ML model integration
- **Real-time APIs**: Streaming data support

## Monitoring & Observability

### Logging & Metrics
- **CloudWatch Logs**: Centralized logging with retention policies
- **Custom Metrics**: Business-specific metrics tracking
- **X-Ray Tracing**: End-to-end request tracing
- **Dead Letter Queues**: Error message aggregation

### Deployment Monitoring
- **CloudFormation Events**: Stack deployment tracking
- **Lambda Function Metrics**: Performance and error monitoring
- **Step Function Execution**: Visual workflow monitoring
- **S3 Metrics**: Data processing volume tracking

## Development & Testing

### Local Development
- **SAM CLI**: Local function and API testing
- **Local Step Functions**: Workflow testing
- **Event Simulation**: Test event payloads for development

### Testing Strategy
- **Unit Tests**: Individual function testing
- **Integration Tests**: Cross-service workflow testing
- **Performance Testing**: Load testing and optimization
- **Multi-Environment Testing**: Validation across deployment tiers

## Technical Constraints

### AWS Limits
- **Lambda**: 15-minute execution limit
- **Step Functions**: 1-year execution limit
- **API Gateway**: Request/response size limits
- **S3**: Object size and throughput considerations

### Performance Requirements
- **Latency**: Sub-second API response for triggers
- **Throughput**: Support for large CSV/JSON file processing
- **Availability**: 99.9% uptime target
- **Scalability**: Handle varying workload demands

## Technical Decisions

### Why Serverless
- **Cost Efficiency**: Pay-per-use model
- **Auto-scaling**: No capacity planning required
- **Reduced Operations**: Minimal infrastructure management
- **High Availability**: Built-in fault tolerance

### Why Step Functions
- **Visual Workflows**: Easy to understand and maintain
- **Error Handling**: Built-in retry and error handling
- **Distributed Processing**: Native support for parallel execution
- **State Management**: Reliable workflow orchestration