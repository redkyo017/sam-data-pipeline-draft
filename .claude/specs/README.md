# Spec Steering Configuration

This directory contains comprehensive specifications that guide AI-assisted development for the SAM Data Pipeline project. These specifications ensure consistent code patterns, architecture decisions, and development practices.

## Available Specifications

### 🏗️ [AWS SAM Architecture](aws-sam-architecture.md)
**Priority: High**
- Serverless-first architectural patterns
- Resource naming conventions
- Function configuration standards
- State machine design patterns
- Security and observability best practices

### 📊 [Data Processing Patterns](data-processing-patterns.md)  
**Priority: High**
- CSV data ingestion and validation workflows
- Data transformation and standardization rules
- AI-powered data cleaning with OpenAI integration
- Batch processing and distributed map patterns
- Performance optimization strategies

### ⚠️ [Error Handling & Logging](error-handling-logging.md)
**Priority: Medium**
- Graceful degradation strategies
- Structured logging standards
- Dead Letter Queue configuration
- Step Functions error handling patterns
- Monitoring and alerting best practices

### 🧪 [Testing & Deployment](testing-deployment.md)
**Priority: Medium**
- Unit, integration, and performance testing strategies
- Local testing with SAM CLI
- CI/CD pipeline configuration
- Blue/green deployment procedures
- Quality gates and validation checks

## How Spec Steering Works

When working on this project, AI assistants will:

1. **Reference these specifications** for architectural decisions
2. **Follow established patterns** for consistency
3. **Apply best practices** from error handling and testing specs
4. **Maintain code quality** according to defined standards

## Specification Priority

- **High Priority**: Core architectural and data processing patterns that must be followed
- **Medium Priority**: Important guidelines that should be considered for quality and maintainability

## Usage Examples

### When Adding New Lambda Functions
- Follow naming conventions from `aws-sam-architecture.md`
- Implement error handling patterns from `error-handling-logging.md` 
- Add appropriate tests as outlined in `testing-deployment.md`

### When Modifying Data Processing Logic
- Reference data schemas and transformation rules in `data-processing-patterns.md`
- Ensure proper validation and error handling
- Maintain AI integration patterns for OpenAI standardization

### When Deploying Changes
- Follow deployment procedures from `testing-deployment.md`
- Run all quality gates and validation checks
- Use environment-specific configuration patterns

## Updating Specifications

These specifications should be updated when:
- New architectural patterns are established
- Data processing requirements change
- Additional error handling scenarios are identified
- Testing or deployment procedures evolve

## Integration with Development Workflow

The specifications in this directory serve as:
- **Design Guidelines**: For architectural decisions
- **Code Templates**: For consistent implementation patterns  
- **Quality Checklists**: For code reviews and validation
- **Documentation**: For onboarding and knowledge sharing