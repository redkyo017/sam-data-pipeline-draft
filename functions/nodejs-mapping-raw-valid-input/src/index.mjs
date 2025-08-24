export const handler = async (event) => {
  console.log("Mapping batch of items:", event);
  
  let items = [];
  let campaign_id = "default-campaign";
  let commit_id = null;
  
  if (event.Items && Array.isArray(event.Items)) {
    // Extract from ItemBatcher structure
    items = event.Items.map(item => item.items);
    // Get campaign_id and commit_id from the first item (they should be the same for all items in batch)
    if (event.Items.length > 0) {
      campaign_id = event.Items[0].campaign_id || "default-campaign";
      commit_id = event.Items[0].commit_id;
    }
  } else {
    // Fallback for direct structure
    campaign_id = event?.campaign_id || "default-campaign";
    commit_id = event?.commit_id;
    items = Array.isArray(event?.items) ? event.items : (event?.items ? [event.items] : []);
  }
  
  const results = [];
  
  for (const item of items) {
    results.push({
      campaign_id: campaign_id,
      commit_id: commit_id,
      first_name: item["First Name"] || "",
      last_name: item["Last Name"] || "",
      email: item["Email"] || "",
      phone: item["Phone"] || "",
      address1: item["Address 1"] || "",
      address2: item["Address 2"] || "",
      city: item["City"] || "",
      state: item["State"] || "",
      zip_code: item["Zip"] || "",
      country: item["Country"] || "",
      company_name: item["Organization Name (Parent)"] || "",
      job_title: item["Title"] || "",
      linkedin_url: item["LinkedIn"] || "",
    });
  }
  
  console.log(`Successfully mapped ${results.length} records in batch`);
  return results; // Return array of mapped objects for the batch
};
