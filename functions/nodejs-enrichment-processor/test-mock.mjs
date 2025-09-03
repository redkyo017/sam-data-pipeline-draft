// Mock test script - no real API calls
import { handler } from './src/index.mjs';

// Mock the API modules to avoid real API calls
const originalRocketreach = await import('./src/rocketreach-api.mjs');
const originalApollo = await import('./src/apollo-api.mjs');

// Create mock functions that return test data
const mockRocketreachSearchBulk = async (contacts, apiKey, requestId) => {
    console.log(`[${requestId}] 🔄 Mock RocketReach bulk search for ${contacts.length} contacts`);
    return contacts.map((contact, i) => ({
        emails: [
            {
                email: `${contact.first_name?.toLowerCase()}.${contact.last_name?.toLowerCase()}@company.com`,
                priority: 1,
                source: 'rocketreach',
                confidence: 0.8
            }
        ],
        phones: [
            {
                phone: `+1-555-000-${String(i).padStart(4, '0')}`,
                priority: 1,
                source: 'rocketreach', 
                confidence: 0.7
            }
        ]
    }));
};

const mockApolloSearchBulk = async (contacts, apiKey, requestId) => {
    console.log(`[${requestId}] 🔄 Mock Apollo bulk search for ${contacts.length} contacts`);
    return contacts.map((contact, i) => ({
        emails: [
            {
                email: `${contact.first_name?.toLowerCase()}@${contact.company_name?.toLowerCase().replace(/\s+/g, '')}.com`,
                priority: 2,
                source: 'apollo',
                confidence: 0.9
            }
        ],
        phones: [
            {
                phone: `+1-555-111-${String(i).padStart(4, '0')}`,
                priority: 2,
                source: 'apollo',
                confidence: 0.8
            }
        ]
    }));
};

// Override the imports (this is a bit hacky but works for testing)
global.mockRocketreachSearchBulk = mockRocketreachSearchBulk;
global.mockApolloSearchBulk = mockApolloSearchBulk;

// Test event
const testEvent = {
    "Items": [
        {
            "campaign_id": "mock-test-campaign",
            "commit_id": "mock-test-commit",
            "items": [
                {
                    "first_name": "John",
                    "last_name": "Doe", 
                    "company_name": "Test Corp",
                    "job_title": "Software Engineer",
                    "emails": [],
                    "phones": []
                },
                {
                    "first_name": "Jane",
                    "last_name": "Smith",
                    "company_name": "Example Inc", 
                    "job_title": "Product Manager",
                    "emails": [],
                    "phones": []
                }
            ]
        }
    ]
};

// Mock context
const mockContext = {
    awsRequestId: 'mock-test-' + Date.now(),
    functionName: 'EnrichmentProcessorFunction-Mock',
    memoryLimitInMB: 512,
    getRemainingTimeInMillis: () => 30000
};

// Set minimal environment
process.env.ROCKETREACH_STAGING_KEY = "mock-rocketreach-key";
process.env.APOLLO_STAGING_KEY = "mock-apollo-key";
process.env.BUCKET_NAME = "mock-test-bucket";

console.log('🎭 Starting MOCK enrichment processor test...\n');
console.log('📝 Test Event:', JSON.stringify(testEvent, null, 2));
console.log('\n🚀 Invoking handler with mocked APIs...\n');

try {
    const result = await handler(testEvent, mockContext);
    console.log('\n✅ Mock test completed!');
    console.log('📊 Result sample:', JSON.stringify(result[0], null, 2));
    
    // Print detailed summary
    if (Array.isArray(result)) {
        result.forEach((contact, i) => {
            console.log(`\n👤 Contact ${i + 1}: ${contact.first_name} ${contact.last_name}`);
            console.log(`   📧 Emails: ${contact.emails?.length || 0}`);
            console.log(`   📞 Phones: ${contact.phones?.length || 0}`);
            console.log(`   🔍 Sources: ${contact.enrichment_metadata?.enrichment_sources?.join(', ') || 'none'}`);
        });
    }
} catch (error) {
    console.error('\n❌ Mock test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
}