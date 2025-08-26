// Apollo.io API Integration Module
// Provides contact enrichment functionality with rate limiting and retry logic

// Rate limiting configuration - 5 requests per second as per design
const RATE_LIMIT = {
    requestsPerSecond: 5,
    lastRequestTime: 0,
    requestCount: 0,
    windowStart: 0
};

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
};

/**
 * Search for contact information using Apollo.io API (single contact - legacy)
 * @param {Object} contact - Contact object with name, company, etc.
 * @param {string} apiKey - Apollo.io API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Object>} - Enriched contact data or null
 */
export async function searchContact(contact, apiKey, requestId) {
    const results = await searchContacts([contact], apiKey, requestId);
    return results && results.length > 0 ? results[0] : null;
}

/**
 * Bulk search for contact information using Apollo.io API
 * @param {Array} contacts - Array of contact objects with name, company, etc.
 * @param {string} apiKey - Apollo.io API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Array>} - Array of enriched contact data (same order as input)
 */
export async function searchContacts(contacts, apiKey, requestId) {
    if (!apiKey) {
        console.error(`[${requestId}] Apollo.io API key not provided`);
        return contacts.map(() => null);
    }
    
    if (!contacts || contacts.length === 0) {
        return [];
    }
    
    // Apollo.io supports up to 10 contacts per bulk request
    const MAX_BATCH_SIZE = 10;
    const results = [];
    
    try {
        // Process contacts in batches of 10
        for (let i = 0; i < contacts.length; i += MAX_BATCH_SIZE) {
            const batch = contacts.slice(i, i + MAX_BATCH_SIZE);
            console.log(`[${requestId}] Processing Apollo.io batch ${Math.floor(i/MAX_BATCH_SIZE) + 1}: ${batch.length} contacts`);
            
            const batchResults = await processBatch(batch, apiKey, requestId);
            results.push(...batchResults);
        }
        
        return results;
        
    } catch (error) {
        console.error(`[${requestId}] Apollo.io bulk API error:`, error.message);
        return contacts.map(() => null);
    }
}

/**
 * Process a batch of contacts using Apollo.io bulk API
 * @param {Array} batch - Batch of contacts to process
 * @param {string} apiKey - Apollo.io API key
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Array>} - Array of enriched contact data
 */
async function processBatch(batch, apiKey, requestId) {
    try {
        // Apply rate limiting
        await applyRateLimit();
        
        // Build bulk enrichment requests
        const enrichmentRequests = batch.map((contact, index) => {
            if (!contact.first_name || !contact.last_name) {
                console.warn(`[${requestId}] Insufficient data for Apollo.io search at index ${index}: missing name`);
                return null;
            }
            return buildEnrichmentRequest(contact, index);
        });
        
        // Filter out null requests but keep track of original indices
        const validRequests = [];
        const requestIndexMap = new Map(); // Maps valid request index to original batch index
        
        enrichmentRequests.forEach((request, originalIndex) => {
            if (request) {
                requestIndexMap.set(validRequests.length, originalIndex);
                validRequests.push(request);
            }
        });
        
        if (validRequests.length === 0) {
            console.warn(`[${requestId}] No valid contacts for Apollo.io bulk search`);
            return batch.map(() => null);
        }
        
        console.log(`[${requestId}] Apollo.io bulk search: ${validRequests.length} valid requests`);
        
        // Perform bulk API call
        const bulkResult = await performBulkApiCallWithRetry(validRequests, apiKey, requestId);
        
        // Initialize results array with nulls
        const results = new Array(batch.length).fill(null);
        
        // Process bulk results and map back to original positions
        if (bulkResult && bulkResult.people && Array.isArray(bulkResult.people)) {
            bulkResult.people.forEach((person, requestIndex) => {
                const originalIndex = requestIndexMap.get(requestIndex);
                if (originalIndex !== undefined && person && person.id) {
                    const enrichmentData = extractEnrichmentData(person, requestId, originalIndex);
                    results[originalIndex] = enrichmentData;
                }
            });
        }
        
        // Log batch results
        const successCount = results.filter(r => r !== null).length;
        console.log(`[${requestId}] Apollo.io batch completed: ${successCount}/${batch.length} contacts enriched`);
        
        return results;
        
    } catch (error) {
        console.error(`[${requestId}] Apollo.io batch processing error:`, error.message);
        return batch.map(() => null);
    }
}

/**
 * Apply rate limiting (5 requests per second)
 */
async function applyRateLimit() {
    const now = Date.now();
    const windowDuration = 1000; // 1 second window
    
    // Reset window if needed
    if (now - RATE_LIMIT.windowStart >= windowDuration) {
        RATE_LIMIT.windowStart = now;
        RATE_LIMIT.requestCount = 0;
    }
    
    // Check if we've hit the rate limit
    if (RATE_LIMIT.requestCount >= RATE_LIMIT.requestsPerSecond) {
        const waitTime = windowDuration - (now - RATE_LIMIT.windowStart);
        if (waitTime > 0) {
            console.log(`Rate limiting: waiting ${waitTime}ms for Apollo.io API`);
            await sleep(waitTime);
            // Reset after waiting
            RATE_LIMIT.windowStart = Date.now();
            RATE_LIMIT.requestCount = 0;
        }
    }
    
    RATE_LIMIT.requestCount++;
    RATE_LIMIT.lastRequestTime = now;
}

/**
 * Build search query for Apollo.io API (legacy single contact search)
 * @param {Object} contact - Contact information
 * @returns {Object} - API search query
 */
function buildSearchQuery(contact) {
    const query = {
        first_name: contact.first_name.trim(),
        last_name: contact.last_name.trim()
    };
    
    // Add organization if available
    if (contact.company_name && contact.company_name.trim()) {
        query.organization_names = [contact.company_name.trim()];
    }
    
    // Add title if available
    if (contact.job_title && contact.job_title.trim()) {
        query.person_titles = [contact.job_title.trim()];
    }
    
    // Add location if available
    if (contact.city && contact.state) {
        query.person_locations = [`${contact.city}, ${contact.state}`.trim()];
    } else if (contact.city) {
        query.person_locations = [contact.city.trim()];
    }
    
    // Set result limits and details
    query.per_page = 1; // We only need the top match
    query.reveal_personal_emails = true;
    query.reveal_phone_number = true;
    
    return query;
}

/**
 * Build enrichment request for Apollo.io bulk API
 * @param {Object} contact - Contact information
 * @param {number} index - Index for bulk requests
 * @returns {Object} - API enrichment request
 */
function buildEnrichmentRequest(contact, index = null) {
    const request = {
        first_name: contact.first_name.trim(),
        last_name: contact.last_name.trim(),
        reveal_personal_emails: true,
        reveal_phone_number: true
    };
    
    // Add organization if available
    if (contact.company_name && contact.company_name.trim()) {
        request.organization_name = contact.company_name.trim();
    }
    
    // Add title if available  
    if (contact.job_title && contact.job_title.trim()) {
        request.title = contact.job_title.trim();
    }
    
    // Add email if available for better matching
    if (contact.email && contact.email.trim()) {
        request.email = contact.email.trim();
    }
    
    return request;
}

/**
 * Perform Apollo.io API call with retry logic and exponential backoff
 * @param {Object} query - Search query
 * @param {string} apiKey - API key
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} - API response
 */
async function performApiCallWithRetry(query, apiKey, requestId) {
    let lastError;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
                    RETRY_CONFIG.maxDelayMs
                );
                console.log(`[${requestId}] Apollo.io retry attempt ${attempt} after ${delay}ms`);
                await sleep(delay);
            }
            
            const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'X-Api-Key': apiKey
                },
                body: JSON.stringify(query)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                
                // Handle rate limiting (429) specifically
                if (response.status === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
                    console.warn(`[${requestId}] Apollo.io rate limited, waiting ${waitTime}ms`);
                    await sleep(waitTime);
                    continue; // Don't count as a retry attempt for rate limiting
                }
                
                // Handle server errors (5xx) - these should be retried
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }
                
                // Client errors (4xx) - don't retry these
                if (response.status >= 400) {
                    console.warn(`[${requestId}] Apollo.io client error: ${response.status} - ${errorText}`);
                    return null;
                }
            }
            
            const result = await response.json();
            console.log(`[${requestId}] Apollo.io API call successful`);
            return result;
            
        } catch (error) {
            lastError = error;
            console.error(`[${requestId}] Apollo.io API attempt ${attempt + 1} failed:`, error.message);
            
            // Don't retry for network/parsing errors on the last attempt
            if (attempt === RETRY_CONFIG.maxRetries) {
                break;
            }
        }
    }
    
    throw new Error(`Apollo.io API failed after ${RETRY_CONFIG.maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

/**
 * Perform Apollo.io bulk API call with retry logic
 * @param {Array} enrichmentRequests - Array of enrichment requests
 * @param {string} apiKey - API key
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} - Bulk API response
 */
async function performBulkApiCallWithRetry(enrichmentRequests, apiKey, requestId) {
    let lastError;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
                    RETRY_CONFIG.maxDelayMs
                );
                console.log(`[${requestId}] Apollo.io bulk retry attempt ${attempt} after ${delay}ms`);
                await sleep(delay);
            }
            
            // Apollo.io bulk people enrichment endpoint
            const response = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'X-Api-Key': apiKey
                },
                body: JSON.stringify({
                    details: enrichmentRequests
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                
                // Handle rate limiting (429) specifically
                if (response.status === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
                    console.warn(`[${requestId}] Apollo.io bulk rate limited, waiting ${waitTime}ms`);
                    await sleep(waitTime);
                    continue; // Don't count as a retry attempt for rate limiting
                }
                
                // Handle server errors (5xx) - these should be retried
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }
                
                // Client errors (4xx) - don't retry these
                if (response.status >= 400) {
                    console.warn(`[${requestId}] Apollo.io bulk client error: ${response.status} - ${errorText}`);
                    return null;
                }
            }
            
            const result = await response.json();
            console.log(`[${requestId}] Apollo.io bulk API call successful - ${enrichmentRequests.length} requests processed`);
            return result;
            
        } catch (error) {
            lastError = error;
            console.error(`[${requestId}] Apollo.io bulk API attempt ${attempt + 1} failed:`, error.message);
            
            // Don't retry for network/parsing errors on the last attempt
            if (attempt === RETRY_CONFIG.maxRetries) {
                break;
            }
        }
    }
    
    throw new Error(`Apollo.io bulk API failed after ${RETRY_CONFIG.maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

/**
 * Extract enrichment data from Apollo.io person profile
 * @param {Object} person - Apollo.io person data
 * @param {string} requestId - Request ID for logging
 * @param {number} contactIndex - Contact index for bulk operations (optional)
 * @returns {Object} - Extracted emails and phones
 */
function extractEnrichmentData(person, requestId, contactIndex = null) {
    const enrichmentData = {
        emails: [],
        phones: []
    };
    
    try {
        // Extract emails
        if (person.email && isValidEmail(person.email)) {
            enrichmentData.emails.push({
                email: person.email.toLowerCase(),
                priority: 1, // Primary email gets highest priority
                source: 'apollo',
                confidence: person.email_status === 'verified' ? 0.9 : 0.7
            });
        }
        
        // Extract personal emails if available
        if (person.personal_emails && Array.isArray(person.personal_emails)) {
            person.personal_emails.forEach((email, index) => {
                if (email && isValidEmail(email)) {
                    enrichmentData.emails.push({
                        email: email.toLowerCase(),
                        priority: 2, // Personal emails get lower priority
                        source: 'apollo',
                        confidence: 0.8
                    });
                }
            });
        }
        
        // Extract phone numbers
        if (person.sanitized_phone && isValidPhone(person.sanitized_phone)) {
            enrichmentData.phones.push({
                phone: formatPhoneNumber(person.sanitized_phone),
                priority: 1, // Primary phone gets highest priority
                source: 'apollo',
                confidence: 0.8
            });
        }
        
        // Extract corporate phone if different
        if (person.corporate_phone && isValidPhone(person.corporate_phone) && 
            person.corporate_phone !== person.sanitized_phone) {
            enrichmentData.phones.push({
                phone: formatPhoneNumber(person.corporate_phone),
                priority: 2, // Corporate phone gets lower priority
                source: 'apollo',
                confidence: 0.7
            });
        }
        
        // Log extraction results
        const indexStr = contactIndex !== null ? ` (contact ${contactIndex})` : '';
        console.log(`[${requestId}] Extracted from Apollo.io${indexStr}: ${enrichmentData.emails.length} emails, ${enrichmentData.phones.length} phones`);
        
    } catch (error) {
        console.error(`[${requestId}] Error extracting Apollo.io data:`, error.message);
    }
    
    return enrichmentData;
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate phone number (basic validation)
 * @param {string} phone - Phone number
 * @returns {boolean} - True if valid
 */
function isValidPhone(phone) {
    // Remove all non-digit characters and check if we have at least 10 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 10;
}

/**
 * Format phone number to consistent format
 * @param {string} phone - Raw phone number
 * @returns {string} - Formatted phone number
 */
function formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, '');
    
    // Format as +1-XXX-XXX-XXXX for US numbers (10 digits)
    // or +X-XXX-XXX-XXXX for international (>10 digits)
    if (digitsOnly.length === 10) {
        return `+1-${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        return `+1-${digitsOnly.slice(1, 4)}-${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
    } else {
        // Keep original format for international numbers
        return phone;
    }
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}