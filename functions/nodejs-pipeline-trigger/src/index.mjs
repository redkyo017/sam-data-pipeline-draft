import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient({});

// Pipeline configuration mapping
const getPipelineConfig = () => ({
    "ingestion": {
        stateMachineArn: process.env.INGESTION_STATE_MACHINE_ARN,
        name: "ingestion"
    },
    "enrichment": {
        stateMachineArn: process.env.ENRICHMENT_STATE_MACHINE_ARN,
        name: "enrichment"
    }
});

export const handler = async (event) => {
    try {
        console.log('Pipeline trigger event:', JSON.stringify(event, null, 2));
        
        // Extract pipeline type from path parameter
        const pipelineType = event.pathParameters?.pipelineType;
        if (!pipelineType) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Pipeline type is required in path' })
            };
        }
        
        // Get pipeline configuration
        const pipelineConfig = getPipelineConfig()[pipelineType];
        if (!pipelineConfig) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: `Unsupported pipeline type: ${pipelineType}`,
                    supportedTypes: Object.keys(getPipelineConfig())
                })
            };
        }
        
        if (!pipelineConfig.stateMachineArn) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: `State machine ARN not configured for pipeline: ${pipelineType}` 
                })
            };
        }
        
        // Get the request body
        const input = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
        
        // Start the Step Functions execution
        const result = await sfnClient.send(new StartExecutionCommand({
            stateMachineArn: pipelineConfig.stateMachineArn,
            input: input
        }));
        
        // Extract execution ID from ARN (last part after final ':')
        const executionId = result.executionArn.split(':').pop();
        
        // Return formatted response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                pipeline: pipelineConfig.name,
                executionArn: result.executionArn,
                status: "RUNNING",
                startTime: result.startDate.toISOString(),
                executionId: executionId
            })
        };
        
    } catch (error) {
        console.error('Error starting pipeline:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};