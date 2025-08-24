// Node.js 20+
// Expects the Step Functions input to be either:
//   1) an array of objects (event is the array), or
//   2) { items: [...] } where items is the array.
//
// Set env vars: BUCKET_NAME, (optional) KEY_PREFIX

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export const handler = async (event) => {
  console.log("Processing standardized data event:", JSON.stringify(event, null, 2));
  
  // Extract execution ID and data from the new payload structure
  const executionId = event?.executionId || 'unknown-execution';
  const actualData = event?.data || event;
  
  // Get standardized data from the correct path
  // When ResultPath is "$.standardization", the Lambda result is stored in actualData.standardization.Payload
  const rows = actualData?.standardization?.Payload || [];
  console.log("Extracted standardized rows:", rows);
  // TODO - deduplicate
  // TODO - change to output as JSON with new format
  
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("No standardized rows found in input");
    return {
      bucket: process.env.BUCKET_NAME,
      key: null
    };
  }

  // Build a stable header across all objects (union of keys)
  const headerSet = new Set();
  for (const r of rows) {
    if (r && typeof r === "object") {
      Object.keys(r).forEach(k => headerSet.add(k));
    }
  }
  const headers = [...headerSet];

  // CSV escaping (RFC4180-ish)
  const esc = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    // if contains quote, comma, CR or LF, wrap with quotes and escape quotes
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  // Build CSV text
  const lines = [];
  lines.push(headers.map(esc).join(","));
  for (const r of rows) {
    const line = headers.map(h => esc(r?.[h]));
    lines.push(line.join(","));
  }
  const csvBody = lines.join("\n");

  // Target S3 location with execution-specific path
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) throw new Error("BUCKET_NAME env var is required.");
  
  // Use the execution ID passed from the state machine
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomId = Math.floor(Math.random() * 1000000);
  const key = `temp-batch-files/${executionId}/batch-${timestamp}-${randomId}.csv`;
  // Upload
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: csvBody,
    ContentType: "text/csv; charset=utf-8"
  }));

  // Return only essential S3 location to avoid 32KB Step Functions limit
  console.log(`Successfully saved batch to s3://${bucket}/${key} (${rows.length} records)`);
  return {
    bucket,
    key
  };
};