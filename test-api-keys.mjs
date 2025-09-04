// Direct API key testing script
import { config } from 'dotenv';

// Load environment variables
config();

const ROCKETREACH_API_KEY = process.env.ROCKETREACH_API_KEY;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

console.log('🔑 Testing API Keys...');
console.log(`RocketReach Key: ${ROCKETREACH_API_KEY ? `${ROCKETREACH_API_KEY.substring(0, 8)}...` : 'NOT SET'}`);
console.log(`Apollo Key: ${APOLLO_API_KEY ? `${APOLLO_API_KEY.substring(0, 8)}...` : 'NOT SET'}`);

// Test RocketReach API
async function testRocketReach() {
    console.log('\n🚀 Testing RocketReach API...');
    try {
        const params = new URLSearchParams();
        params.append('name', 'John Doe');
        params.append('current_employer', 'Test Company');
        
        const url = `https://api.rocketreach.co/api/v2/person/lookup?${params.toString()}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Api-Key': ROCKETREACH_API_KEY
            }
        });
        
        console.log(`Status: ${response.status} ${response.statusText}`);
        
        if (response.status === 401) {
            console.log('❌ RocketReach 401 - Invalid API Key');
            return false;
        } else if (response.status === 200) {
            const data = await response.json();
            console.log('✅ RocketReach API Key is valid');
            console.log('Response:', JSON.stringify(data, null, 2));
            return true;
        } else {
            const text = await response.text();
            console.log(`⚠️ RocketReach unexpected status: ${response.status}`);
            console.log('Response:', text);
            return false;
        }
    } catch (error) {
        console.log('❌ RocketReach API Error:', error.message);
        return false;
    }
}

// Test Apollo API  
async function testApollo() {
    console.log('\n🎯 Testing Apollo API...');
    try {
        const query = {
            first_name: 'John',
            last_name: 'Doe',
            per_page: 1,
            reveal_personal_emails: true,
            reveal_phone_number: true
        };
        
        const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': APOLLO_API_KEY
            },
            body: JSON.stringify(query)
        });
        
        console.log(`Status: ${response.status} ${response.statusText}`);
        
        if (response.status === 401) {
            console.log('❌ Apollo 401 - Invalid API Key');
            return false;
        } else if (response.status === 200) {
            const data = await response.json();
            console.log('✅ Apollo API Key is valid');
            console.log('Response:', JSON.stringify(data, null, 2));
            return true;
        } else {
            const text = await response.text();
            console.log(`⚠️ Apollo unexpected status: ${response.status}`);
            console.log('Response:', text);
            return false;
        }
    } catch (error) {
        console.log('❌ Apollo API Error:', error.message);
        return false;
    }
}

// Run tests
async function runTests() {
    const rocketReachOk = await testRocketReach();
    const apolloOk = await testApollo();
    
    console.log('\n📊 Summary:');
    console.log(`RocketReach: ${rocketReachOk ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`Apollo: ${apolloOk ? '✅ Valid' : '❌ Invalid'}`);
}

runTests().catch(console.error);