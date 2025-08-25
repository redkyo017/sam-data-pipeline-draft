// Enrichment Merger Lambda Function  
// Node.js 20.x (ESM)
// Merges individual enriched contact JSON files and performs cleanup

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

// Initialize AWS clients
const s3Client = new S3Client({});

export const handler = async (event, context) => {
    const requestId = context.awsRequestId;
    const startTime = Date.now();
    
    console.log(`[${requestId}] Enrichment merger started`, {
        event: JSON.stringify(event, null, 2),
        timestamp: new Date().toISOString(),
        functionName: context.functionName,
        memoryLimitInMB: context.memoryLimitInMB,
        remainingTimeInMillis: context.getRemainingTimeInMillis()
    });
    
    let campaign_id = "default-campaign";
    let commit_id = null;
    
    try {
        // Validate environment variables
        if (!process.env.BUCKET_NAME) {
            throw new Error('BUCKET_NAME environment variable not set');
        }
        
        // Extract campaign and commit IDs from event
        if (event.campaign_id) {
            campaign_id = event.campaign_id;
        }
        if (event.commit_id) {
            commit_id = event.commit_id;
        }
        
        console.log(`[${requestId}] Starting merge process`, {
            campaignId: campaign_id,
            commitId: commit_id,
            bucket: process.env.BUCKET_NAME
        });
        
        // Collect individual enriched files from S3
        const individualFiles = await collectIndividualFiles(campaign_id, commit_id, requestId);
        
        if (individualFiles.length === 0) {
            console.warn(`[${requestId}] No individual files found to merge`);
            return {
                statusCode: 200,
                message: 'No files to merge',
                mergedRecords: 0,
                filesProcessed: 0
            };
        }
        
        // Download and merge all individual files
        const mergedData = await mergeIndividualFiles(individualFiles, requestId);
        
        // Write merged file to S3
        const outputKey = await writeMergedFile(mergedData, campaign_id, commit_id, requestId);
        
        // Cleanup individual files
        await cleanupIndividualFiles(individualFiles, requestId);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`[${requestId}] Enrichment merge completed successfully`, {
            mergedRecords: mergedData.length,
            filesProcessed: individualFiles.length,
            outputKey: outputKey,
            processingTimeMs: processingTime,
            campaignId: campaign_id,
            commitId: commit_id,
            timestamp: new Date().toISOString()
        });
        
        return {
            statusCode: 200,
            message: 'Merge completed successfully',
            mergedRecords: mergedData.length,
            filesProcessed: individualFiles.length,
            outputKey: outputKey,
            processingTimeMs: processingTime
        };
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        console.error(`[${requestId}] Error in enrichment merge process`, {
            errorMessage: error.message,
            errorStack: error.stack,
            processingTimeMs: processingTime,
            campaignId: campaign_id,
            commitId: commit_id,
            timestamp: new Date().toISOString()
        });
        
        // Return error result for Step Functions handling
        return {
            statusCode: 500,
            message: `Merge failed: ${error.message}`,
            mergedRecords: 0,
            filesProcessed: 0,
            error: error.message
        };
    }
};

/**
 * Collect individual enriched files from S3 directory
 * @param {string} campaignId - Campaign ID
 * @param {string} commitId - Commit ID  
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Array>} - Array of S3 object keys
 */
async function collectIndividualFiles(campaignId, commitId, requestId) {
    try {
        const prefix = `data/enriched/${campaignId}/${commitId}/individual/`;
        
        console.log(`[${requestId}] Collecting individual files with prefix: ${prefix}`);
        
        const listCommand = new ListObjectsV2Command({
            Bucket: process.env.BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: 1000 // Should be sufficient for batch processing
        });
        
        const response = await s3Client.send(listCommand);
        
        if (!response.Contents || response.Contents.length === 0) {
            console.warn(`[${requestId}] No individual files found with prefix: ${prefix}`);
            return [];
        }
        
        const fileKeys = response.Contents
            .filter(obj => obj.Key.endsWith('.json'))
            .map(obj => obj.Key);
        
        console.log(`[${requestId}] Found ${fileKeys.length} individual files to merge`);
        return fileKeys;
        
    } catch (error) {
        console.error(`[${requestId}] Error collecting individual files:`, error);
        throw new Error(`Failed to collect individual files: ${error.message}`);
    }
}

/**
 * Download and merge individual JSON files
 * @param {Array} fileKeys - Array of S3 object keys
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Array>} - Merged array of contact records
 */
async function mergeIndividualFiles(fileKeys, requestId) {
    const mergedData = [];
    let successfulDownloads = 0;
    let failedDownloads = 0;
    
    console.log(`[${requestId}] Starting download and merge of ${fileKeys.length} files`);
    
    for (let i = 0; i < fileKeys.length; i++) {
        const fileKey = fileKeys[i];
        
        try {
            const getCommand = new GetObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: fileKey
            });
            
            const response = await s3Client.send(getCommand);
            const content = await response.Body.transformToString();
            const contactData = JSON.parse(content);
            
            // Add the contact to merged data
            mergedData.push(contactData);
            successfulDownloads++;
            
            // Log progress for large batches
            if (i > 0 && (i + 1) % 50 === 0) {
                console.log(`[${requestId}] Merged ${i + 1}/${fileKeys.length} files`);
            }
            
        } catch (error) {
            failedDownloads++;
            console.error(`[${requestId}] Error processing file ${fileKey}:`, error.message);
            // Continue with other files instead of failing completely
        }
    }
    
    console.log(`[${requestId}] File merge completed`, {
        totalFiles: fileKeys.length,
        successfulDownloads: successfulDownloads,
        failedDownloads: failedDownloads,
        mergedRecords: mergedData.length
    });
    
    if (mergedData.length === 0) {
        throw new Error('No valid contact records found in individual files');
    }
    
    return mergedData;
}

/**
 * Write merged data to S3 as final output file
 * @param {Array} mergedData - Array of merged contact records
 * @param {string} campaignId - Campaign ID
 * @param {string} commitId - Commit ID
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<string>} - S3 key of the merged file
 */
async function writeMergedFile(mergedData, campaignId, commitId, requestId) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputKey = `data/enriched/${campaignId}/${commitId}/merged/enriched-contacts-${timestamp}.json`;
        
        const outputData = {
            metadata: {
                campaign_id: campaignId,
                commit_id: commitId,
                total_records: mergedData.length,
                merged_at: new Date().toISOString(),
                processing_summary: generateProcessingSummary(mergedData)
            },
            contacts: mergedData
        };
        
        const putCommand = new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: outputKey,
            Body: JSON.stringify(outputData, null, 2),
            ContentType: 'application/json',
            Metadata: {
                'campaign-id': campaignId,
                'commit-id': commitId || 'unknown',
                'record-count': mergedData.length.toString(),
                'merged-at': new Date().toISOString()
            }
        });
        
        await s3Client.send(putCommand);
        
        console.log(`[${requestId}] Merged file written successfully: ${outputKey}`);
        return outputKey;
        
    } catch (error) {
        console.error(`[${requestId}] Error writing merged file:`, error);
        throw new Error(`Failed to write merged file: ${error.message}`);
    }
}

/**
 * Generate processing summary from merged data
 * @param {Array} mergedData - Array of contact records
 * @returns {Object} - Processing summary statistics
 */
function generateProcessingSummary(mergedData) {
    const summary = {
        total_contacts: mergedData.length,
        enrichment_stats: {
            rocketreach_success: 0,
            apollo_success: 0,
            both_sources_success: 0,
            no_enrichment: 0
        },
        contact_data: {
            total_emails_added: 0,
            total_phones_added: 0,
            contacts_with_new_emails: 0,
            contacts_with_new_phones: 0
        }
    };
    
    mergedData.forEach(contact => {
        if (contact.enrichment_metadata) {
            const meta = contact.enrichment_metadata;
            
            // Track enrichment source success
            if (meta.rocketreach_success) summary.enrichment_stats.rocketreach_success++;
            if (meta.apollo_success) summary.enrichment_stats.apollo_success++;
            if (meta.rocketreach_success && meta.apollo_success) summary.enrichment_stats.both_sources_success++;
            if (!meta.rocketreach_success && !meta.apollo_success) summary.enrichment_stats.no_enrichment++;
            
            // Track contact data additions
            if (meta.total_emails_added > 0) {
                summary.contact_data.total_emails_added += meta.total_emails_added;
                summary.contact_data.contacts_with_new_emails++;
            }
            if (meta.total_phones_added > 0) {
                summary.contact_data.total_phones_added += meta.total_phones_added;
                summary.contact_data.contacts_with_new_phones++;
            }
        }
    });
    
    return summary;
}

/**
 * Clean up individual files after successful merge
 * @param {Array} fileKeys - Array of S3 object keys to delete
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<void>}
 */
async function cleanupIndividualFiles(fileKeys, requestId) {
    try {
        console.log(`[${requestId}] Starting cleanup of ${fileKeys.length} individual files`);
        
        // S3 delete can handle up to 1000 objects per request
        const batchSize = 1000;
        let deletedCount = 0;
        
        for (let i = 0; i < fileKeys.length; i += batchSize) {
            const batch = fileKeys.slice(i, i + batchSize);
            
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: process.env.BUCKET_NAME,
                Delete: {
                    Objects: batch.map(key => ({ Key: key })),
                    Quiet: false
                }
            });
            
            const response = await s3Client.send(deleteCommand);
            deletedCount += response.Deleted ? response.Deleted.length : 0;
            
            if (response.Errors && response.Errors.length > 0) {
                console.warn(`[${requestId}] Some files failed to delete:`, response.Errors);
            }
        }
        
        console.log(`[${requestId}] Cleanup completed: ${deletedCount}/${fileKeys.length} files deleted`);
        
    } catch (error) {
        console.error(`[${requestId}] Error during cleanup:`, error);
        // Don't throw - cleanup failure shouldn't fail the merge operation
        console.warn(`[${requestId}] Continuing despite cleanup failure`);
    }
}