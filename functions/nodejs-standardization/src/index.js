// index.js
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Target data structure schema
// const userInfoSchema = {
//     type: "object",
//     properties: {
//         first_name: { type: "string" },
//         last_name: { type: "string" },
//         email: { type: "string" },
//         phone: { type: "string" },
//         address1: { type: "string" },
//         address2: { type: "string" },
//         city: { type: "string" },
//         state: { type: "string" },
//         zip_code: { type: "string" },
//         company_name: { type: "string" },
//         job_title: { type: "string" },
//         country: { type: "string" },
//         linked_in_url: { type: "string" },
//     },
//     required: ["first_name", "last_name", "email", "phone", "address1", "address2", "city", "state", "zip_code", "company_name", "job_title", "country" ,"linked_in_url"],
//     additionalProperties: false,
//   };
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
    linked_in_url: "",
  };

exports.handler = async (event, context) => {
    console.log('Processing batch raw Data:', event, context);
    // console.log('Processing batch:', event.batchId, 'with', event?.csvData?.Items.length, 'records');
    const items = event?.items || [];
    // return items || []
    try {
        // Validate input
        // if (!event.csvData || !Array.isArray(event.csvData)) {
        //     throw new Error('Invalid input: csvData must be an array');
        // }

        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable not set');
        }

        // Standardize data using OpenAI
        const standardizedRecords = await standardizeWithOpenAI(items);

        // Return standardized data for next Step Functions state
        // const output = {
        //     standardizedData: standardizedRecords,
        //     batchId: event?.batchId,
        //     processedCount: standardizedRecords.length,
        //     status: 'completed'
        // };
        const output = standardizedRecords || [];

        console.log('Successfully processed batch:', event?.batchId, 'with', standardizedRecords.length, 'records');
        return output;

    } catch (error) {
        console.error('Error processing batch:', event.batchId, error);
        
        // return {
        //     batchId: event?.batchId,
        //     processedCount: 0,
        //     status: 'failed',
        //     error: error.message
        // };
        return []
    }
};

async function standardizeWithOpenAI(csvData) {
    const prompt = createStandardizationPrompt(csvData);

    try {
        const response = await openai.chat.completions.create({
        // const response = await openai.responses.create({
            model: 'gpt-4.1',
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
        console.log("con co be be", responseContent)
        
        // Parse the JSON response
        let standardizedRecords;
        try {
            standardizedRecords = JSON.parse(responseContent);
            console.log("con heo", standardizedRecords)
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', responseContent);
            throw new Error('Invalid JSON response from OpenAI: ' + parseError.message);
        }

        // Validate that we got an array
        if (!Array.isArray(standardizedRecords)) {
            throw new Error('OpenAI response is not an array');
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

return `You are a data standardization assistant. Your task is to extract and standardize contact informations from the provided records.

Input Record:
${csvDataJson}

Please extract and standardize the data according to the following schema. Fill in as many fields as possible based on the input data. Leave fields empty if no relevant information is available.

Output Schema:
${schemaJson}

Rules:
1. Extract name components (first name, last name) if available, or parse from full name
2. Remove all emoji icon, just keep the meaningful character
3. Standardize job titles to common industry terms
4. Extract all contact information (emails, phones, addresses)
5. Identify and extract social media URLs
6. Extract location information
7. Return ONLY the filled JSON schema, nothing else
8. Remove value if have empty field name
9. Return only a JSON array of standardized records, no additional text or markdown
`;
}