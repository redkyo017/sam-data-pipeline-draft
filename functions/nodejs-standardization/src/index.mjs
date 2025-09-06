// index.jms
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Target data structure schema
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
    linkedin_url: "",
  };

export const handler = async (event, context) => {
    console.log('Processing batch raw Data:', event, context);
    
    let batchItems = [];
    let campaign_id = "default-campaign";
    let commit_id = null;
    
    if (event.Items && Array.isArray(event.Items)) {
        // Extract from ItemBatcher structure
        batchItems = event.Items.map(item => item.items);
        // Get campaign_id and commit_id from the first item (they should be the same for all items in batch)
        if (event.Items.length > 0) {
            campaign_id = event.Items[0].campaign_id || "default-campaign";
            commit_id = event.Items[0].commit_id;
        }
    } else {
        // Fallback for direct structure
        campaign_id = event?.campaign_id || "default-campaign";
        commit_id = event?.commit_id;
        const items = Array.isArray(event?.items) ? event.items : (event?.items ? [event.items] : (event || []));
        batchItems = Array.isArray(items) ? items : [items];
    }
    
    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable not set');
        }

        // Standardize batch of data using OpenAI (saves tokens!)
        const standardizedRecords = await standardizeWithOpenAI(batchItems);

        // Add campaign_id and commit_id to each standardized record
        const enrichedRecords = standardizedRecords.map(record => ({
            campaign_id: campaign_id,
            commit_id: commit_id,
            ...record
        }));

        console.log('Successfully processed batch with', enrichedRecords.length, 'records');
        return enrichedRecords;

    } catch (error) {
        console.error('Error processing batch:', error);
        
        // Check if this is a systemic failure that should trigger the failure queue
        if (isSysemicFailure(error)) {
            console.error('Systemic failure detected, throwing error to trigger failure queue:', error.message);
            throw error;
        }
        
        // For non-systemic failures, return empty array to continue processing
        return [];
    }
};

async function standardizeWithOpenAI(csvData) {
    const prompt = createStandardizationPrompt(csvData);

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a data standardization expert. Your task is to standardize the provided CSV data into a consistent format. Return only valid JSON without any markdown formatting or additional text.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            // max_tokens: 2000,
            // temperature: 0.1,
            // text: {
            //     format: {
            //         type: "json_schema",
            //         name: "userInfo",
            //         schema: userInfoSchema,
            //         strict: true
            //     }
            // }
        });

        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response from OpenAI API');
        }

        const responseContent = response.choices[0].message.content;
        // const responseContent = response.output_text;
        
        // Parse the JSON response
        let standardizedRecords;
        try {
            standardizedRecords = JSON.parse(responseContent);
            console.log("Parsed standardized records:", standardizedRecords);
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', responseContent);
            throw new Error('Invalid JSON response from OpenAI: ' + parseError.message);
        }

        // Ensure we have an array for batch processing
        if (!Array.isArray(standardizedRecords)) {
            if (typeof standardizedRecords === 'object' && standardizedRecords !== null) {
                standardizedRecords = [standardizedRecords]; // Wrap single object in array
            } else {
                throw new Error('OpenAI response is not a valid array or object');
            }
        }

        return standardizedRecords;

    } catch (error) {
        console.error('OpenAI API error:', error);
        throw new Error('Failed to standardize data with OpenAI: ' + error.message);
    }
}

function createStandardizationPrompt(csvData) {
    const csvDataJson = JSON.stringify(csvData, null, 2);
    const schemaJson = JSON.stringify(TARGET_SCHEMA, null, 2);

//     return `
// Please standardize the following CSV data into the specified format:

// Input CSV Data:
// ${csvDataJson}

// Target Schema (with example values):
// ${schemaJson}

// Instructions:
// 1. Map the input fields to the target schema fields as best as possible
// 2. Clean and normalize the data (e.g., proper name capitalization, phone number formatting)
// 3. Generate a unique ID for each record if not present (use UUID format if possible)
// 4. Assign appropriate business categories based on available information
// 5. Set a confidence score (0.0-1.0) based on how well the data maps to the schema
// 6. Return only a JSON array of standardized records, no additional text or markdown

// Example output format:
// [
//   {
//     "id": "uuid-1234-5678",
//     "name": "John Doe",
//     "email": "john.doe@example.com",
//     "phone": "+1-555-0123",
//     "address": "123 Main St, City, State 12345",
//     "company": "Acme Corporation",
//     "category": "Technology",
//     "confidence": 0.95
//   }
// ]
// `;

return `You are a data standardization assistant. Your task is to extract and standardize contact information from the provided batch of records.

Input Records Batch:
${csvDataJson}

Please extract and standardize the data according to the following schema. Fill in as many fields as possible based on the input data. Leave fields empty if no relevant information is available.

Output Schema (for each record):
${schemaJson}

Rules:
1. Extract name components (first name, last name) if available, or parse from full name
2. Remove all emoji icons, just keep the meaningful characters
3. Standardize job titles to common industry terms
4. Extract all contact information (emails, phones, addresses)
5. Identify and extract social media URLs
6. Extract location information
7. Process ALL records in the input batch
8. Return ONLY a JSON array of standardized records, nothing else
9. Remove fields that have empty values from each record
10. Return only the JSON array, no additional text or markdown

Example output format for a batch:
[
  { standardized_record_1 },
  { standardized_record_2 },
  ...
]
`;
}

function isSysemicFailure(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Check for systemic failures that should trigger the failure queue
    const systemicFailureIndicators = [
        'openai_api_key environment variable not set',
        'failed to standardize data with openai',
        'no response from openai api',
        'invalid json response from openai',
        'authentication failed',
        'invalid api key',
        'model not found',
        'insufficient quota',
        'rate limit exceeded',  // Persistent rate limiting might be systemic
        'network error',
        'connection refused',
        'timeout'
    ];
    
    return systemicFailureIndicators.some(indicator => 
        errorMessage.includes(indicator)
    );
}