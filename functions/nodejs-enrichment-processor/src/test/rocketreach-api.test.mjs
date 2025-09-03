// Unit tests for RocketReach API integration module
// Tests API rate limiting, retry logic, and data extraction

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock global fetch
global.fetch = mock.fn();

const { searchContact } = await import('../rocketreach-api.mjs');

describe('RocketReach API Integration', () => {
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
                    json: () => Promise.resolve({ profiles: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const fetchCall = fetch.mock.calls[0];
            const requestBody = JSON.parse(fetchCall.arguments[1].body);
            
            assert.strictEqual(requestBody.name, 'John Doe');
            assert.strictEqual(fetchCall.arguments[1].headers['Api-Key'], 'test-key');
        });

        it('should include company in search query when provided', async () => {
            const contact = { 
                first_name: 'John', 
                last_name: 'Doe', 
                company_name: 'Test Corp' 
            };
            
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const requestBody = JSON.parse(fetch.mock.calls[0].arguments[1].body);
            assert.strictEqual(requestBody.current_employer, 'Test Corp');
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
                    json: () => Promise.resolve({ profiles: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const requestBody = JSON.parse(fetch.mock.calls[0].arguments[1].body);
            assert.strictEqual(requestBody.title, 'Engineer');
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
                    json: () => Promise.resolve({ profiles: [] })
                })
            );

            await searchContact(contact, 'test-key', 'test-req');
            
            const requestBody = JSON.parse(fetch.mock.calls[0].arguments[1].body);
            assert.strictEqual(requestBody.location, 'San Francisco, CA');
        });
    });

    describe('API Response Handling', () => {
        it('should return null when no profiles found', async () => {
            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result, null);
        });

        it('should extract emails and phones from profile data', async () => {
            const mockProfile = {
                emails: [
                    { email: 'john@test.com', confidence: 0.9 },
                    { email: 'john.doe@company.com', confidence: 0.8 }
                ],
                phones: [
                    { number: '+1-555-123-4567', confidence: 0.85 },
                    { number: '5551234567', confidence: 0.75 }
                ]
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [mockProfile] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.emails.length, 2);
            assert.strictEqual(result.phones.length, 2);
            assert.strictEqual(result.emails[0].email, 'john@test.com');
            assert.strictEqual(result.emails[0].source, 'rocketreach');
            assert.strictEqual(result.emails[0].confidence, 0.9);
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
            assert.strictEqual(result.phones[0].source, 'rocketreach');
        });

        it('should filter out invalid emails', async () => {
            const mockProfile = {
                emails: [
                    { email: 'john@test.com', confidence: 0.9 },
                    { email: 'invalid-email', confidence: 0.8 }, // Invalid format
                    { email: '', confidence: 0.7 } // Empty email
                ],
                phones: []
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [mockProfile] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.emails.length, 1); // Only valid email
            assert.strictEqual(result.emails[0].email, 'john@test.com');
        });

        it('should filter out invalid phone numbers', async () => {
            const mockProfile = {
                emails: [],
                phones: [
                    { number: '+1-555-123-4567', confidence: 0.9 },
                    { number: '123', confidence: 0.8 }, // Too short
                    { number: '', confidence: 0.7 } // Empty
                ]
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [mockProfile] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones.length, 1); // Only valid phone
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
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
                    headers: new Map([['retry-after', '1']]),
                    text: () => Promise.resolve('Rate limited')
                })
            );

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(fetch.mock.callCount(), 2); // Should retry once
            assert.strictEqual(result, null); // No profiles returned
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
                    json: () => Promise.resolve({ profiles: [] })
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
            const mockProfile = {
                emails: [],
                phones: [{ number: '5551234567', confidence: 0.9 }]
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [mockProfile] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
        });

        it('should format 11-digit US numbers correctly', async () => {
            const mockProfile = {
                emails: [],
                phones: [{ number: '15551234567', confidence: 0.9 }]
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [mockProfile] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones[0].phone, '+1-555-123-4567');
        });

        it('should preserve international number formats', async () => {
            const mockProfile = {
                emails: [],
                phones: [{ number: '+44-20-1234-5678', confidence: 0.9 }]
            };

            fetch.mock.mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ profiles: [mockProfile] })
                })
            );

            const contact = { first_name: 'John', last_name: 'Doe' };
            const result = await searchContact(contact, 'test-key', 'test-req');
            
            assert.strictEqual(result.phones[0].phone, '+44-20-1234-5678');
        });
    });
});