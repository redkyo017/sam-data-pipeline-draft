export const handler = async (event) => {
  const items = event?.items || [];
  const results = [];
  for (const item of items) {
    results.push({
      first_name: item["First Name"],
      last_name: item["Last Name"],
      email: item["Email"],
      phone: item["Phone"],
      address1: item["Address 1"],
      address2: item["Address 2"],
      city: item["City"],
      state: item["State"],
      zip_code: item["Zip"],
      country: item["Country"],
      company_name: item["Organization Name (Parent)"],
      job_title: item["Title"],
      linked_in_url: item["LinkedIn"],
    })
  }
  return results;
};
