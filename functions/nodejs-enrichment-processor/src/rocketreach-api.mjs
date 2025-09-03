// RocketReach API Integration Module
// Provides contact enrichment functionality with rate limiting and retry logic

// Rate limiting configuration - 10 requests per second as per design
const RATE_LIMIT = {
    requestsPerSecond: 10,
    lastRequestTime: 0,
    requestCount: 0,
    windowStart: 0
};

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 1,
    baseDelayMs: 1000,
    maxDelayMs: 10000
};

/**
 * Search for contact information using RocketReach API (single contact)
 * Uses the individual people lookup API endpoint
 * @param {Object} contact - Contact object with name, company, etc.
 * @param {string} apiKey - RocketReach API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Object>} - Enriched contact data or null
 */
export async function searchContact(contact, apiKey, requestId) {
    return await searchContactIndividual(contact, apiKey, requestId);
}

/**
 * Search for contact information using RocketReach API (single contact - individual API)
 * Uses the individual people lookup API endpoint for better accuracy
 * @param {Object} contact - Contact object with name, company, etc.
 * @param {string} apiKey - RocketReach API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Object>} - Enriched contact data or null
 */
export async function searchContactIndividual(contact, apiKey, requestId) {
    if (!apiKey) {
        console.error(`[${requestId}] RocketReach API key not provided`);
        return null;
    }
    
    if (!contact || !contact.first_name || !contact.last_name) {
        console.warn(`[${requestId}] Insufficient data for RocketReach search: missing name`);
        return null;
    }
    
    try {
        // Apply rate limiting
        await applyRateLimit();
        
        // Build individual search query parameters
        const searchParams = buildIndividualSearchQuery(contact);
        
        console.log(`[${requestId}] RocketReach individual search: ${contact.first_name} ${contact.last_name}`);
        
        // Perform individual API call
        const result = await performIndividualApiCallWithRetry(searchParams, apiKey, requestId);
        
        if (result) {
            const enrichmentData = extractEnrichmentDataIndividual(result, requestId);
            console.log(`[${requestId}] RocketReach individual search successful: ${enrichmentData.emails.length} emails, ${enrichmentData.phones.length} phones`);
            return enrichmentData;
        }
        
        console.log(`[${requestId}] RocketReach individual search returned no results`);
        return null;
        
    } catch (error) {
        console.error(`[${requestId}] RocketReach individual search error:`, error.message);
        return null;
    }
}

/**
 * Process multiple contacts using individual API calls with rate limiting
 * @param {Array} contacts - Array of contact objects
 * @param {string} apiKey - RocketReach API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Array>} - Array of enriched contact data (same order as input)
 */
export async function searchContacts(contacts, apiKey, requestId) {
    if (!apiKey) {
        console.error(`[${requestId}] RocketReach API key not provided`);
        return contacts.map(() => null);
    }
    
    if (!contacts || contacts.length === 0) {
        return [];
    }
    
    console.log(`[${requestId}] Processing ${contacts.length} contacts individually with RocketReach API`);
    const results = [];
    
    try {
        // Process contacts individually with rate limiting
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            console.log(`[${requestId}] Processing RocketReach contact ${i + 1}/${contacts.length}: ${contact.first_name} ${contact.last_name}`);
            
            const result = await searchContactIndividual(contact, apiKey, requestId);
            results.push(result);
        }
        
        const successCount = results.filter(r => r !== null).length;
        console.log(`[${requestId}] RocketReach individual processing completed: ${successCount}/${contacts.length} contacts enriched`);
        
        return results;
        
    } catch (error) {
        console.error(`[${requestId}] RocketReach individual processing error:`, error.message);
        return contacts.map(() => null);
    }
}

/**
 * Bulk search functions (available for future use)
 */
export async function searchContactsBulk(contacts, apiKey, requestId) {
    if (!apiKey) {
        console.error(`[${requestId}] RocketReach API key not provided`);
        return contacts.map(() => null);
    }
    
    if (!contacts || contacts.length === 0) {
        return [];
    }
    
    // RocketReach supports up to 100 contacts per bulk request
    const MAX_BATCH_SIZE = 100;
    const results = [];
    
    try {
        // Process contacts in batches of 100
        for (let i = 0; i < contacts.length; i += MAX_BATCH_SIZE) {
            const batch = contacts.slice(i, i + MAX_BATCH_SIZE);
            console.log(`[${requestId}] Processing RocketReach bulk batch ${Math.floor(i/MAX_BATCH_SIZE) + 1}: ${batch.length} contacts`);
            
            const batchResults = await processBatch(batch, apiKey, requestId);
            results.push(...batchResults);
        }
        
        return results;
        
    } catch (error) {
        console.error(`[${requestId}] RocketReach bulk API error:`, error.message);
        return contacts.map(() => null);
    }
}

/**
 * Process a batch of contacts using RocketReach bulk API
 * @param {Array} batch - Batch of contacts to process
 * @param {string} apiKey - RocketReach API key
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Array>} - Array of enriched contact data
 */
async function processBatch(batch, apiKey, requestId) {
    try {
        // Apply rate limiting
        await applyRateLimit();
        
        // Build bulk search queries
        const queries = batch.map((contact, index) => {
            if (!contact.first_name || !contact.last_name) {
                console.warn(`[${requestId}] Insufficient data for RocketReach search at index ${index}: missing name`);
                return null;
            }
            return buildSearchQuery(contact, index);
        });
        
        // Filter out null queries but keep track of original indices
        const validQueries = [];
        const queryIndexMap = new Map(); // Maps valid query index to original batch index
        
        queries.forEach((query, originalIndex) => {
            if (query) {
                queryIndexMap.set(validQueries.length, originalIndex);
                validQueries.push(query);
            }
        });
        if (validQueries.length === 0) {
            console.warn(`[${requestId}] No valid contacts for RocketReach bulk search`);
            return batch.map(() => null);
        }
        
        console.log(`[${requestId}] RocketReach bulk search: ${validQueries.length} valid queries`);
        
        // Perform bulk API call
        const bulkResult = await performBulkApiCallWithRetry(validQueries, apiKey, requestId);
        
        // Initialize results array with nulls
        const results = new Array(batch.length).fill(null);
        
        // Process bulk results and map back to original positions
        // RocketReach bulk API returns direct results with emails[] and phones[] fields
        if (bulkResult && Array.isArray(bulkResult)) {
            bulkResult.forEach((personData, queryIndex) => {
                const originalIndex = queryIndexMap.get(queryIndex);
                if (originalIndex !== undefined && personData) {
                    const enrichmentData = extractEnrichmentData(personData, requestId, originalIndex);
                    results[originalIndex] = enrichmentData;
                }
            });
        } else if (bulkResult && bulkResult.profiles && Array.isArray(bulkResult.profiles)) {
            // Fallback for legacy response format
            bulkResult.profiles.forEach((profileData, queryIndex) => {
                const originalIndex = queryIndexMap.get(queryIndex);
                if (originalIndex !== undefined && profileData && profileData.profiles && profileData.profiles.length > 0) {
                    const profile = profileData.profiles[0]; // Take the first match
                    const enrichmentData = extractEnrichmentData(profile, requestId, originalIndex);
                    results[originalIndex] = enrichmentData;
                }
            });
        }
        
        // Log batch results
        const successCount = results.filter(r => r !== null).length;
        console.log(`[${requestId}] RocketReach batch completed: ${successCount}/${batch.length} contacts enriched`);
        
        return results;
        
    } catch (error) {
        console.error(`[${requestId}] RocketReach batch processing error:`, error.message);
        return batch.map(() => null);
    }
}

/**
 * Apply rate limiting (10 requests per second)
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
            console.log(`Rate limiting: waiting ${waitTime}ms for RocketReach API`);
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
 * Build individual search query for RocketReach person lookup API
 * @param {Object} contact - Contact information
 * @returns {URLSearchParams} - API search query parameters for GET request
 */
function buildIndividualSearchQuery(contact) {
    const params = new URLSearchParams();
    
    // Essential parameter: name (required)
    params.append('name', `${contact.first_name} ${contact.last_name}`.trim());
    
    // Add current_employer if available
    if (contact.company_name && contact.company_name.trim()) {
        params.append('current_employer', contact.company_name.trim());
    }
    
    // Add title if available
    if (contact.job_title && contact.job_title.trim()) {
        params.append('title', contact.job_title.trim());
    }
    
    // Add linkedin_url if available for better matching
    if (contact.linkedin_url && contact.linkedin_url.trim()) {
        params.append('linkedin_url', contact.linkedin_url.trim());
    }
    
    // Add email if available for better matching
    if (contact.email && contact.email.trim()) {
        params.append('email', contact.email.trim());
    }
    
    return params;
}

/**
 * Build search query for RocketReach API (bulk)
 * @param {Object} contact - Contact information
 * @param {number} index - Index for bulk queries (optional)
 * @returns {Object} - API search query
 */
function buildSearchQuery(contact, index = null) {
    const query = {
        name: `${contact.first_name} ${contact.last_name}`.trim()
    };
    
    // Add company if available
    if (contact.company_name && contact.company_name.trim()) {
        query.current_employer = contact.company_name.trim() || query.name;
    }
    
    // Add title if available
    if (contact.job_title && contact.job_title.trim()) {
        query.title = contact.job_title.trim();
    }
    
    // Add location if available
    // if (contact.city && contact.state) {
    //     query.location = `${contact.city}, ${contact.state}`.trim();
    // } else if (contact.city) {
    //     query.location = contact.city.trim();
    // }
    
    // Add linkedin if available for better matching
    if (contact.linkedin_url && contact.linkedin_url.trim()) {
        query.linkedin_url = contact.linkedin_url.trim();
    }
    return query;
}

/**
 * Perform RocketReach individual API call with retry logic and exponential backoff
 * Uses the person lookup API endpoint (GET)
 * @param {URLSearchParams} searchParams - Search query parameters
 * @param {string} apiKey - API key
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} - API response
 */
async function performIndividualApiCallWithRetry(searchParams, apiKey, requestId) {
    let lastError;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
                    RETRY_CONFIG.maxDelayMs
                );
                console.log(`[${requestId}] RocketReach individual retry attempt ${attempt} after ${delay}ms`);
                await sleep(delay);
            }
            
            // RocketReach individual person lookup endpoint (GET)
            const url = `https://api.rocketreach.co/api/v2/person/lookup?${searchParams.toString()}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Api-Key': apiKey
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                
                // Handle rate limiting (429) specifically
                if (response.status === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
                    console.warn(`[${requestId}] RocketReach individual rate limited, waiting ${waitTime}ms`);
                    await sleep(waitTime);
                    continue; // Don't count as a retry attempt for rate limiting
                }
                
                // Handle server errors (5xx) - these should be retried
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }
                
                // Client errors (4xx) - don't retry these
                if (response.status >= 400) {
                    console.warn(`[${requestId}] RocketReach individual client error: ${response.status} - ${errorText}`);
                    return null;
                }
            }
            
            const result = await response.json();
            console.log(`[${requestId}] RocketReach individual API call successful`);
            return result;
            
        } catch (error) {
            lastError = error;
            console.error(`[${requestId}] RocketReach individual API attempt ${attempt + 1} failed:`, error.message);
            
            // Don't retry for network/parsing errors on the last attempt
            if (attempt === RETRY_CONFIG.maxRetries) {
                break;
            }
        }
    }
    
    throw new Error(`RocketReach individual API failed after ${RETRY_CONFIG.maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

/**
 * Perform RocketReach API call with retry logic and exponential backoff (bulk)
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
                console.log(`[${requestId}] RocketReach retry attempt ${attempt} after ${delay}ms`);
                await sleep(delay);
            }
            
            const response = await fetch('https://api.rocketreach.co/v2/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Api-Key': apiKey
                },
                body: JSON.stringify(query)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                
                // Handle rate limiting (429) specifically
                if (response.status === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
                    console.warn(`[${requestId}] RocketReach rate limited, waiting ${waitTime}ms`);
                    await sleep(waitTime);
                    continue; // Don't count as a retry attempt for rate limiting
                }
                
                // Handle server errors (5xx) - these should be retried
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }
                
                // Client errors (4xx) - don't retry these
                if (response.status >= 400) {
                    console.warn(`[${requestId}] RocketReach client error: ${response.status} - ${errorText}`);
                    return null;
                }
            }
            
            const result = await response.json();
            console.log(`[${requestId}] RocketReach API call successful`);
            return result;
            
        } catch (error) {
            lastError = error;
            console.error(`[${requestId}] RocketReach API attempt ${attempt + 1} failed:`, error.message);
            
            // Don't retry for network/parsing errors on the last attempt
            if (attempt === RETRY_CONFIG.maxRetries) {
                break;
            }
        }
    }
    
    throw new Error(`RocketReach API failed after ${RETRY_CONFIG.maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

/**
 * Perform RocketReach bulk API call with retry logic
 * @param {Array} queries - Array of search queries
 * @param {string} apiKey - API key
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<Object>} - Bulk API response
 */
async function performBulkApiCallWithRetry(queries, apiKey, requestId) {
    let lastError;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
                    RETRY_CONFIG.maxDelayMs
                );
                console.log(`[${requestId}] RocketReach bulk retry attempt ${attempt} after ${delay}ms`);
                await sleep(delay);
            }
            
            // RocketReach bulk person lookup endpoint
            const response = await fetch('https://api.rocketreach.co/api/v2/bulkLookup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Api-Key': apiKey
                },
                body: JSON.stringify({
                    queries: queries
                })
            });
            if (!response.ok) {
                console.log(`process rocketreach failed`, response);
                const errorText = await response.text();
                
                // Handle rate limiting (429) specifically
                if (response.status === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
                    console.warn(`[${requestId}] RocketReach bulk rate limited, waiting ${waitTime}ms`);
                    await sleep(waitTime);
                    continue; // Don't count as a retry attempt for rate limiting
                }
                
                // Handle server errors (5xx) - these should be retried
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }
                
                // Client errors (4xx) - don't retry these
                if (response.status >= 400) {
                    console.warn(`[${requestId}] RocketReach bulk client error: ${response.status} - ${errorText}`);
                    return null;
                }
            }
            console.log(`process rocketreach herer`, response);
            
            // Check if response has content before parsing JSON
            const contentLength = response.headers.get('content-length');
            if (contentLength === '0' || contentLength === 0) {
                console.warn(`[${requestId}] RocketReach bulk API returned empty response`);
                return null;
            }
            
            const result = await response.json();
            console.log(`process rocketreach success`, result);
            console.log(`[${requestId}] RocketReach bulk API call successful - ${queries.length} queries processed`);
            return result;
            
        } catch (error) {
            console.log(`process rocketreach error`, error);
            lastError = error;
            console.error(`[${requestId}] RocketReach bulk API attempt ${attempt + 1} failed:`, error.message);
            
            // Don't retry for network/parsing errors on the last attempt
            if (attempt === RETRY_CONFIG.maxRetries) {
                break;
            }
        }
    }
    
    throw new Error(`RocketReach bulk API failed after ${RETRY_CONFIG.maxRetries + 1} attempts. Last error: ${lastError.message}`);
}

/**
 * Extract enrichment data from RocketReach individual API response
 * @param {Object} response - RocketReach individual API response
 * @param {string} requestId - Request ID for logging
 * @returns {Object} - Extracted emails and phones
 */
function extractEnrichmentDataIndividual(response, requestId) {
    const enrichmentData = {
        emails: [],
        phones: []
    };
    
    try {
        // Extract emails from individual API response
        if (response.emails && Array.isArray(response.emails)) {
            response.emails.forEach(emailObj => {
                if (emailObj.email) {
                    enrichmentData.emails.push({
                        value: emailObj.email.toLowerCase(),
                        priority: 1,
                        source: 'rocketreach',
                        confidence: emailObj.smtp_valid === 'valid' ? 0.9 : (emailObj.grade === 'A' ? 0.8 : 0.7)
                    });
                }
            });
        }
        
        // Extract phone numbers from individual API response  
        if (response.phones && Array.isArray(response.phones)) {
            response.phones.forEach(phoneObj => {
                if (phoneObj.number) {
                    enrichmentData.phones.push({
                        value: formatPhoneNumber(phoneObj.number),
                        priority: phoneObj.recommended ? 1 : 2,
                        source: 'rocketreach',
                        confidence: phoneObj.validity === 'valid' ? 0.9 : 0.7
                    });
                }
            });
        }
        
        console.log(`[${requestId}] Extracted from RocketReach individual: ${enrichmentData.emails.length} emails, ${enrichmentData.phones.length} phones`);
        
    } catch (error) {
        console.error(`[${requestId}] Error extracting RocketReach individual data:`, error.message);
    }
    
    return enrichmentData;
}

/**
 * Extract enrichment data from RocketReach profile (bulk API)
 * @param {Object} profile - RocketReach profile data
 * @param {string} requestId - Request ID for logging
 * @param {number} contactIndex - Contact index for bulk operations (optional)
 * @returns {Object} - Extracted emails and phones
 */
function extractEnrichmentData(profile, requestId, contactIndex = null) {
    const enrichmentData = {
        emails: [],
        phones: []
    };
    
    try {
        // Extract emails
        if (profile.emails && Array.isArray(profile.emails)) {
            profile.emails.forEach(email => {
                if (email.email) {
                    enrichmentData.emails.push({
                        value: email.email.toLowerCase(),
                        priority: 1, // All RocketReach emails get same priority
                        source: 'rocketreach',
                        confidence: email.confidence || null
                    });
                }
            });
        }
        
        // Extract phone numbers
        if (profile.phones && Array.isArray(profile.phones)) {
            profile.phones.forEach(phone => {
                if (phone.number) {
                    enrichmentData.phones.push({
                        value: formatPhoneNumber(phone.number),
                        priority: 1, // All RocketReach phones get same priority
                        source: 'rocketreach',
                        confidence: phone.confidence || null
                    });
                }
            });
        }
        
        // Log extraction results
        const indexStr = contactIndex !== null ? ` (contact ${contactIndex})` : '';
        console.log(`[${requestId}] Extracted from RocketReach${indexStr}: ${enrichmentData.emails.length} emails, ${enrichmentData.phones.length} phones`);
        
    } catch (error) {
        console.error(`[${requestId}] Error extracting RocketReach data:`, error.message);
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