// Node.js 20+ (ESM)
// Env:
//   OUTPUT_BUCKET (required) - target bucket for the merged JSON
//   OUTPUT_PREFIX (optional) - e.g. "merged"
// Input shape (one of):
//   { sources: [{ bucket: "b1", key: "a.json" }, { bucket: "b1", key: "b.json" }], outputKey?: "my/merged.json" }
//   { bucket: "b1", keys: ["a.json", "b.json"], outputKey?: "my/merged.json" }

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand, } from "@aws-sdk/client-s3";
import {OUTPUT_DATA_STRUCTURE} from "./output_data_structure.mjs";
const s3 = new S3Client({});

// Transform input data to OUTPUT_DATA_STRUCTURE format
const transformToOutputStructure = (inputData, campaign_id, commit_id) => {
  return {
    campaign_id: campaign_id || inputData.campaign_id || "",
    commit_id: commit_id || inputData.commit_id || "",
    first_name: inputData.first_name || "",
    last_name: inputData.last_name || "",
    company_name: inputData.company_name || "",
    job_title: inputData.job_title || "",
    country: inputData.country || "",
    linkedin_url: inputData.linkedin_url || "",
    address1: inputData.address1 || "",
    address2: inputData.address2 || "",
    city: inputData.city || "",
    state: inputData.state || "",
    zip_code: inputData.zip_code || "",
    status: inputData.status || "created",
    emails: inputData.email ? [{ email: inputData.email, priority: 1 }] : [],
    phones: inputData.phone ? [{ phone: inputData.phone, priority: 1 }] : []
  };
};

// Deduplicate records based on first_name, last_name, and linkedin_url
const deduplicateRecords = (records) => {
  const uniqueRecords = new Map();
  
  for (const record of records) {
    const key = `${record.first_name}|${record.last_name}|${record.linkedin_url}`;
    
    if (uniqueRecords.has(key)) {
      // Merge with existing record
      const existing = uniqueRecords.get(key);
      
      // Add new email if provided and not already present
      if (record.emails && record.emails.length > 0) {
        const newEmail = record.emails[0];
        const emailExists = existing.emails.some(e => e.email === newEmail.email);
        if (!emailExists) {
          const nextEmailPriority = Math.max(...existing.emails.map(e => e.priority), 0) + 1;
          existing.emails.push({ email: newEmail.email, priority: nextEmailPriority });
        }
      }
      
      // Add new phone if provided and not already present
      if (record.phones && record.phones.length > 0) {
        const newPhone = record.phones[0];
        const phoneExists = existing.phones.some(p => p.phone === newPhone.phone);
        if (!phoneExists) {
          const nextPhonePriority = Math.max(...existing.phones.map(p => p.priority), 0) + 1;
          existing.phones.push({ phone: newPhone.phone, priority: nextPhonePriority });
        }
      }
      
      // Update other fields if they were empty in existing record
      Object.keys(record).forEach(field => {
        if (field !== 'emails' && field !== 'phones' && 
            (!existing[field] || existing[field] === "") && 
            (record[field] && record[field] !== "")) {
          existing[field] = record[field];
        }
      });
      
    } else {
      // New unique record
      uniqueRecords.set(key, record);
    }
  }
  
  return Array.from(uniqueRecords.values());
};

// Typed errors (nice for Step Functions Catch)
class InputValidationError extends Error { constructor(m, d){ super(m); this.name="InputValidationError"; this.details=d; } }
class S3ReadError extends Error { constructor(m, d){ super(m); this.name="S3ReadError"; this.details=d; } }
class S3WriteError extends Error { constructor(m, d){ super(m); this.name="S3WriteError"; this.details=d; } }


const normalizeSources = (event) => {
  // if (Array.isArray(event) && event.every(s => s.bucket && s.key)) {
  //   return event;
  // }
  // if (event?.bucket && Array.isArray(event?.keys)) {
  //   return event.keys.map(key => ({ bucket: event.bucket, key }));
  // }
  const sources = []
  if (Array.isArray(event)) {
    event.forEach(item => {
      // const {Payload={}} = item;
      const {bucket, key} = item;
      if (bucket && key) {
        sources.push(item);
      }
    })
    return sources
  }
  return null;
};

// Batch-delete up to 1000 keys at a time per bucket
const deleteSources = async (sources, outBucket, outKey) => {
  console.log(`Starting cleanup of ${sources.length} temporary files`);
  console.log('Files to delete:', sources.map(s => `s3://${s.bucket}/${s.key}`));
  
  // group by bucket & dedupe, only delete temp files
  const byBucket = new Map();
  for (const { bucket, key } of sources) {
    // never delete the output object if it happens to be in the same bucket/prefix
    if (bucket === outBucket && key === outKey) {
      console.log(`Skipping output file: s3://${bucket}/${key}`);
      continue;
    }
    
    // Only delete files in temp-batch-files folder for safety
    if (!key.startsWith('temp-batch-files/')) {
      console.log(`Skipping non-temp file: s3://${bucket}/${key}`);
      continue;
    }
    
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
    byBucket.get(bucket).add(key);
  }

  let attempted = 0, deleted = 0;
  const errors = [];

  for (const [bucket, keySet] of byBucket.entries()) {
    const keys = [...keySet].map((k) => ({ Key: k }));
    console.log(`Deleting ${keys.length} files from bucket: ${bucket}`);
    
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      attempted += chunk.length;
      console.log(`Deleting batch of ${chunk.length} files...`);
      
      try {
        const resp = await s3.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk, Quiet: false }, // Set to false for better debugging
        }));
        
        const deletedCount = resp.Deleted?.length || 0;
        deleted += deletedCount;
        console.log(`Successfully deleted ${deletedCount} files`);
        
        if (resp.Errors && resp.Errors.length > 0) {
          console.log(`Delete errors: ${resp.Errors.length}`);
          for (const e of resp.Errors) {
            const error = { bucket, key: e.Key, code: e.Code, message: e.Message };
            console.error('Delete error:', error);
            errors.push(error);
          }
        }
      } catch (e) {
        const error = {
          bucket,
          chunkSize: chunk.length,
          name: e?.name,
          statusCode: e?.$metadata?.httpStatusCode,
          message: e?.message,
        };
        console.error('Delete operation failed:', error);
        errors.push(error);
      }
    }
  }
  
  console.log(`Cleanup completed: attempted=${attempted}, deleted=${deleted}, errors=${errors.length}`);
  return { attempted, deleted, errors };
};

export const handler = async (event = {}) => {
  try {
    console.log("Event received:", JSON.stringify(event, null, 2));
    
    // Extract metadata from the event (passed from Step Functions state)
    const executionId = event.executionId;
    let campaign_id = event.campaign_id || null;
    let commit_id = event.commit_id || null;
    
    const sources = normalizeSources(event.data || event);
    if (!sources || sources.length === 0) {
      throw new InputValidationError("Provide sources as [{bucket,key},...] or {bucket, keys: [...]}", { eventSnippet: Object.keys(event || {}) });
    }

    const outBucket = process.env.OUTPUT_BUCKET;
    if (!outBucket) throw new InputValidationError("Missing OUTPUT_BUCKET env var.");

    // Use the new path structure: campaigns/{campaign_id}/{commit_id}/{execution_id}.json
    const outKey = event.outputKey || `campaigns/${campaign_id}/${commit_id}/${executionId}.json`;

    // Collect all JSON data from source files
    const allData = [];
    let firstFileProcessed = false;
    
    for (const { bucket, key } of sources) {
      let obj;
      try {
        obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      } catch (e) {
        throw new S3ReadError(`Failed to read s3://${bucket}/${key}`, {
          bucket, key, s3Error: e?.name, message: e?.message, statusCode: e?.$metadata?.httpStatusCode
        });
      }

      // Read the entire JSON file content
      const chunks = [];
      for await (const chunk of obj.Body) {
        chunks.push(chunk);
      }
      const jsonContent = Buffer.concat(chunks).toString('utf-8');
      
      try {
        const data = JSON.parse(jsonContent);
        if (Array.isArray(data)) {
          // Extract campaign_id and commit_id from the first file's first record if not provided in event
          if (!firstFileProcessed && data.length > 0) {
            campaign_id = campaign_id || data[0].campaign_id || "unknown-campaign";
            commit_id = commit_id || data[0].commit_id || "unknown-commit";
            firstFileProcessed = true;
            console.log(`Using campaign_id=${campaign_id}, commit_id=${commit_id}`);
          }
          
          // Transform each record to OUTPUT_DATA_STRUCTURE format
          const transformedData = data.map(record => transformToOutputStructure(record, campaign_id, commit_id));
          allData.push(...transformedData);
        } else {
          console.warn(`File s3://${bucket}/${key} does not contain a JSON array, skipping`);
        }
      } catch (parseError) {
        throw new S3ReadError(`Failed to parse JSON from s3://${bucket}/${key}`, {
          bucket, key, parseError: parseError.message
        });
      }
    }

    // Ensure we have campaign_id and commit_id even if no data was processed
    campaign_id = campaign_id || "unknown-campaign";
    commit_id = commit_id || "unknown-commit";
    
    // Deduplicate records based on first_name, last_name, and linkedin_url
    console.log(`Total records before deduplication: ${allData.length}`);
    const deduplicatedData = deduplicateRecords(allData);
    console.log(`Total records after deduplication: ${deduplicatedData.length}`);
    
    // Create merged JSON content
    const mergedJsonBody = JSON.stringify(deduplicatedData, null, 2);

    // Upload merged JSON file
    await s3.send(new PutObjectCommand({
      Bucket: outBucket,
      Key: outKey,
      Body: mergedJsonBody,
      ContentType: "application/json; charset=utf-8"
    }));

    // Delete input files (best effort). We don't fail the merge if deletions partially fail.
    const deletion = await deleteSources(sources, outBucket, outKey);

    return { 
      ok: true, 
      bucket: outBucket, 
      key: outKey, 
      mergedCount: sources.length, 
      totalRecordsBeforeDedup: allData.length,
      totalRecordsAfterDedup: deduplicatedData.length,
      deletion 
    };
  } catch (err) {
    console.error("Merge error", {
      name: err?.name, message: err?.message, details: err?.details, stack: err?.stack
    });
    // Re-throw for Step Functions Catch or CloudWatch alerting
    throw err instanceof Error ? err : new Error(String(err));
  }
};
