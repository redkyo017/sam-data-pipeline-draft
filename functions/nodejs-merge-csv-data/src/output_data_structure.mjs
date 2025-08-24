export const OUTPUT_DATA_STRUCTURE = {
  campaign_id: "string",
  commit_id: "string",
  first_name: "string",
  last_name: "string",
  company_name: "string",
  job_title: "string",
  country: "string",
  linkedin_url: "string",
  address1: "string",
  address2: "string",
  city: "string",
  state: "string",
  zip_code: "string",
  status: "string", // "created"
  emails: [
    {
      email: "string", //e.g "john.doe@email.com"
      priority: 1, // e.g 1
    },
    {
      email: "string", //"john.alt@email.com",
      priority: 1, // e.g 1
    },
  ],
  phones: [
    {
      phone: "string", // e.g "+1-555-111111"
      priority: 1, // e.g 1
    },
    {
      phone: "string", // e.g "+1-555-222222"
      priority: 1, // e.g 2
    },
  ],
};