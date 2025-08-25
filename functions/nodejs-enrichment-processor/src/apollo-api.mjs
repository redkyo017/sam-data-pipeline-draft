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
 * Search for contact information using Apollo.io API
 * @param {Object} contact - Contact object with name, company, etc.
 * @param {string} apiKey - Apollo.io API key
 * @param {string} requestId - Request ID for logging correlation
 * @returns {Promise<Object>} - Enriched contact data or null
 */
export async function searchContact(contact, apiKey, requestId) {
    if (!apiKey) {
        console.error(`[${requestId}] Apollo.io API key not provided`);
        return null;
    }
    
    if (!contact.first_name || !contact.last_name) {
        console.warn(`[${requestId}] Insufficient data for Apollo.io search: missing name`);
        return null;
    }
    
    try {
        // Apply rate limiting
        await applyRateLimit();
        
        // Build search query
        const searchQuery = buildSearchQuery(contact);
        console.log(`[${requestId}] Apollo.io search query:`, searchQuery);
        
        // Perform API call with retry logic
        const result = await performApiCallWithRetry(searchQuery, apiKey, requestId);
        
        if (result && result.people && result.people.length > 0) {
            const person = result.people[0]; // Take the first match
            const enrichmentData = extractEnrichmentData(person, requestId);
            
            console.log(`[${requestId}] Apollo.io enrichment found:`, {
                emails: enrichmentData.emails.length,
                phones: enrichmentData.phones.length
            });
            
            return enrichmentData;
        } else {
            console.log(`[${requestId}] No Apollo.io results found for ${contact.first_name} ${contact.last_name}`);
            return null;
        }
        
    } catch (error) {
        console.error(`[${requestId}] Apollo.io API error:`, error.message);
        return null;
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
 * Build search query for Apollo.io API
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
 * Extract enrichment data from Apollo.io person profile
 * @param {Object} person - Apollo.io person data
 * @param {string} requestId - Request ID for logging
 * @returns {Object} - Extracted emails and phones
 */
function extractEnrichmentData(person, requestId) {
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
        console.log(`[${requestId}] Extracted from Apollo.io: ${enrichmentData.emails.length} emails, ${enrichmentData.phones.length} phones`);
        
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