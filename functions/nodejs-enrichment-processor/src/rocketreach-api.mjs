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
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
};

/**
 * Search for contact information using RocketReach API
 * @param {Object} contact - Contact object with name, company, etc.
 * @param {string} apiKey - RocketReach API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Object>} - Enriched contact data or null
 */
export async function searchContact(contact, apiKey, requestId) {
    if (!apiKey) {
        console.error(`[${requestId}] RocketReach API key not provided`);
        return null;
    }
    
    if (!contact.first_name || !contact.last_name) {
        console.warn(`[${requestId}] Insufficient data for RocketReach search: missing name`);
        return null;
    }
    
    try {
        // Apply rate limiting
        await applyRateLimit();
        
        // Build search query
        const searchQuery = buildSearchQuery(contact);
        console.log(`[${requestId}] RocketReach search query:`, searchQuery);
        
        // Perform API call with retry logic
        const result = await performApiCallWithRetry(searchQuery, apiKey, requestId);
        
        if (result && result.profiles && result.profiles.length > 0) {
            const profile = result.profiles[0]; // Take the first match
            const enrichmentData = extractEnrichmentData(profile, requestId);
            
            console.log(`[${requestId}] RocketReach enrichment found:`, {
                emails: enrichmentData.emails.length,
                phones: enrichmentData.phones.length
            });
            
            return enrichmentData;
        } else {
            console.log(`[${requestId}] No RocketReach results found for ${contact.first_name} ${contact.last_name}`);
            return null;
        }
        
    } catch (error) {
        console.error(`[${requestId}] RocketReach API error:`, error.message);
        return null;
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
 * Build search query for RocketReach API
 * @param {Object} contact - Contact information
 * @returns {Object} - API search query
 */
function buildSearchQuery(contact) {
    const query = {
        name: `${contact.first_name} ${contact.last_name}`.trim()
    };
    
    // Add company if available
    if (contact.company_name && contact.company_name.trim()) {
        query.current_employer = contact.company_name.trim();
    }
    
    // Add title if available
    if (contact.job_title && contact.job_title.trim()) {
        query.title = contact.job_title.trim();
    }
    
    // Add location if available
    if (contact.city && contact.state) {
        query.location = `${contact.city}, ${contact.state}`.trim();
    } else if (contact.city) {
        query.location = contact.city.trim();
    }
    
    return query;
}

/**
 * Perform RocketReach API call with retry logic and exponential backoff
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
 * Extract enrichment data from RocketReach profile
 * @param {Object} profile - RocketReach profile data
 * @param {string} requestId - Request ID for logging
 * @returns {Object} - Extracted emails and phones
 */
function extractEnrichmentData(profile, requestId) {
    const enrichmentData = {
        emails: [],
        phones: []
    };
    
    try {
        // Extract emails
        if (profile.emails && Array.isArray(profile.emails)) {
            profile.emails.forEach(email => {
                if (email.email && isValidEmail(email.email)) {
                    enrichmentData.emails.push({
                        email: email.email.toLowerCase(),
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
                if (phone.number && isValidPhone(phone.number)) {
                    enrichmentData.phones.push({
                        phone: formatPhoneNumber(phone.number),
                        priority: 1, // All RocketReach phones get same priority
                        source: 'rocketreach',
                        confidence: phone.confidence || null
                    });
                }
            });
        }
        
        // Log extraction results
        console.log(`[${requestId}] Extracted from RocketReach: ${enrichmentData.emails.length} emails, ${enrichmentData.phones.length} phones`);
        
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