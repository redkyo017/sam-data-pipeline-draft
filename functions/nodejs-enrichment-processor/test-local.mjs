// Local test script for enrichment processor
import { handler } from "./src/index.mjs";

// Mock AWS context
const mockContext = {
  awsRequestId: "local-test-" + Date.now(),
  functionName: "EnrichmentProcessorFunction-Local",
  memoryLimitInMB: 512,
  getRemainingTimeInMillis: () => 30000,
};

// Test event data
const testEvent = {
  Items: [
    {
      items: {
        campaign_id: "123_test",
        commit_id: "90f2bbb7-0cb7-4948-9cc2-0a9ec750640c",
        first_name: "Tucker",
        last_name: "Carlson",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/richard-brian-tucker-63a62b46",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "90f2bbb7-0cb7-4948-9cc2-0a9ec750640c",
        first_name: "Dan",
        last_name: "Bongino",
        company_name: "",
        job_title: "",
        country: "",
        // linkedin_url: "https://klout.com/dbongino",
        linkedin_url: "https://linkedin.com/in/donald-trump-jr-4454b862",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "Sean",
        last_name: "Hannity",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/sean-hannity/51/221/567",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "James",
        last_name: "Woods",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/cruzted",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "James",
        last_name: "Woods",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/benshapiro708",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "Rand",
        last_name: "Paul",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/kayleigh-mcenany-361ab1b6",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "Laura",
        last_name: "Ingraham",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/thomas-fitton-805a626",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "Ron",
        last_name: "DeSantis",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/scott-presler-b13783101",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "Donald",
        last_name: "Trump",
        company_name: "",
        job_title: "",
        country: "",
        linkedin_url: "https://linkedin.com/in/erictrump",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
    {
      items: {
        campaign_id: "123_test",
        commit_id: "cd6b560c-dde5-4d99-8af9-1ce8631efb57",
        first_name: "Candace",
        last_name: "Owens",
        company_name: "CANDACEOWENS.COM",
        job_title: "Public Figure",
        country: "",
        linkedin_url: "https://linkedin.com/in/jackposobiec",
        address1: "",
        address2: "",
        city: "",
        state: "",
        zip_code: "",
        status: "created",
        emails: [],
        phones: [],
      },
      commit_id: "8ad4fc1e-30cd-4180-befb-9b5eb8933bcf",
      campaign_id: "123_test",
    },
  ],
};

// Set test environment variables
process.env.ROCKETREACH_API_KEY = "";
process.env.APOLLO_API_KEY = "";
process.env.BUCKET_NAME = "sam-data-pipeline-input-bucket-staging";
process.env.ROCKETREACH_API_KEY_PARAM = "/test/rocketreach-key";
process.env.APOLLO_API_KEY_PARAM = "/test/apollo-key";

console.log("🧪 Starting local enrichment processor test...\n");
console.log("📝 Test Event:", JSON.stringify(testEvent, null, 2));
console.log("\n🔧 Environment Variables:");
console.log(
  "- ROCKETREACH_STAGING_KEY:",
  process.env.ROCKETREACH_STAGING_KEY ? "✅ Set" : "❌ Not set",
);
console.log(
  "- APOLLO_STAGING_KEY:",
  process.env.APOLLO_STAGING_KEY ? "✅ Set" : "❌ Not set",
);
console.log("- BUCKET_NAME:", process.env.BUCKET_NAME);

console.log("\n🚀 Invoking handler...\n");

try {
  const result = await handler(testEvent, mockContext);
  console.log("\n✅ Handler completed successfully!");
  console.log("📊 Result:", JSON.stringify(result, null, 2));

  // Print summary
  if (Array.isArray(result) && result.length > 0) {
    const enrichedCount = result.filter(
      (contact) =>
        contact.enrichment_metadata &&
        (contact.enrichment_metadata.rocketreach_success ||
          contact.enrichment_metadata.apollo_success),
    ).length;

    console.log(
      `\n📈 Summary: ${enrichedCount}/${result.length} contacts successfully enriched`,
    );
  }
} catch (error) {
  console.error("\n❌ Handler failed:");
  console.error("Error:", error.message);
  console.error("Stack:", error.stack);
}
