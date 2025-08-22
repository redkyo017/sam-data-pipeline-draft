# Data Processing Patterns Specification

## Overview
This specification defines the data processing patterns, schemas, and transformation rules used throughout the serverless data pipeline.

## Core Data Flow Architecture

### 1. CSV Data Ingestion Pattern
```
S3 CSV Input → Distributed Map → Validation → Processing → Merge → Output
```

#### Input Data Schema (Raw CSV)
```javascript
const INPUT_COLUMNS = [
  "Org",
  "Company", 
  "First Name",
  "Last Name",
  "Title",
  "Organization Name (Parent)",
  "Phone",
  "Email", 
  "Fax",
  "LinkedIn",
  "Address 1",
  "Address 2", 
  "City",
  "State",
  "Zip",
  "Country"
];
```

#### Output Data Schema (Standardized)
```javascript
const TARGET_SCHEMA = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip_code: "",
  company_name: "",
  job_title: "",
  country: "",
  linked_in_url: ""
};
```

### 2. Data Validation Patterns

#### Format Validation
```javascript
// Function: nodejs-validate-raw-valid-format
// Pattern: Strict column name matching
function validateInputFormat(items, validColumnNames) {
  if (!items.length) return false;
  
  for (const columnName in items[0]) {
    if (!validColumnNames.includes(columnName)) {
      return false;
    }
  }
  return true;
}
```

#### Validation Response Pattern
```javascript
{
  isValidInputFormat: boolean,
  items: Array<Record>,
  validationDetails?: string
}
```

### 3. Data Transformation Patterns

#### AI-Powered Standardization
```javascript
// Function: nodejs-standardization
// Pattern: OpenAI-based data cleaning and standardization
const STANDARDIZATION_RULES = {
  names: "Proper case capitalization, split full names",
  emails: "Lowercase, validate format", 
  phones: "Standardized format with country codes",
  addresses: "Normalized format, extract components",
  companies: "Clean formatting, remove extra characters",
  linkedin: "Extract valid LinkedIn URLs"
};
```

#### Direct Mapping Pattern
```javascript
// Function: nodejs-mapping-raw-valid-input  
// Pattern: Direct field mapping for valid format data
const FIELD_MAPPING = {
  "First Name": "first_name",
  "Last Name": "last_name", 
  "Email": "email",
  "Phone": "phone",
  "Address 1": "address1",
  "Address 2": "address2",
  "City": "city", 
  "State": "state",
  "Zip": "zip_code",
  "Company": "company_name",
  "Title": "job_title",
  "Country": "country",
  "LinkedIn": "linked_in_url"
};
```

### 4. Batch Processing Patterns

#### Distributed Map Configuration
```json
{
  "MaxConcurrency": 1000,
  "ItemBatcher": {
    "MaxItemsPerBatch": 15
  },
  "ItemReader": {
    "Resource": "arn:aws:states:::s3:getObject",
    "ReaderConfig": {
      "InputType": "CSV",
      "CSVHeaderLocation": "FIRST_ROW"
    }
  }
}
```

#### Merge Pattern
```javascript
// Function: nodejs-merge-csv-data
// Pattern: Aggregate distributed results into single output
function mergeResults(distributedResults) {
  const allRecords = [];
  for (const result of distributedResults) {
    if (result.processed?.Payload) {
      allRecords.push(...result.processed.Payload);
    }
  }
  return allRecords;
}
```

### 5. Data Quality Patterns

#### AI Prompt Engineering
```javascript
const STANDARDIZATION_PROMPT_PATTERN = `
You are a data standardization assistant. Your task is to extract and standardize contact information from the provided records.

Rules:
1. Extract name components (first name, last name) if available, or parse from full name
2. Remove all emoji icons, keep only meaningful characters  
3. Standardize job titles to common industry terms
4. Extract all contact information (emails, phones, addresses)
5. Identify and extract social media URLs
6. Extract location information
7. Return ONLY the filled JSON schema, nothing else
8. Remove values with empty field names
9. Return only a JSON array of standardized records, no additional text or markdown
`;
```

#### Data Cleaning Rules
- **Emoji Removal**: Strip all Unicode emoji characters
- **Name Standardization**: Title case for proper nouns
- **Phone Formatting**: Consistent format with country codes
- **Email Validation**: Lowercase and format validation
- **Address Normalization**: Standardized components
- **Company Cleaning**: Remove special characters and normalize

### 6. Error Handling in Data Processing

#### Processing Function Pattern
```javascript
exports.handler = async (event, context) => {
  const items = event?.items || [];
  
  try {
    // Validate input
    if (!process.env.REQUIRED_CONFIG) {
      throw new Error('Required configuration missing');
    }
    
    // Process data
    const processedData = await processItems(items);
    
    // Return standardized response
    return processedData || [];
    
  } catch (error) {
    console.error('Processing error:', error);
    
    // Return empty array to continue pipeline
    // Errors are handled by Dead Letter Queue
    return [];
  }
};
```

#### Graceful Degradation
- Continue pipeline execution even with partial failures
- Log detailed error information for debugging
- Use Dead Letter Queues for failed messages
- Return empty arrays rather than throwing errors

### 7. State Management Patterns

#### Step Function Data Flow
```json
{
  "input": {
    "Bucket": "bucket-name",
    "Key": "file-key"
  },
  "validation": {
    "Payload": {
      "isValidInputFormat": true,
      "items": []
    }
  },
  "processing": {
    "Payload": []
  }
}
```

#### Result Path Management
- Use `ResultPath: "$.validation"` for validation results
- Use `ResultPath: "$.processing"` for processing results  
- Maintain input data throughout pipeline
- Pass context between functions via state

### 8. Performance Optimization Patterns

#### Memory and Timeout Configuration
```yaml
ValidateFunction:
  MemorySize: 256    # Lightweight validation
  Timeout: 60

StandardizationFunction:  
  MemorySize: 512    # AI processing requires more memory
  Timeout: 300       # Allow time for OpenAI API calls

MergeFunction:
  MemorySize: 512    # Large dataset aggregation
  Timeout: 300
```

#### Concurrency Management
- Use distributed map for parallel processing
- Set appropriate concurrency limits (1000 max)
- Batch items optimally (15 per batch)
- Monitor memory usage and adjust accordingly

### 9. Data Storage Patterns

#### S3 Organization
```
input-bucket/
├── raw/
│   └── {timestamp}/{filename}.csv
processed-bucket/  
├── standardized/
│   └── {timestamp}/{filename}-processed.json
└── merged/
    └── {timestamp}/final-output.json
```

#### File Naming Convention
- Raw files: `{source}-{timestamp}.csv`
- Processed files: `{source}-{timestamp}-processed.json`
- Merged files: `merged-{timestamp}.json`

### 10. Integration Patterns

#### OpenAI Integration
```javascript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',  // Use latest stable model
  messages: [
    {
      role: 'system', 
      content: 'Data standardization expert prompt'
    },
    {
      role: 'user',
      content: dataPrompt
    }
  ],
  temperature: 0.1  // Low temperature for consistent results
});
```

#### External API Best Practices
- Always validate API keys exist before processing
- Implement proper error handling for API failures
- Use structured prompts for consistent AI responses
- Parse and validate AI responses before using
- Log API interactions for debugging