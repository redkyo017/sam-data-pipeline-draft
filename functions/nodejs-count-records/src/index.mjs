// Count Records Lambda Function
// Node.js 20.x (ESM)
// Counts total records in S3 files for pipeline progress tracking

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});

export const handler = async (event, context) => {
    const requestId = context.awsRequestId;
    
    console.log(`[${requestId}] Count records function started`, {
        event: JSON.stringify(event, null, 2),
        timestamp: new Date().toISOString()
    });
    
    try {
        // Extract S3 parameters from event
        let bucket, key;
        
        if (event.Bucket && event.Key) {
            // Direct parameters
            bucket = event.Bucket;
            key = event.Key;
        } else if (event.bucket && event.key) {
            // Lowercase parameters
            bucket = event.bucket;
            key = event.key;
        } else {
            throw new Error('Missing required S3 bucket and key parameters');
        }
        
        console.log(`[${requestId}] Counting records in s3://${bucket}/${key}`);
        
        // Get the file from S3
        const getObjectCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });
        
        const response = await s3Client.send(getObjectCommand);
        
        // Read the file content
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const fileContent = Buffer.concat(chunks).toString('utf-8');
        
        // Determine file type and count records
        let totalRecords;
        const fileExtension = key.toLowerCase().split('.').pop();
        
        if (fileExtension === 'json') {
            totalRecords = countJsonRecords(fileContent, requestId);
        } else if (fileExtension === 'csv') {
            totalRecords = countCsvRecords(fileContent, requestId);
        } else {
            // Try to detect format from content
            if (fileContent.trim().startsWith('[') || fileContent.trim().startsWith('{')) {
                totalRecords = countJsonRecords(fileContent, requestId);
            } else {
                // Default to CSV format
                totalRecords = countCsvRecords(fileContent, requestId);
            }
        }
        
        console.log(`[${requestId}] Total records counted: ${totalRecords}`);
        
        return {
            statusCode: 200,
            totalRecords: totalRecords,
            Bucket: bucket,
            Key: key,
            fileType: fileExtension
        };
        
    } catch (error) {
        console.error(`[${requestId}] Error counting records:`, {
            errorMessage: error.message,
            errorStack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        // Return 0 count on error rather than failing the pipeline
        return {
            statusCode: 500,
            totalRecords: 0,
            error: error.message
        };
    }
};

/**
 * Count records in JSON file
 * @param {string} content - File content as string
 * @param {string} requestId - Request ID for logging
 * @returns {number} - Number of records
 */
function countJsonRecords(content, requestId) {
    try {
        const data = JSON.parse(content);
        
        if (Array.isArray(data)) {
            console.log(`[${requestId}] JSON array detected with ${data.length} records`);
            return data.length;
        } else if (typeof data === 'object' && data !== null) {
            console.log(`[${requestId}] JSON object detected, counting as 1 record`);
            return 1;
        } else {
            console.log(`[${requestId}] JSON primitive detected, counting as 1 record`);
            return 1;
        }
        
    } catch (parseError) {
        console.error(`[${requestId}] Failed to parse JSON:`, parseError.message);
        return 0;
    }
}

/**
 * Count records in CSV file
 * @param {string} content - File content as string  
 * @param {string} requestId - Request ID for logging
 * @returns {number} - Number of records
 */
function countCsvRecords(content, requestId) {
    try {
        const lines = content.split('\n');
        
        // Filter out empty lines
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        
        // Subtract 1 for header row (if exists)
        const recordCount = Math.max(0, nonEmptyLines.length - 1);
        
        console.log(`[${requestId}] CSV detected: ${nonEmptyLines.length} total lines, ${recordCount} data records (excluding header)`);
        
        return recordCount;
        
    } catch (error) {
        console.error(`[${requestId}] Failed to count CSV records:`, error.message);
        return 0;
    }
}