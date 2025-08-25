// Unit tests for enrichment processor handler
// Tests API integration modules, deduplication logic, error handling, and file writing

import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';

// Mock AWS SDK clients before importing the handler
const mockS3Send = mock.fn();
const mockSSMSend = mock.fn();

// Mock AWS SDK modules
mock.method(await import('@aws-sdk/client-s3'), 'S3Client', function() {
    return { send: mockS3Send };
});

mock.method(await import('@aws-sdk/client-ssm'), 'SSMClient', function() {
    return { send: mockSSMSend };
});

// Mock the API modules
const mockRocketReachSearch = mock.fn();
const mockApolloSearch = mock.fn();
const mockWriteEnrichedContactToS3 = mock.fn();

mock.method(await import('../rocketreach-api.mjs'), 'searchContact', mockRocketReachSearch);
mock.method(await import('../apollo-api.mjs'), 'searchContact', mockApolloSearch);
mock.method(await import('../s3-writer.mjs'), 'writeEnrichedContactToS3', mockWriteEnrichedContactToS3);

// Now import the handler after mocking
const { handler } = await import('../index.mjs');

// Test data
const createTestEvent = (items = []) => ({
    Items: [{
        items: {
            first_name: 'John',
            last_name: 'Doe',
            company_name: 'Test Corp',
            emails: [{ email: 'john@original.com', priority: 0, source: 'original' }],
            phones: [{ phone: '+1-555-0000', priority: 0, source: 'original' }]
        },
        campaign_id: 'test-campaign',
        commit_id: 'test-commit'
    }]
});

const createTestContext = () => ({
    awsRequestId: 'test-request-123',
    functionName: 'EnrichmentProcessor-test',
    memoryLimitInMB: 512,
    getRemainingTimeInMillis: () => 300000
});

// Set up environment variables
process.env.ROCKETREACH_API_KEY_PARAM = '/test/rocketreach/key';
process.env.APOLLO_API_KEY_PARAM = '/test/apollo/key';
process.env.BUCKET_NAME = 'test-bucket';

describe('Enrichment Processor Handler', () => {
    before(() => {
        // Setup default SSM mock responses for API keys
        mockSSMSend.mock.mockImplementation((command) => {
            if (command.input?.Name?.includes('rocketreach')) {
                return Promise.resolve({ Parameter: { Value: 'mock-rocketreach-key' } });
            }
            if (command.input?.Name?.includes('apollo')) {
                return Promise.resolve({ Parameter: { Value: 'mock-apollo-key' } });
            }
            return Promise.reject(new Error('Unknown parameter'));
        });
    });

    after(() => {
        // Reset all mocks after tests
        mockS3Send.mock.resetCalls();
        mockSSMSend.mock.resetCalls();
        mockRocketReachSearch.mock.resetCalls();
        mockApolloSearch.mock.resetCalls();
        mockWriteEnrichedContactToS3.mock.resetCalls();
    });

    describe('Input Validation', () => {
        it('should handle empty event gracefully', async () => {
            const result = await handler(null, createTestContext());
            assert.deepStrictEqual(result, []);
        });

        it('should handle event without Items', async () => {
            const result = await handler({}, createTestContext());
            assert.deepStrictEqual(result, []);
        });

        it('should handle event with empty Items array', async () => {
            const result = await handler({ Items: [] }, createTestContext());
            assert.deepStrictEqual(result, []);
        });

        it('should handle malformed items in batch', async () => {
            const event = {
                Items: [
                    { items: null }, // Invalid item
                    { items: { first_name: 'Jane', last_name: 'Smith' } } // Valid item
                ]
            };

            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve(null));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve(null));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(event, createTestContext());
            assert.strictEqual(result.length, 1); // Only one valid item processed
        });
    });

    describe('Environment Variable Validation', () => {
        it('should throw error when ROCKETREACH_API_KEY_PARAM is missing', async () => {
            delete process.env.ROCKETREACH_API_KEY_PARAM;
            
            const result = await handler(createTestEvent(), createTestContext());
            assert.deepStrictEqual(result, []); // Should return empty array on error
            
            process.env.ROCKETREACH_API_KEY_PARAM = '/test/rocketreach/key';
        });

        it('should throw error when APOLLO_API_KEY_PARAM is missing', async () => {
            delete process.env.APOLLO_API_KEY_PARAM;
            
            const result = await handler(createTestEvent(), createTestContext());
            assert.deepStrictEqual(result, []);
            
            process.env.APOLLO_API_KEY_PARAM = '/test/apollo/key';
        });

        it('should throw error when BUCKET_NAME is missing', async () => {
            delete process.env.BUCKET_NAME;
            
            const result = await handler(createTestEvent(), createTestContext());
            assert.deepStrictEqual(result, []);
            
            process.env.BUCKET_NAME = 'test-bucket';
        });
    });

    describe('API Integration', () => {
        it('should call both RocketReach and Apollo APIs in parallel', async () => {
            const rocketReachData = {
                emails: [{ email: 'john@rocketreach.com', priority: 1, source: 'rocketreach' }],
                phones: [{ phone: '+1-555-1111', priority: 1, source: 'rocketreach' }]
            };
            const apolloData = {
                emails: [{ email: 'john@apollo.com', priority: 1, source: 'apollo' }],
                phones: [{ phone: '+1-555-2222', priority: 1, source: 'apollo' }]
            };

            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve(rocketReachData));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve(apolloData));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(mockRocketReachSearch.mock.callCount(), 1);
            assert.strictEqual(mockApolloSearch.mock.callCount(), 1);
            assert.strictEqual(result.length, 1);
            
            const enrichedContact = result[0];
            assert.strictEqual(enrichedContact.enrichment_metadata.rocketreach_success, true);
            assert.strictEqual(enrichedContact.enrichment_metadata.apollo_success, true);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_emails_added, 2);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_phones_added, 2);
        });

        it('should handle RocketReach API failure gracefully', async () => {
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.reject(new Error('RocketReach API error')));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({
                emails: [{ email: 'john@apollo.com', priority: 1, source: 'apollo' }],
                phones: []
            }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(result.length, 1);
            const enrichedContact = result[0];
            assert.strictEqual(enrichedContact.enrichment_metadata.rocketreach_success, false);
            assert.strictEqual(enrichedContact.enrichment_metadata.apollo_success, true);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_emails_added, 1);
        });

        it('should handle Apollo API failure gracefully', async () => {
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve({
                emails: [{ email: 'john@rocketreach.com', priority: 1, source: 'rocketreach' }],
                phones: []
            }));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.reject(new Error('Apollo API error')));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(result.length, 1);
            const enrichedContact = result[0];
            assert.strictEqual(enrichedContact.enrichment_metadata.rocketreach_success, true);
            assert.strictEqual(enrichedContact.enrichment_metadata.apollo_success, false);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_emails_added, 1);
        });

        it('should handle both API failures gracefully', async () => {
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.reject(new Error('RocketReach error')));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.reject(new Error('Apollo error')));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(result.length, 1);
            const enrichedContact = result[0];
            assert.strictEqual(enrichedContact.enrichment_metadata.rocketreach_success, false);
            assert.strictEqual(enrichedContact.enrichment_metadata.apollo_success, false);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_emails_added, 0);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_phones_added, 0);
        });
    });

    describe('Data Deduplication', () => {
        it('should deduplicate emails with same address', async () => {
            const rocketReachData = {
                emails: [{ email: 'john@company.com', priority: 1, source: 'rocketreach' }],
                phones: []
            };
            const apolloData = {
                emails: [{ email: 'john@company.com', priority: 1, source: 'apollo' }], // Duplicate
                phones: []
            };

            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve(rocketReachData));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve(apolloData));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            const enrichedContact = result[0];
            // Should have original email + 1 new unique email (duplicate removed)
            assert.strictEqual(enrichedContact.emails.length, 2);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_emails_added, 1);
        });

        it('should deduplicate phones with same number', async () => {
            const rocketReachData = {
                emails: [],
                phones: [{ phone: '+1-555-9999', priority: 1, source: 'rocketreach' }]
            };
            const apolloData = {
                emails: [],
                phones: [{ phone: '15559999', priority: 1, source: 'apollo' }] // Same number, different format
            };

            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve(rocketReachData));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve(apolloData));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            const enrichedContact = result[0];
            // Should have original phone + 1 new unique phone (duplicate removed based on normalized digits)
            assert.strictEqual(enrichedContact.phones.length, 2);
            assert.strictEqual(enrichedContact.enrichment_metadata.total_phones_added, 1);
        });

        it('should prioritize original contact data over enrichment data', async () => {
            const originalEmail = 'john@original.com';
            const rocketReachData = {
                emails: [{ email: originalEmail, priority: 1, source: 'rocketreach' }], // Same as original
                phones: []
            };

            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve(rocketReachData));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            const enrichedContact = result[0];
            assert.strictEqual(enrichedContact.emails.length, 1); // Only original email
            assert.strictEqual(enrichedContact.emails[0].source, 'original'); // Original takes priority
            assert.strictEqual(enrichedContact.enrichment_metadata.total_emails_added, 0); // No new emails added
        });
    });

    describe('File Writing Functionality', () => {
        it('should write individual enriched contacts to S3', async () => {
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('s3-key-123'));

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(mockWriteEnrichedContactToS3.mock.callCount(), 1);
            
            // Verify S3 writer was called with correct parameters
            const writeCall = mockWriteEnrichedContactToS3.mock.calls[0];
            assert.strictEqual(writeCall.arguments.length, 5); // s3Client, contact, campaign_id, commit_id, requestId
            assert.strictEqual(writeCall.arguments[2], 'test-campaign');
            assert.strictEqual(writeCall.arguments[3], 'test-commit');
        });

        it('should handle S3 write failures gracefully', async () => {
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve(null)); // Write failure

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(result.length, 1); // Should still return the contact
            // Processing should continue even if file write fails
        });

        it('should continue processing other contacts if one contact processing fails', async () => {
            const event = {
                Items: [{
                    items: [
                        { first_name: 'John', last_name: 'Doe' }, // This will succeed
                        { first_name: 'Jane', last_name: 'Smith' } // This will also succeed
                    ],
                    campaign_id: 'test-campaign',
                    commit_id: 'test-commit'
                }]
            };

            // First contact - success
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('file-1'));

            // Second contact - success  
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({ emails: [], phones: [] }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('file-2'));

            const result = await handler(event, createTestContext());
            
            assert.strictEqual(result.length, 2); // Both contacts processed successfully
            assert.strictEqual(mockWriteEnrichedContactToS3.mock.callCount(), 2); // Both files written
        });
    });

    describe('Error Handling', () => {
        it('should return empty array on complete handler failure', async () => {
            // Simulate complete failure by making SSM fail
            mockSSMSend.mock.mockImplementationOnce(() => Promise.reject(new Error('SSM failure')));

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.deepStrictEqual(result, []); // Should return empty array to maintain pipeline flow
        });

        it('should handle individual contact processing errors', async () => {
            // Force an error during enrichment by making one of the mocked functions throw
            mockRocketReachSearch.mock.mockImplementationOnce(() => {
                throw new Error('Unexpected error in enrichment');
            });

            const result = await handler(createTestEvent(), createTestContext());
            
            assert.strictEqual(result.length, 1); // Should still return a contact record
            const contact = result[0];
            assert.strictEqual(contact.enrichment_metadata.error, 'Unexpected error in enrichment');
            assert.strictEqual(contact.enrichment_metadata.rocketreach_success, false);
            assert.strictEqual(contact.enrichment_metadata.apollo_success, false);
        });
    });

    describe('Metadata Generation', () => {
        it('should generate comprehensive enrichment metadata', async () => {
            mockRocketReachSearch.mock.mockImplementationOnce(() => Promise.resolve({
                emails: [{ email: 'rr@test.com', priority: 1, source: 'rocketreach' }],
                phones: [{ phone: '+1-555-1111', priority: 1, source: 'rocketreach' }]
            }));
            mockApolloSearch.mock.mockImplementationOnce(() => Promise.resolve({
                emails: [{ email: 'ap@test.com', priority: 1, source: 'apollo' }],
                phones: []
            }));
            mockWriteEnrichedContactToS3.mock.mockImplementationOnce(() => Promise.resolve('test-file-key'));

            const result = await handler(createTestEvent(), createTestContext());
            
            const metadata = result[0].enrichment_metadata;
            assert.ok(metadata.enriched_at);
            assert.ok(typeof metadata.enrichment_time_ms === 'number');
            assert.strictEqual(metadata.rocketreach_success, true);
            assert.strictEqual(metadata.apollo_success, true);
            assert.strictEqual(metadata.total_emails_added, 2);
            assert.strictEqual(metadata.total_phones_added, 1);
            assert.deepStrictEqual(metadata.enrichment_sources, ['rocketreach', 'apollo']);
        });
    });
});