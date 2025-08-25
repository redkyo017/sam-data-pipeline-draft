ROOT_DIR:=$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))

run:
	docker run -p 8083:8083 \
  	--mount type=bind,readonly,source=$(ROOT_DIR)/statemachine/test/MockConfigFile.json,destination=/home/StepFunctionsLocal/MockConfigFile.json \
  	-e SFN_MOCK_CONFIG="/home/StepFunctionsLocal/MockConfigFile.json" \
  	amazon/aws-stepfunctions-local

create:
	sed -E -e 's/\$$\{.+\}/arn:aws:lambda:ap-southeast-1:123456789012:function:mock/' statemachine/ingestion_pipeline.asl.json > statemachine/test/mocked.test.asl.json
	aws stepfunctions create-state-machine \
		--endpoint-url http://localhost:8083 \
		--definition file://statemachine/test/mocked.test.asl.json \
		--name "DataPipelineLocalTesting" \
		--role-arn "arn:aws:iam::123456789012:role/DummyRole" \
		--no-cli-pager
	rm statemachine/test/mocked.test.asl.json

datapipelinetest:
	aws stepfunctions start-execution \
		--endpoint http://localhost:8083 \
		--name DataPipelineTest \
		--state-machine arn:aws:states:ap-southeast-1:123456789012:stateMachine:DataPipelineLocalTesting \
		--input '{"body": "{\"Bucket\": \"test-input-bucket\", \"Key\": \"test-data.csv\"}"}' \
		--no-cli-pager

csvingestiontest:
	aws stepfunctions start-execution \
		--endpoint http://localhost:8083 \
		--name CSVIngestionTest \
		--state-machine arn:aws:states:ap-southeast-1:123456789012:stateMachine:DataPipelineLocalTesting \
		--input '{"body": "{\"Bucket\": \"test-input-bucket\", \"Key\": \"sample.csv\"}"}' \
		--no-cli-pager

all: create datapipelinetest csvingestiontest 

datapipelinehistory:
	aws stepfunctions get-execution-history \
		--endpoint http://localhost:8083 \
		--execution-arn arn:aws:states:ap-southeast-1:123456789012:execution:DataPipelineLocalTesting:DataPipelineTest \
		--query 'events[?type==`TaskStateExited`]' \
		--no-cli-pager

csvingestionhistory:
	aws stepfunctions get-execution-history \
		--endpoint http://localhost:8083 \
		--execution-arn arn:aws:states:ap-southeast-1:123456789012:execution:DataPipelineLocalTesting:CSVIngestionTest \
		--query 'events[?type==`TaskStateExited`]' \
		--no-cli-pager

history: datapipelinehistory csvingestionhistory