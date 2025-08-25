# Implementation Plan

## Task Overview

Implementation of the enrichment pipeline will create a new Lambda function and Step Functions state machine that integrates with the existing SAM data processing platform. The approach follows atomic task principles to enable efficient agent execution, focusing on one Lambda function for enrichment processing and reusing existing infrastructure patterns.

## Steering Document Compliance

Tasks follow established project conventions:
- **Function Organization**: New `nodejs-enrichment-processor` function in `functions/` directory following existing patterns
- **State Machine Organization**: New `enrichment_pipeline.asl.json` in `statemachine/` directory
- **Naming Conventions**: Follow `{language}-{purpose}-{type}` pattern for resources
- **Error Handling**: Integrate with existing dead letter queues and logging patterns
- **Infrastructure**: Use SAM template patterns with proper IAM policies and environment configurations

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Task Format Guidelines

- Use checkbox format: `- [ ] Task number. Task description`
- **Specify files**: Always include exact file paths to create/modify
- **Include implementation details** as bullet points
- Reference requirements using: `_Requirements: X.Y_`
- Reference existing code to leverage using: `_Leverage: path/to/file.mjs_`
- Focus only on coding tasks (no deployment, user testing, etc.)
- **Avoid broad terms**: No "system", "integration", "complete" in task titles

## Tasks

### Infrastructure Setup

- [ ] 1. Create enrichment Lambda function directory structure
  - Files: `functions/nodejs-enrichment-processor/package.json`, `functions/nodejs-enrichment-processor/src/index.mjs`
  - Create function directory following existing patterns
  - Initialize package.json with type: "module" and Node.js 20.x
  - Create empty handler file with standard export structure
  - _Leverage: functions/nodejs-standardization/package.json_
  - _Requirements: 1.1, 7.5_

- [ ] 2. Add enrichment processor Lambda function to SAM template
  - File: `template.yaml`
  - Add EnrichmentProcessorFunction resource with proper configuration
  - Configure environment-specific memory, timeout, and DLQ settings
  - Add IAM policies for S3 read/write and Parameter Store access
  - _Leverage: existing Lambda function definitions in template.yaml_
  - _Requirements: 2.1, 6.1_

- [ ] 3. Create enrichment pipeline Step Functions state machine
  - File: `statemachine/enrichment_pipeline.asl.json`
  - Copy ingestion_pipeline.asl.json structure and modify for enrichment
  - Replace function ARNs with EnrichmentProcessorFunction placeholder
  - Configure ItemReader for JSON file processing
  - _Leverage: statemachine/ingestion_pipeline.asl.json_
  - _Requirements: 1.1, 6.3_

- [ ] 4. Add enrichment state machine to SAM template
  - File: `template.yaml`
  - Add EnrichmentStateMachine resource with proper configuration
  - Configure DefinitionSubstitutions for function ARN replacement
  - Add IAM policies for Lambda invocation and S3 access
  - _Leverage: existing IngestionStateMachine definition in template.yaml_
  - _Requirements: 6.3, 7.1_

- [ ] 5. Add enrichment API Gateway endpoint to existing API
  - File: `template.yaml`
  - Add new API Gateway resource path for /pipelines/enrichment/executions
  - Configure POST method to trigger EnrichmentStateMachine
  - Reuse existing CORS and authentication patterns
  - _Leverage: existing IngestionApi configuration in template.yaml_
  - _Requirements: 6.1, 6.2_

### Core Implementation

- [ ] 6. Implement basic enrichment processor handler structure
  - File: `functions/nodejs-enrichment-processor/src/index.mjs`
  - Create handler function with batch processing structure
  - Add environment variable validation for API keys
  - Implement basic error handling and logging patterns
  - _Leverage: functions/nodejs-standardization/src/index.mjs batch processing patterns_
  - _Requirements: 1.2, 2.1, 7.4_

- [ ] 7. Add RocketReach API integration module
  - File: `functions/nodejs-enrichment-processor/src/rocketreach-api.mjs`
  - Create module for RocketReach API calls with rate limiting
  - Implement contact lookup functionality
  - Add error handling and retry logic with exponential backoff
  - _Leverage: functions/nodejs-standardization/src/index.mjs OpenAI integration patterns_
  - _Requirements: 2.1, 2.4_

- [ ] 8. Add Apollo.io API integration module
  - File: `functions/nodejs-enrichment-processor/src/apollo-api.mjs`
  - Create module for Apollo.io API calls with rate limiting
  - Implement contact lookup functionality
  - Add error handling and retry logic with exponential backoff
  - _Leverage: functions/nodejs-standardization/src/index.mjs OpenAI integration patterns_
  - _Requirements: 2.1, 2.4_

- [ ] 9. Implement parallel API calls and data merging
  - File: `functions/nodejs-enrichment-processor/src/contact-enricher.mjs`
  - Create module to orchestrate parallel API calls
  - Implement data merging logic with deduplication
  - Add enrichment metadata generation
  - _Leverage: functions/nodejs-merge-csv-data/src/index.mjs deduplication patterns_
  - _Requirements: 2.1, 2.2, 3.1, 3.3_

- [ ] 10. Add individual file writing functionality
  - File: `functions/nodejs-enrichment-processor/src/file-writer.mjs`
  - Create module for writing individual JSON files to S3
  - Implement structured naming convention with batch/record IDs
  - Add retry logic for S3 operations
  - _Leverage: functions/nodejs-process-standardized-data/src/index.mjs S3 patterns_
  - _Requirements: 4.1, 4.2_

- [ ] 11. Complete enrichment processor main handler
  - File: `functions/nodejs-enrichment-processor/src/index.mjs`
  - Integrate all modules (API calls, merging, file writing)
  - Add comprehensive error handling and DLQ integration
  - Implement batch processing with proper logging
  - _Leverage: existing handler patterns from other Lambda functions_
  - _Requirements: 2.1, 2.2, 4.1, 7.4_

### File Merging and Cleanup

- [ ] 12. Create file merging Lambda function directory structure
  - Files: `functions/nodejs-enrichment-merger/package.json`, `functions/nodejs-enrichment-merger/src/index.mjs`
  - Create function directory following existing patterns
  - Initialize package.json with S3 and file processing dependencies
  - Create basic handler structure for file collection and merging
  - _Leverage: functions/nodejs-merge-csv-data structure and dependencies_
  - _Requirements: 5.1_

- [ ] 13. Add enrichment merger Lambda function to SAM template
  - File: `template.yaml`
  - Add EnrichmentMergerFunction resource with proper configuration
  - Configure S3 read/write permissions and environment variables
  - Add DLQ configuration following existing patterns
  - _Leverage: existing MergeCsvDataFunction definition_
  - _Requirements: 5.1, 7.2_

- [ ] 14. Implement file collection and merging logic
  - File: `functions/nodejs-enrichment-merger/src/index.mjs`
  - Implement logic to collect individual JSON files from temp directory
  - Add file merging functionality maintaining array structure
  - Add cleanup logic to remove temporary files after merging
  - _Leverage: functions/nodejs-merge-csv-data/src/index.mjs merging patterns_
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [ ] 15. Update enrichment state machine to include merger
  - File: `statemachine/enrichment_pipeline.asl.json`
  - Add merger function call after distributed map completion
  - Configure proper data passing between enrichment and merger steps
  - Add error handling states for merger failures
  - _Leverage: existing ingestion pipeline merger integration_
  - _Requirements: 5.1, 7.3_

### Testing and Validation

- [ ] 16. Create enrichment processor unit tests
  - File: `functions/nodejs-enrichment-processor/src/test/handler.test.mjs`
  - Write tests for API integration modules with mocked responses
  - Test deduplication logic and error handling scenarios
  - Add tests for file writing functionality
  - _Leverage: existing test patterns from other functions_
  - _Requirements: 2.1, 2.2, 3.1_

- [ ] 17. Create test event files for enrichment pipeline
  - Files: `events/enrichment-api-gateway-event.json`, `events/enrichment-test-data.json`
  - Create API Gateway event payload for enrichment endpoint
  - Create sample JSON data file with OUTPUT_DATA_STRUCTURE format
  - Include campaign_id and commit_id for testing
  - _Leverage: events/api-gateway-event.json, functions/nodejs-merge-csv-data/src/output_data_structure.mjs_
  - _Requirements: 1.2, 6.1_

- [ ] 18. Add Parameter Store configuration documentation
  - File: `docs/ENRICHMENT-SETUP.md`
  - Document required Parameter Store keys for API credentials
  - Provide configuration examples for different environments
  - Include testing and deployment instructions
  - _Leverage: existing documentation patterns_
  - _Requirements: 2.1, 6.1_