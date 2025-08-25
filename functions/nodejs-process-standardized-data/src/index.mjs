// Node.js 20+
// Expects the Step Functions input to be either:
//   1) an array of objects (event is the array), or
//   2) { items: [...] } where items is the array.
//
// Set env vars: BUCKET_NAME, (optional) KEY_PREFIX

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export const handler = async (event) => {
  console.log(
    "Processing standardized data event:",
    JSON.stringify(event, null, 2),
  );

  // Extract execution ID and data from the payload structure
  const executionId = event?.executionId || "unknown-execution";
  const actualData = event?.data || event;

  // Get standardized data from the correct path
  // When ResultPath is "$.standardization", the Lambda result is stored in actualData.standardization.Payload
  const rows = actualData?.standardization?.Payload || [];
  console.log("Extracted standardized rows:", rows);

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("No standardized rows found in input");
    return {
      bucket: process.env.BUCKET_NAME,
      key: null,
    };
  }

  // The standardized rows already include campaign_id and commit_id from the standardization function
  // No need to add them again, just use the enriched data as-is
  const enrichedRows = rows;

  // Create JSON output
  const jsonBody = JSON.stringify(enrichedRows, null, 2);

  // Target S3 location with execution-specific path
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) throw new Error("BUCKET_NAME env var is required.");

  // Use the execution ID passed from the state machine

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomId = Math.floor(Math.random() * 1000000);
  const key = `temp-batch-files/${executionId}/batch-${timestamp}-${randomId}.json`;
  // Upload
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: jsonBody,
      ContentType: "application/json; charset=utf-8",
    }),
  );

  // Return only essential S3 location to avoid 32KB Step Functions limit
  console.log(
    `Successfully saved batch to s3://${bucket}/${key} (${rows.length} records)`,
  );
  return {
    bucket,
    key,
  };
};
