export const ENRICH_DATA_STRUCTURE = {
  id: "", // string
  commit_id: "", // string
  campaign_id: "", // string
  first_name: "", // string
  last_name: "", // string
  company_name: "", // string
  job_title: "", // string
  country: "", // string
  linkedin_url: "", // string
  address1: "", // string
  address2: "", // string
  city: "", // string
  state: "", // string
  zip_code: "", // string
  status: "", // string e.g "created"
  emails: [
    {
      id: "", // string
      value: "", // string e.g "john.doe@email.com"
      priority: 1, // number e.g 1
    },
    {
      id: "", // string
      value: "", // string "john.alt@email.com",
      priority: 2, // number e.g 1
    },
  ],
  phones: [
    {
      id: "", // string
      value: "", // string e.g "+1-555-111111"
      priority: 1, // string e.g 1
    },
    {
      id: "", // string
      value: "", // string e.g "+1-555-222222"
      priority: 2, // number  e.g 2
    },
  ],
};
