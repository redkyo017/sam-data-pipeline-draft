// S3 File Writing Utilities for Enrichment Processor
// Handles individual contact file writing to S3

import { PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Write enriched contact data to S3 as individual JSON file
 * @param {Object} s3Client - AWS S3 client instance
 * @param {Object} enrichedContact - Enriched contact data
 * @param {string} campaignId - Campaign ID for path organization
 * @param {string} commitId - Commit ID for path organization
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<string|null>} - S3 file key if successful, null if failed
 */
export async function writeEnrichedContactToS3(s3Client, enrichedContact, campaignId, commitId, requestId) {
    try {
        // Generate unique filename for the contact
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const contactId = enrichedContact.id || 
                         `${enrichedContact.first_name || 'unknown'}-${enrichedContact.last_name || 'unknown'}`
                         .toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        // Create S3 key following the pattern: data/enriched/{campaign_id}/{commit_id}/individual/{timestamp}-{contact_id}.json
        const s3Key = `data/enriched/${campaignId}/${commitId}/individual/${timestamp}-${contactId}.json`;
        
        // Prepare contact data for storage (following OUTPUT_DATA_STRUCTURE format)
        const contactData = {
            ...enrichedContact,
            // Ensure consistent structure
            processed_at: new Date().toISOString(),
            file_key: s3Key
        };
        
        // Write to S3
        const putCommand = new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: s3Key,
            Body: JSON.stringify(contactData, null, 2),
            ContentType: 'application/json',
            Metadata: {
                'campaign-id': campaignId,
                'commit-id': commitId || 'unknown',
                'contact-name': `${enrichedContact.first_name || 'unknown'} ${enrichedContact.last_name || 'unknown'}`,
                'enrichment-sources': enrichedContact.enrichment_metadata?.enrichment_sources?.join(',') || 'none'
            }
        });
        
        await s3Client.send(putCommand);
        
        console.log(`[${requestId}] Successfully wrote enriched contact to S3: ${s3Key}`);
        return s3Key;
        
    } catch (error) {
        console.error(`[${requestId}] Error writing enriched contact to S3:`, error);
        return null;
    }
}