// Vendor API Configuration Module
// Manages the order and configuration of vendor APIs for sequential processing

import { searchContacts as rocketreachSearchIndividual } from './rocketreach-api.mjs';
import { searchContacts as apolloSearchIndividual } from './apollo-api.mjs';

/**
 * Vendor API configuration with customizable order
 * Each vendor has a name, order priority, API function, and enable flag
 */
const VENDOR_CONFIG = [
    {
        name: 'rocketreach',
        order: 1,
        enabled: true,
        apiFunction: rocketreachSearchIndividual,
        getApiKey: () => apiKeyCache.rocketreach,
        description: 'RocketReach API for contact enrichment'
    },
    {
        name: 'apollo',
        order: 2,
        enabled: true,
        apiFunction: apolloSearchIndividual,
        getApiKey: () => apiKeyCache.apollo,
        description: 'Apollo.io API for contact enrichment'
    }
];

// External reference to API key cache (will be set from main module)
let apiKeyCache = {};

/**
 * Set the API key cache reference from the main module
 * @param {Object} keyCache - Reference to the API key cache object
 */
export function setApiKeyCache(keyCache) {
    apiKeyCache = keyCache;
}

/**
 * Get the ordered list of enabled vendor APIs
 * @returns {Array} - Array of vendor configurations sorted by order
 */
export function getOrderedVendorApis() {
    return VENDOR_CONFIG
        .filter(vendor => vendor.enabled && vendor.getApiKey())
        .sort((a, b) => a.order - b.order);
}

/**
 * Update vendor API order configuration
 * @param {Object} orderConfig - Object mapping vendor names to order values
 * @example updateVendorOrder({ rocketreach: 2, apollo: 1 })
 */
export function updateVendorOrder(orderConfig) {
    VENDOR_CONFIG.forEach(vendor => {
        if (orderConfig[vendor.name] !== undefined) {
            vendor.order = orderConfig[vendor.name];
            console.log(`Updated ${vendor.name} order to ${vendor.order}`);
        }
    });
}

/**
 * Enable or disable a vendor API
 * @param {string} vendorName - Name of the vendor
 * @param {boolean} enabled - Enable/disable flag
 */
export function setVendorEnabled(vendorName, enabled) {
    const vendor = VENDOR_CONFIG.find(v => v.name === vendorName);
    if (vendor) {
        vendor.enabled = enabled;
        console.log(`${vendorName} API ${enabled ? 'enabled' : 'disabled'}`);
    } else {
        console.warn(`Vendor ${vendorName} not found in configuration`);
    }
}

/**
 * Get configuration for a specific vendor
 * @param {string} vendorName - Name of the vendor
 * @returns {Object|null} - Vendor configuration or null if not found
 */
export function getVendorConfig(vendorName) {
    return VENDOR_CONFIG.find(v => v.name === vendorName) || null;
}

/**
 * Get all vendor configurations (for debugging/monitoring)
 * @returns {Array} - Array of all vendor configurations sorted by order
 */
export function getAllVendorConfigs() {
    return VENDOR_CONFIG
        .map(vendor => ({
            name: vendor.name,
            order: vendor.order,
            enabled: vendor.enabled,
            hasApiKey: !!vendor.getApiKey(),
            description: vendor.description
        }))
        .sort((a, b) => a.order - b.order);
}

/**
 * Process contacts sequentially through ordered vendor APIs
 * @param {Array} contacts - Array of contact objects to enrich
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Array>} - Array of enrichment results for each contact
 */
export async function processContactsSequentially(contacts, requestId) {
    const startTime = Date.now();
    
    // Input validation with fallback
    if (!contacts || !Array.isArray(contacts)) {
        console.error(`[${requestId}] Invalid contacts input - expected array, got:`, typeof contacts);
        return [];
    }
    
    if (contacts.length === 0) {
        console.log(`[${requestId}] No contacts to process`);
        return [];
    }
    
    console.log(`[${requestId}] Starting sequential vendor API processing for ${contacts.length} contacts`);
    
    // Get ordered list of enabled vendor APIs with error handling
    let orderedVendors;
    try {
        orderedVendors = getOrderedVendorApis();
        console.log(`[${requestId}] Processing order: ${orderedVendors.map(v => v.name).join(' -> ')}`);
    } catch (error) {
        console.error(`[${requestId}] Error getting vendor configuration:`, error.message);
        return contacts.map(() => ({
            error: 'Vendor configuration error',
            processingTime: 0
        }));
    }
    
    if (orderedVendors.length === 0) {
        console.warn(`[${requestId}] No enabled vendor APIs found`);
        return contacts.map(() => ({
            error: 'No vendor APIs available',
            processingTime: 0
        }));
    }
    
    // Initialize current contacts data - start with original contacts
    let currentContactsData = contacts.map(contact => {
        // Handle null/invalid contacts gracefully
        if (!contact || typeof contact !== 'object') {
            return { emails: [], phones: [] };
        }
        return {
            ...contact,
            emails: contact.emails || [],
            phones: contact.phones || []
        };
    });
    
    const results = [];
    
    // Process each contact through all vendors sequentially  
    for (let contactIndex = 0; contactIndex < contacts.length; contactIndex++) {
        const contactStartTime = Date.now();
        
        // Comprehensive error handling wrapper for each contact
        try {
            const originalContact = contacts[contactIndex];
            
            // Validate contact data
            if (!originalContact || typeof originalContact !== 'object') {
                console.warn(`[${requestId}] Contact ${contactIndex + 1}: Invalid contact data, skipping`);
                results.push({
                    error: 'Invalid contact data',
                    processingTime: Date.now() - contactStartTime
                });
                continue;
            }
            
            let enrichedContact = { ...currentContactsData[contactIndex] };
            
            const enrichmentMetadata = {
                enriched_at: new Date().toISOString(),
                vendor_results: {},
                total_emails_added: 0,
                total_phones_added: 0,
                enrichment_sources: []
            };
            
            const contactName = `${originalContact.first_name || 'Unknown'} ${originalContact.last_name || 'Unknown'}`;
            console.log(`[${requestId}] Processing contact ${contactIndex + 1}/${contacts.length}: ${contactName}`);
            
            // Process through each vendor API sequentially
            for (const vendor of orderedVendors) {
                const vendorStartTime = Date.now();
                
                try {
                    // Additional vendor validation
                    if (!vendor.apiFunction || typeof vendor.apiFunction !== 'function') {
                        throw new Error(`Invalid API function for vendor ${vendor.name}`);
                    }
                    
                    if (!vendor.getApiKey()) {
                        console.warn(`[${requestId}] Contact ${contactIndex + 1} -> ${vendor.name}: No API key available, skipping`);
                        enrichmentMetadata.vendor_results[vendor.name] = {
                            success: false,
                            error: 'No API key available',
                            processing_time_ms: Date.now() - vendorStartTime
                        };
                        continue;
                    }
                    
                    console.log(`[${requestId}] Contact ${contactIndex + 1} -> ${vendor.name} API`);
                    
                    // Call the vendor API with current enriched contact data
                    const vendorResults = await Promise.race([
                        vendor.apiFunction([enrichedContact], vendor.getApiKey(), requestId),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Vendor API timeout')), 30000)) // 30 second timeout
                    ]);
                    
                    const vendorResult = vendorResults && vendorResults[0] ? vendorResults[0] : null;
                    
                    if (vendorResult) {
                        // Merge the vendor result with current contact data
                        const emailsBefore = enrichedContact.emails ? enrichedContact.emails.length : 0;
                        const phonesBefore = enrichedContact.phones ? enrichedContact.phones.length : 0;
                        
                        enrichedContact = mergeVendorData(enrichedContact, vendorResult);
                        
                        const emailsAdded = (enrichedContact.emails ? enrichedContact.emails.length : 0) - emailsBefore;
                        const phonesAdded = (enrichedContact.phones ? enrichedContact.phones.length : 0) - phonesBefore;
                        
                        // Update metadata
                        enrichmentMetadata.vendor_results[vendor.name] = {
                            success: true,
                            emails_added: emailsAdded,
                            phones_added: phonesAdded,
                            processing_time_ms: Date.now() - vendorStartTime
                        };
                        enrichmentMetadata.total_emails_added += emailsAdded;
                        enrichmentMetadata.total_phones_added += phonesAdded;
                        enrichmentMetadata.enrichment_sources.push(vendor.name);
                        
                        console.log(`[${requestId}] Contact ${contactIndex + 1} <- ${vendor.name}: +${emailsAdded} emails, +${phonesAdded} phones`);
                    } else {
                        // Vendor failed, log but continue with next vendor
                        enrichmentMetadata.vendor_results[vendor.name] = {
                            success: false,
                            error: 'No data returned',
                            processing_time_ms: Date.now() - vendorStartTime
                        };
                        console.log(`[${requestId}] Contact ${contactIndex + 1} <- ${vendor.name}: no data returned`);
                    }
                    
                } catch (error) {
                    // Vendor API failed, log error but continue processing with next vendor
                    enrichmentMetadata.vendor_results[vendor.name] = {
                        success: false,
                        error: error.message || 'Unknown error',
                        processing_time_ms: Date.now() - vendorStartTime
                    };
                    console.error(`[${requestId}] Contact ${contactIndex + 1} <- ${vendor.name} failed:`, error.message);
                    // Continue to next vendor - don't break the loop
                }
            }
        
            // Calculate total processing time for this contact
            const contactProcessingTime = Date.now() - contactStartTime;
            enrichmentMetadata.enrichment_time_ms = contactProcessingTime;
            
            // Update current contacts data for potential use in next contact processing
            currentContactsData[contactIndex] = enrichedContact;
            
            // Add result for this contact
            results.push({
                enrichedContact: enrichedContact,
                enrichmentMetadata: enrichmentMetadata,
                processingTime: contactProcessingTime
            });
            
            console.log(`[${requestId}] Contact ${contactIndex + 1} completed: +${enrichmentMetadata.total_emails_added} emails, +${enrichmentMetadata.total_phones_added} phones (${contactProcessingTime}ms)`);
            
        } catch (contactError) {
            // Catch-all error handler for contact processing
            const contactProcessingTime = Date.now() - contactStartTime;
            console.error(`[${requestId}] Contact ${contactIndex + 1} processing failed:`, contactError.message);
            
            results.push({
                error: contactError.message || 'Contact processing failed',
                processingTime: contactProcessingTime
            });
        }
    }
    
    const totalProcessingTime = Date.now() - startTime;
    const successCount = results.filter(r => !r.error).length;
    
    console.log(`[${requestId}] Sequential vendor processing completed in ${totalProcessingTime}ms: ${successCount}/${contacts.length} contacts enriched`);
    console.log(`[${requestId}] Vendor summary:`, 
        orderedVendors.map(v => `${v.name}: ${results.filter(r => r.enrichmentMetadata?.enrichment_sources?.includes(v.name)).length} successes`).join(', ')
    );
    
    return results;
}

/**
 * Merge vendor enrichment data into current contact data
 * @param {Object} currentContact - Current contact data (may already be enriched)
 * @param {Object} vendorData - New vendor enrichment data
 * @returns {Object} - Merged contact data
 */
function mergeVendorData(currentContact, vendorData) {
    const mergedContact = { ...currentContact };
    
    // Initialize arrays if they don't exist
    if (!mergedContact.emails) mergedContact.emails = [];
    if (!mergedContact.phones) mergedContact.phones = [];
    
    // Merge emails with deduplication
    if (vendorData.emails && Array.isArray(vendorData.emails)) {
        const emailMap = new Map();
        let maxPriority = 0;
        
        // Add existing emails to map
        mergedContact.emails.forEach(email => {
            if (email.value) {
                emailMap.set(email.value.toLowerCase(), email);
                maxPriority = Math.max(maxPriority, email.priority || 0);
            }
        });
        
        // Add new emails, avoiding duplicates
        let newEmailsAdded = 0;
        vendorData.emails.forEach(email => {
            const emailKey = email.value.toLowerCase();
            if (!emailMap.has(emailKey)) {
                emailMap.set(emailKey, {
                    ...email,
                    priority: maxPriority + newEmailsAdded + 1
                });
                newEmailsAdded++;
            }
        });
        
        // Convert back to array and sort by priority
        mergedContact.emails = Array.from(emailMap.values())
            .sort((a, b) => a.priority - b.priority);
    }
    
    // Merge phones with deduplication
    if (vendorData.phones && Array.isArray(vendorData.phones)) {
        const phoneMap = new Map();
        let maxPriority = 0;
        
        // Add existing phones to map
        mergedContact.phones.forEach(phone => {
            if (phone.value) {
                const normalizedPhone = phone.value.replace(/\D/g, '');
                phoneMap.set(normalizedPhone, phone);
                maxPriority = Math.max(maxPriority, phone.priority || 0);
            }
        });
        
        // Add new phones, avoiding duplicates
        let newPhonesAdded = 0;
        vendorData.phones.forEach(phone => {
            const normalizedPhone = phone.value.replace(/\D/g, '');
            if (!phoneMap.has(normalizedPhone)) {
                phoneMap.set(normalizedPhone, {
                    ...phone,
                    priority: maxPriority + newPhonesAdded + 1
                });
                newPhonesAdded++;
            }
        });
        
        // Convert back to array and sort by priority
        mergedContact.phones = Array.from(phoneMap.values())
            .sort((a, b) => a.priority - b.priority);
    }
    
    return mergedContact;
}