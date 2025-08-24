// Node.js 20+ (ESM)
// Env:
//   OUTPUT_BUCKET (required) - target bucket for the merged CSV
//   OUTPUT_PREFIX (optional) - e.g. "merged"
// Input shape (one of):
//   { sources: [{ bucket: "b1", key: "a.csv" }, { bucket: "b1", key: "b.csv" }], outputKey?: "my/merged.csv" }
//   { bucket: "b1", keys: ["a.csv", "b.csv"], outputKey?: "my/merged.csv" }

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand, } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const s3 = new S3Client({});

// Typed errors (nice for Step Functions Catch)
class InputValidationError extends Error { constructor(m, d){ super(m); this.name="InputValidationError"; this.details=d; } }
class S3ReadError extends Error { constructor(m, d){ super(m); this.name="S3ReadError"; this.details=d; } }
class S3WriteError extends Error { constructor(m, d){ super(m); this.name="S3WriteError"; this.details=d; } }

// Transform that drops the first line (header) from a CSV stream.
class SkipHeaderTransform extends Transform {
  constructor() { super(); this.skipped = false; this.buffer = Buffer.alloc(0); }
  _transform(chunk, _, cb) {
    if (this.skipped) { this.push(chunk); return cb(); }
    // Accumulate until we find the first '\n'
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const idx = this.buffer.indexOf(0x0A); // '\n'
    if (idx === -1) return cb(); // keep buffering

    // Drop header up through '\n'. Handle CRLF by trimming optional '\r' too.
    let start = idx + 1;
    // If it's CRLF and the byte before '\n' was '\r', header ends at that '\r'
    // (already dropped since we cut after '\n')
    const rest = this.buffer.subarray(start);
    this.push(rest);
    this.buffer = Buffer.alloc(0);
    this.skipped = true;
    cb();
  }
  _flush(cb) {
    // If stream ended before any newline, that file had only a header line; drop it.
    this.buffer = Buffer.alloc(0);
    cb();
  }
}

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
    const sources = normalizeSources(event);
    if (!sources || sources.length === 0) {
      throw new InputValidationError("Provide sources as [{bucket,key},...] or {bucket, keys: [...]}", { eventSnippet: Object.keys(event || {}) });
    }

    const outBucket = process.env.OUTPUT_BUCKET;
    if (!outBucket) throw new InputValidationError("Missing OUTPUT_BUCKET env var.");

    // const prefix = (process.env.OUTPUT_PREFIX || "merged").replace(/\/+$/, "");
    const prefix = 'test-merge';
    const outKey =
      event.outputKey ||
      `${prefix}/merged-${new Date().toISOString().replace(/[:]/g, "-")}.csv`;

    // Writable that the multipart uploader will read from
    const outStream = new PassThrough();

    // Multipart upload (streams Body)
    const uploader = new Upload({
      client: s3,
      params: {
        Bucket: outBucket,
        Key: outKey,
        Body: outStream,
        ContentType: "text/csv; charset=utf-8",
      },
      // Tune these for throughput vs. memory; defaults are fine too
      queueSize: 4,                 // parallel parts
      partSize: 8 * 1024 * 1024,    // 8 MB
      leavePartsOnError: false,
    });

    // Kick off the upload; we'll feed the stream below then await done()
    const uploadPromise = uploader.done();

    // Stream each file into outStream, skipping header on all but the first
    for (let i = 0; i < sources.length; i++) {
      const { bucket, key } = sources[i];
      let obj;
      try {
        obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      } catch (e) {
        throw new S3ReadError(`Failed to read s3://${bucket}/${key}`, {
          bucket, key, s3Error: e?.name, message: e?.message, statusCode: e?.$metadata?.httpStatusCode
        });
      }

      const bodyStream = obj.Body; // Node.js Readable

      // Add a newline between files to be safe (harmless if previous already ended with \n)
      if (i > 0) outStream.write("\n");

      if (i === 0) {
        // First file: write it whole (including its header)
        await pipeline(bodyStream, outStream, { end: false });
      } else {
        // Subsequent files: drop their header line via a transform
        const skipHeader = new SkipHeaderTransform();
        await pipeline(bodyStream, skipHeader, outStream, { end: false });
      }
    }

    // Close the output stream and wait for S3 to finish the multipart upload
    outStream.end();
    await uploadPromise;

    // Delete input files (best effort). We don't fail the merge if deletions partially fail.
    const deletion = await deleteSources(sources, outBucket, outKey);

    return { ok: true, bucket: outBucket, key: outKey, mergedCount: sources.length, deletion };
  } catch (err) {
    console.error("Merge error", {
      name: err?.name, message: err?.message, details: err?.details, stack: err?.stack
    });
    // Re-throw for Step Functions Catch or CloudWatch alerting
    throw err instanceof Error ? err : new Error(String(err));
  }
};