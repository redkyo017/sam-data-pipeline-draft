exports.handler = async (event, context) => {
  console.log("Validating input format: ", event);
  const items = event?.input?.Items || [];
  let isValid = false;
  const validColumnNames = [
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
  if (items.length > 0) {
    isValid = true;
    for (const columnName in items[0]) {
      if (!validColumnNames.includes(columnName)) {
        isValid = false;
        break;
      }
    }
  }

  return {
    isValidInputFormat: isValid,
    items: items,
  };
};
