// Unit tests for Apollo.io API integration module
// Tests API rate limiting, retry logic, and data extraction

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock global fetch
global.fetch = mock.fn();

const { searchContact } = await import('../apollo-api.mjs');

describe('Apollo.io API Integration', () => {
    beforeEach(() => {
        fetch.mock.resetCalls();
    });

    describe('Input Validation', () => {
        it('should return null when API key is not provided', async () => {
            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, null, 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should return null when first_name is missing', async () => {
            const contact = { last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should return null when last_name is missing', async () => {
            const contact = { first_name: 'John' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });
    });

    describe('API Request Formation', () => {
        it('should build search query with name only', async () => {
            const contact = { first_name: 'John', last_name: 'Doe' };
            
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const fetchCall = fetch.mock.calls[0];
            const requestBody = JSON.parse(fetchCall.arguments[1].body);
            
            assert.strictEqual(requestBody.first_name, 'John');
            assert.strictEqual(requestBody.last_name, 'Doe');
            assert.strictEqual(requestBody.per_page, 1);
            assert.strictEqual(requestBody.reveal_personal_emails, true);
            assert.strictEqual(requestBody.reveal_phone_number, true);
            assert.strictEqual(fetchCall.arguments[1].headers['X-Api-Key'], 'test-key');
        });

        it('should include organization in search query when provided', async () => {
            const contact = { 
                first_name: 'John', 
                last_name: 'Doe', 
                company_name: 'Test Corp' 
            };
            
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const requestBody = JSON.parse(fetch.mock.calls[0].arguments[1].body);
            assert.deepStrictEqual(requestBody.organization_names, ['Test Corp']);
        });

        it('should include job title in search query when provided', async () => {
            const contact = { 
                first_name: 'John', 
                last_name: 'Doe', 
                job_title: 'Engineer' 
            };
            
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const requestBody = JSON.parse(fetch.mock.calls[0].arguments[1].body);
            assert.deepStrictEqual(requestBody.person_titles, ['Engineer']);
        });

        it('should include location in search query when provided', async () => {
            const contact = { 
                first_name: 'John', 
                last_name: 'Doe', 
                city: 'San Francisco',
                state: 'CA'
            };
            
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const requestBody = JSON.parse(fetch.mock.calls[0].arguments[1].body);
            assert.deepStrictEqual(requestBody.person_locations, ['San Francisco, CA']);
        });
    });

    describe('API Response Handling', () => {
        it('should return null when no people found', async () => {
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should extract emails and phones from person data', async () => {
            const mockPerson = {
                email: 'john@test.com',
                email_status: 'verified',
                personal_emails: ['john.personal@gmail.com'],
                sanitized_phone: '+1-555-123-4567',
                corporate_phone: '+1-555-987-6543'
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.emails.length, 2); // Primary + personal
            assert.strictEqual(result.phones.length, 2); // Sanitized + corporate
            
            // Check primary email
            assert.strictEqual(result.emails[0].email, 'john@test.com');
            assert.strictEqual(result.emails[0].source, 'apollo');
            assert.strictEqual(result.emails[0].priority, 1);
            assert.strictEqual(result.emails[0].confidence, 0.9); // Verified status
            
            // Check personal email
            assert.strictEqual(result.emails[1].email, 'john.personal@gmail.com');
            assert.strictEqual(result.emails[1].priority, 2); // Lower priority
            
            // Check primary phone
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
            assert.strictEqual(result.phones[0].source, 'apollo');
            assert.strictEqual(result.phones[0].priority, 1);
            
            // Check corporate phone
            assert.strictEqual(result.phones[1].phone, '+1-555-987-6543');
            assert.strictEqual(result.phones[1].priority, 2); // Lower priority
        });

        it('should handle verified vs unverified email status', async () => {
            const mockPerson = {
                email: 'john@test.com',
                email_status: 'unverified',
                personal_emails: [],
                sanitized_phone: null,
                corporate_phone: null
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.emails[0].confidence, 0.7); // Lower confidence for unverified
        });

        it('should filter out invalid emails', async () => {
            const mockPerson = {
                email: 'invalid-email', // Invalid format
                personal_emails: ['valid@test.com', '', 'also-invalid'], // Mix of valid/invalid
                sanitized_phone: null,
                corporate_phone: null
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.emails.length, 1); // Only valid@test.com
            assert.strictEqual(result.emails[0].email, 'valid@test.com');
        });

        it('should filter out invalid phone numbers', async () => {
            const mockPerson = {
                email: null,
                personal_emails: [],
                sanitized_phone: '123', // Too short
                corporate_phone: '+1-555-123-4567' // Valid
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones.length, 1); // Only corporate phone
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
        });

        it('should avoid duplicate phones when sanitized and corporate are same', async () => {
            const mockPerson = {
                email: null,
                personal_emails: [],
                sanitized_phone: '+1-555-123-4567',
                corporate_phone: '+1-555-123-4567' // Same as sanitized
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones.length, 1); // No duplicate
        });
    });

    describe('Error Handling', () => {
        it('should return null on 4xx client errors', async () => {
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: false,
                    status: 400,
                    text: () => Promise.resolve('Bad request')
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should retry on 429 rate limiting', async () => {
            // First call returns 429, second call succeeds
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: false,
                    status: 429,
                    headers: new Map([['retry-after', '2']]),
                    text: () => Promise.resolve('Rate limited')
                })
            );

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(fetch.mock.callCount(), 2); // Should retry once
            assert.strictEqual(result, null); // No people returned
        });

        it('should retry on 5xx server errors', async () => {
            // First call returns 500, second call succeeds
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: false,
                    status: 500,
                    text: () => Promise.resolve('Server error')
                })
            );

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(fetch.mock.callCount(), 2); // Should retry once
        });

        it('should return null after max retries exceeded', async () => {
            // Mock all retry attempts to fail
            for (let i = 0; i <= 3; i++) { // maxRetries + 1
                fetch.mock.mockImplementationOnce(() => 
                    Promise.resolve({
                        ok: false,
                        status: 500,
                        text: () => Promise.resolve('Server error')
                    })
                );
            }

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should handle network errors gracefully', async () => {
            fetch.mock.mockImplementationOnce(() => 
                Promise.reject(new Error('Network error'))
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should handle JSON parsing errors gracefully', async () => {
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.reject(new Error('Invalid JSON'))
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });
    });

    describe('Phone Number Formatting', () => {
        it('should format 10-digit US numbers correctly', async () => {
            const mockPerson = {
                email: null,
                personal_emails: [],
                sanitized_phone: '5551234567',
                corporate_phone: null
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
        });

        it('should format 11-digit US numbers correctly', async () => {
            const mockPerson = {
                email: null,
                personal_emails: [],
                sanitized_phone: '15551234567',
                corporate_phone: null
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
        });

        it('should preserve international number formats', async () => {
            const mockPerson = {
                email: null,
                personal_emails: [],
                sanitized_phone: '+44-20-1234-5678',
                corporate_phone: null
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ people: [mockPerson] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones[0].phone, '+44-20-1234-5678');
        });
    });
});