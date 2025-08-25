// Enrichment Processor Lambda Function
// Node.js 20.x (ESM)
// Enriches contact data with RocketReach and Apollo.io APIs

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client } from "@aws-sdk/client-s3";
import { searchContact as rocketreachSearch } from './rocketreach-api.mjs';
import { searchContact as apolloSearch } from './apollo-api.mjs';
import { writeEnrichedContactToS3 } from './s3-writer.mjs';

// Initialize AWS clients
const ssmClient = new SSMClient({});
const s3Client = new S3Client({});

// Cache for API keys to avoid repeated Parameter Store calls
let apiKeyCache = {};

export const handler = async (event, context) => {
    const requestId = context.awsRequestId;
    const startTime = Date.now();
    
    console.log(`[${requestId}] Enrichment processor started`, {
        event: JSON.stringify(event, null, 2),
        timestamp: new Date().toISOString(),
        functionName: context.functionName,
        memoryLimitInMB: context.memoryLimitInMB,
        remainingTimeInMillis: context.getRemainingTimeInMillis()
    });
    
    let batchItems = [];
    let campaign_id = "default-campaign";
    let commit_id = null;
    
    try {
        // Comprehensive input validation
        if (!event) {
            throw new Error('Event object is null or undefined');
        }
        
        // Extract batch items following existing patterns from nodejs-standardization
        if (event.Items && Array.isArray(event.Items)) {
            // Extract from ItemBatcher structure
            batchItems = event.Items.map(item => {
                if (!item || !item.items) {
                    console.warn(`[${requestId}] Invalid item structure in batch, skipping:`, item);
                    return null;
                }
                return item.items;
            }).filter(Boolean); // Remove null items
            // Get campaign_id and commit_id from the first item
            if (event.Items.length > 0) {
                campaign_id = event.Items[0].campaign_id || "default-campaign";
                commit_id = event.Items[0].commit_id;
            }
        } else {
            // Fallback for direct structure
            campaign_id = event?.campaign_id || "default-campaign";
            commit_id = event?.commit_id;
            const items = Array.isArray(event?.items) ? event.items : (event?.items ? [event.items] : (event || []));
            batchItems = Array.isArray(items) ? items : [items];
        }
        
        // Validate batch has processable items
        if (!batchItems || batchItems.length === 0) {
            console.warn(`[${requestId}] No valid items to process in batch`);
            return [];
        }
        
        // Log batch processing start with detailed context
        console.log(`[${requestId}] Starting enrichment processing`, {
            batchSize: batchItems.length,
            campaignId: campaign_id,
            commitId: commit_id,
            inputStructure: event.Items ? 'ItemBatcher' : 'Direct',
            timestamp: new Date().toISOString()
        });
        
        // Validate environment variables
        if (!process.env.ROCKETREACH_API_KEY_PARAM) {
            throw new Error('ROCKETREACH_API_KEY_PARAM environment variable not set');
        }
        
        if (!process.env.APOLLO_API_KEY_PARAM) {
            throw new Error('APOLLO_API_KEY_PARAM environment variable not set');
        }
        
        if (!process.env.BUCKET_NAME) {
            throw new Error('BUCKET_NAME environment variable not set');
        }
        
        // Load API keys from Parameter Store
        await loadApiKeys();
        
        // Process each contact record in the batch and write individual files
        const enrichedRecords = [];
        const writtenFiles = [];
        const processingErrors = [];
        
        // Log processing progress for large batches
        const shouldLogProgress = batchItems.length > 5;
        
        for (let i = 0; i < batchItems.length; i++) {
            const contact = batchItems[i];
            const contactStartTime = Date.now();
            
            // Enhanced contact processing logging
            if (shouldLogProgress || i === 0) {
                console.log(`[${requestId}] Processing contact ${i + 1}/${batchItems.length}`, {
                    contactName: `${contact.first_name || 'Unknown'} ${contact.last_name || 'Unknown'}`,
                    company: contact.company_name || 'Unknown',
                    progressPercent: Math.round(((i + 1) / batchItems.length) * 100),
                    remainingTimeMs: context.getRemainingTimeInMillis(),
                    memoryUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) // MB
                });
            }
            
            try {
                // Perform parallel API calls to RocketReach and Apollo.io
                const enrichedContact = await enrichContactWithApis(contact, requestId);
                
                // Add campaign and commit metadata
                enrichedContact.campaign_id = campaign_id;
                enrichedContact.commit_id = commit_id;
                
                // Write individual enriched contact to S3
                const fileName = await writeEnrichedContactToS3(s3Client, enrichedContact, campaign_id, commit_id, requestId);
                if (fileName) {
                    writtenFiles.push(fileName);
                    console.log(`[${requestId}] Written individual file: ${fileName}`);
                }
                
                enrichedRecords.push(enrichedContact);
                
                // Log processing time for this contact
                const contactProcessingTime = Date.now() - contactStartTime;
                if (shouldLogProgress && contactProcessingTime > 5000) { // Log slow contacts
                    console.warn(`[${requestId}] Slow contact processing`, {
                        contactName: `${contact.first_name || 'Unknown'} ${contact.last_name || 'Unknown'}`,
                        processingTimeMs: contactProcessingTime,
                        contactIndex: i + 1
                    });
                }
                
            } catch (contactError) {
                const contactProcessingTime = Date.now() - contactStartTime;
                
                // Track processing error with detailed context
                processingErrors.push({
                    contactIndex: i + 1,
                    contactName: `${contact.first_name || 'Unknown'} ${contact.last_name || 'Unknown'}`,
                    error: contactError.message,
                    processingTimeMs: contactProcessingTime
                });
                
                console.error(`[${requestId}] Error processing contact ${i + 1}`, {
                    contactName: `${contact.first_name || 'Unknown'} ${contact.last_name || 'Unknown'}`,
                    errorMessage: contactError.message,
                    processingTimeMs: contactProcessingTime,
                    remainingTimeMs: context.getRemainingTimeInMillis()
                });
                // Add original contact with error flag
                const errorContact = {
                    ...contact,
                    campaign_id: campaign_id,
                    commit_id: commit_id,
                    enrichment_metadata: {
                        enriched_at: new Date().toISOString(),
                        rocketreach_success: false,
                        apollo_success: false,
                        total_emails_added: 0,
                        total_phones_added: 0,
                        error: contactError.message
                    }
                };
                
                // Still try to write the contact with error metadata
                try {
                    const fileName = await writeEnrichedContactToS3(s3Client, errorContact, campaign_id, commit_id, requestId);
                    if (fileName) {
                        writtenFiles.push(fileName);
                        console.log(`[${requestId}] Written error contact file: ${fileName}`);
                    }
                } catch (writeError) {
                    console.error(`[${requestId}] Failed to write error contact to S3:`, writeError);
                }
                
                enrichedRecords.push(errorContact);
            }
        }
        
        // Calculate processing metrics
        const processingTime = Date.now() - startTime;
        const successfulEnrichments = enrichedRecords.filter(record => 
            record.enrichment_metadata && 
            (record.enrichment_metadata.rocketreach_success || record.enrichment_metadata.apollo_success)
        ).length;
        
        const totalEmailsAdded = enrichedRecords.reduce((sum, record) => 
            sum + (record.enrichment_metadata?.total_emails_added || 0), 0);
        const totalPhonesAdded = enrichedRecords.reduce((sum, record) => 
            sum + (record.enrichment_metadata?.total_phones_added || 0), 0);
        
        // Comprehensive success logging
        console.log(`[${requestId}] Enrichment batch completed`, {
            totalRecords: enrichedRecords.length,
            successfulEnrichments: successfulEnrichments,
            processingErrors: processingErrors.length,
            enrichmentSuccessRate: `${((successfulEnrichments / enrichedRecords.length) * 100).toFixed(1)}%`,
            totalEmailsAdded: totalEmailsAdded,
            totalPhonesAdded: totalPhonesAdded,
            filesWritten: writtenFiles.length,
            processingTimeMs: processingTime,
            averageTimePerRecord: Math.round(processingTime / enrichedRecords.length),
            campaignId: campaign_id,
            commitId: commit_id,
            memoryUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            timestamp: new Date().toISOString()
        });
        
        // Log individual errors if any occurred
        if (processingErrors.length > 0) {
            console.warn(`[${requestId}] Processing errors summary`, {
                errorCount: processingErrors.length,
                errors: processingErrors
            });
        }
        
        // Return enriched records (maintaining compatibility with existing pipeline)
        return enrichedRecords;
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        
        // Comprehensive error logging following DLQ patterns
        console.error(`[${requestId}] Critical error in enrichment batch processing`, {
            errorMessage: error.message,
            errorStack: error.stack,
            processingTimeMs: processingTime,
            batchSize: batchItems?.length || 0,
            campaignId: campaign_id,
            commitId: commit_id,
            eventStructure: {
                hasItems: !!(event.Items && Array.isArray(event.Items)),
                itemsCount: event.Items?.length || 0,
                hasDirectItems: !!(event.items)
            },
            environmentCheck: {
                hasRocketReachKey: !!process.env.ROCKETREACH_API_KEY_PARAM,
                hasApolloKey: !!process.env.APOLLO_API_KEY_PARAM,
                hasBucketName: !!process.env.BUCKET_NAME
            },
            timestamp: new Date().toISOString()
        });
        // Return empty array for failed batches to maintain pipeline flow
        // This prevents pipeline from breaking on individual batch failures
        return [];
    }
};

/**
 * Load API keys from Parameter Store with caching
 */
async function loadApiKeys() {
    try {
        // Load RocketReach API key if not cached
        if (!apiKeyCache.rocketreach) {
            const rocketreachParam = await ssmClient.send(new GetParameterCommand({
                Name: process.env.ROCKETREACH_API_KEY_PARAM,
                WithDecryption: true
            }));
            apiKeyCache.rocketreach = rocketreachParam.Parameter.Value;
        }
        
        // Load Apollo.io API key if not cached
        if (!apiKeyCache.apollo) {
            const apolloParam = await ssmClient.send(new GetParameterCommand({
                Name: process.env.APOLLO_API_KEY_PARAM,
                WithDecryption: true
            }));
            apiKeyCache.apollo = apolloParam.Parameter.Value;
        }
        
        console.log('API keys loaded successfully from Parameter Store');
        
    } catch (error) {
        console.error('Error loading API keys from Parameter Store:', error);
        throw new Error('Failed to load API keys from Parameter Store');
    }
}

/**
 * Enrich contact data by calling both RocketReach and Apollo.io APIs in parallel
 * @param {Object} contact - Original contact data
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Object>} - Enriched contact with merged data
 */
async function enrichContactWithApis(contact, requestId) {
    const enrichmentStartTime = Date.now();
    
    try {
        // Make parallel API calls to both services
        console.log(`[${requestId}] Starting parallel enrichment for ${contact.first_name} ${contact.last_name}`);
        
        const [rocketreachResult, apolloResult] = await Promise.allSettled([
            rocketreachSearch(contact, apiKeyCache.rocketreach, requestId),
            apolloSearch(contact, apiKeyCache.apollo, requestId)
        ]);
        
        // Process RocketReach results
        let rocketreachData = null;
        let rocketreachSuccess = false;
        if (rocketreachResult.status === 'fulfilled' && rocketreachResult.value) {
            rocketreachData = rocketreachResult.value;
            rocketreachSuccess = true;
        } else if (rocketreachResult.status === 'rejected') {
            console.error(`[${requestId}] RocketReach API failed:`, rocketreachResult.reason);
        }
        
        // Process Apollo.io results
        let apolloData = null;
        let apolloSuccess = false;
        if (apolloResult.status === 'fulfilled' && apolloResult.value) {
            apolloData = apolloResult.value;
            apolloSuccess = true;
        } else if (apolloResult.status === 'rejected') {
            console.error(`[${requestId}] Apollo.io API failed:`, apolloResult.reason);
        }
        
        // Merge enrichment data
        const mergedData = mergeEnrichmentData(contact, rocketreachData, apolloData, requestId);
        
        // Calculate enrichment metrics
        const enrichmentTime = Date.now() - enrichmentStartTime;
        const totalEmailsAdded = mergedData.emails ? mergedData.emails.length - (contact.emails ? contact.emails.length : 0) : 0;
        const totalPhonesAdded = mergedData.phones ? mergedData.phones.length - (contact.phones ? contact.phones.length : 0) : 0;
        
        // Add enrichment metadata
        mergedData.enrichment_metadata = {
            enriched_at: new Date().toISOString(),
            enrichment_time_ms: enrichmentTime,
            rocketreach_success: rocketreachSuccess,
            apollo_success: apolloSuccess,
            total_emails_added: Math.max(0, totalEmailsAdded),
            total_phones_added: Math.max(0, totalPhonesAdded),
            enrichment_sources: [
                ...(rocketreachSuccess ? ['rocketreach'] : []),
                ...(apolloSuccess ? ['apollo'] : [])
            ]
        };
        
        console.log(`[${requestId}] Enrichment completed in ${enrichmentTime}ms: +${totalEmailsAdded} emails, +${totalPhonesAdded} phones`);
        return mergedData;
        
    } catch (error) {
        console.error(`[${requestId}] Error during enrichment:`, error);
        
        // Return original contact with error metadata
        return {
            ...contact,
            enrichment_metadata: {
                enriched_at: new Date().toISOString(),
                enrichment_time_ms: Date.now() - enrichmentStartTime,
                rocketreach_success: false,
                apollo_success: false,
                total_emails_added: 0,
                total_phones_added: 0,
                error: error.message,
                enrichment_sources: []
            }
        };
    }
}

/**
 * Merge enrichment data from multiple sources with deduplication and prioritization
 * @param {Object} originalContact - Original contact data
 * @param {Object} rocketreachData - RocketReach enrichment data
 * @param {Object} apolloData - Apollo.io enrichment data
 * @param {string} requestId - Request ID for logging
 * @returns {Object} - Merged contact data
 */
function mergeEnrichmentData(originalContact, rocketreachData, apolloData, requestId) {
    const mergedContact = { ...originalContact };
    
    // Initialize arrays if they don't exist
    if (!mergedContact.emails) mergedContact.emails = [];
    if (!mergedContact.phones) mergedContact.phones = [];
    
    // Convert existing emails/phones to have consistent structure for comparison
    normalizeExistingContactData(mergedContact);
    
    // Collect all new emails from enrichment sources
    const newEmails = [];
    if (rocketreachData && rocketreachData.emails) {
        newEmails.push(...rocketreachData.emails);
    }
    if (apolloData && apolloData.emails) {
        newEmails.push(...apolloData.emails);
    }
    
    // Collect all new phones from enrichment sources
    const newPhones = [];
    if (rocketreachData && rocketreachData.phones) {
        newPhones.push(...rocketreachData.phones);
    }
    if (apolloData && apolloData.phones) {
        newPhones.push(...apolloData.phones);
    }
    
    // Merge emails with deduplication
    const mergedEmails = mergeEmails(mergedContact.emails, newEmails, requestId);
    mergedContact.emails = mergedEmails;
    
    // Merge phones with deduplication
    const mergedPhones = mergePhones(mergedContact.phones, newPhones, requestId);
    mergedContact.phones = mergedPhones;
    
    console.log(`[${requestId}] Merged data: ${mergedContact.emails.length} total emails, ${mergedContact.phones.length} total phones`);
    return mergedContact;
}

/**
 * Normalize existing contact data to have consistent structure
 * @param {Object} contact - Contact to normalize
 */
function normalizeExistingContactData(contact) {
    // Ensure emails have required structure
    if (contact.emails && Array.isArray(contact.emails)) {
        contact.emails = contact.emails.map(email => {
            if (typeof email === 'string') {
                return {
                    email: email.toLowerCase(),
                    priority: 0, // Existing emails get highest priority
                    source: 'original',
                    confidence: 1.0
                };
            }
            return {
                email: (email.email || '').toLowerCase(),
                priority: email.priority || 0,
                source: email.source || 'original',
                confidence: email.confidence || 1.0
            };
        });
    }
    
    // Ensure phones have required structure
    if (contact.phones && Array.isArray(contact.phones)) {
        contact.phones = contact.phones.map(phone => {
            if (typeof phone === 'string') {
                return {
                    phone: phone,
                    priority: 0, // Existing phones get highest priority
                    source: 'original',
                    confidence: 1.0
                };
            }
            return {
                phone: phone.phone || '',
                priority: phone.priority || 0,
                source: phone.source || 'original',
                confidence: phone.confidence || 1.0
            };
        });
    }
}

/**
 * Merge email arrays with deduplication and priority sorting
 * @param {Array} existingEmails - Existing emails
 * @param {Array} newEmails - New emails to merge
 * @param {string} requestId - Request ID for logging
 * @returns {Array} - Merged and deduplicated emails
 */
function mergeEmails(existingEmails, newEmails, requestId) {
    const emailMap = new Map();
    
    // Add existing emails to map (they get priority)
    existingEmails.forEach(email => {
        if (email.email) {
            emailMap.set(email.email.toLowerCase(), email);
        }
    });
    
    // Add new emails, avoiding duplicates
    let duplicatesSkipped = 0;
    newEmails.forEach(email => {
        const emailKey = email.email.toLowerCase();
        if (!emailMap.has(emailKey)) {
            emailMap.set(emailKey, email);
        } else {
            duplicatesSkipped++;
        }
    });
    
    if (duplicatesSkipped > 0) {
        console.log(`[${requestId}] Skipped ${duplicatesSkipped} duplicate emails during merge`);
    }
    
    // Convert back to array and sort by priority (lower number = higher priority)
    return Array.from(emailMap.values())
        .sort((a, b) => a.priority - b.priority);
}

/**
 * Merge phone arrays with deduplication and priority sorting
 * @param {Array} existingPhones - Existing phones
 * @param {Array} newPhones - New phones to merge
 * @param {string} requestId - Request ID for logging
 * @returns {Array} - Merged and deduplicated phones
 */
function mergePhones(existingPhones, newPhones, requestId) {
    const phoneMap = new Map();
    
    // Add existing phones to map (they get priority)
    existingPhones.forEach(phone => {
        if (phone.phone) {
            // Normalize phone for comparison (remove all non-digits)
            const normalizedPhone = phone.phone.replace(/\D/g, '');
            phoneMap.set(normalizedPhone, phone);
        }
    });
    
    // Add new phones, avoiding duplicates
    let duplicatesSkipped = 0;
    newPhones.forEach(phone => {
        const normalizedPhone = phone.phone.replace(/\D/g, '');
        if (!phoneMap.has(normalizedPhone)) {
            phoneMap.set(normalizedPhone, phone);
        } else {
            duplicatesSkipped++;
        }
    });
    
    if (duplicatesSkipped > 0) {
        console.log(`[${requestId}] Skipped ${duplicatesSkipped} duplicate phones during merge`);
    }
    
    // Convert back to array and sort by priority (lower number = higher priority)
    return Array.from(phoneMap.values())
        .sort((a, b) => a.priority - b.priority);
}