exports.handler = async (event, context) => {
  console.log("Validating batch format: ", event);
  
  // Extract items from the ItemBatcher structure
  let items = [];
  if (event.Items && Array.isArray(event.Items)) {
    // Extract the CSV row data from each item in the batch
    items = event.Items.map(item => item.items);
  } else if (event.items) {
    // Fallback for single item
    items = Array.isArray(event.items) ? event.items : [event.items];
  } else {
    // Fallback for direct event
    items = Array.isArray(event) ? event : [event];
  }
  let isValid = false;
  
  const validColumnNames = [
    // Original expected columns
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
    "Country",
  ];
  
  // Check if all items in the batch have valid columns
  if (items.length > 0) {
    isValid = true;
    for (const item of items) {
      if (item && typeof item === 'object') {
        for (const columnName in item) {
          if (!validColumnNames.includes(columnName)) {
            console.log(`Invalid column found: ${columnName} in item:`, item);
            isValid = false;
            break;
          }
        }
      } else {
        isValid = false;
        break;
      }
      if (!isValid) break;
    }
  }

  return {
    isValidInputFormat: isValid,
    items: items, // Return the batch of items
  };
};
