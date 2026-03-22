import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566';
const REGION = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

const localstackConfig = {
  endpoint: LOCALSTACK_ENDPOINT,
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
};

export function createLocalDynamoDBClient(): DynamoDBClient {
  return new DynamoDBClient(localstackConfig);
}

export function createLocalEventBridgeClient(): EventBridgeClient {
  return new EventBridgeClient(localstackConfig);
}

export const localConfig = {
  tableName: process.env.TABLE_NAME ?? 'person-local',
  eventBusName: process.env.EVENT_BUS_NAME ?? 'person-events-local',
  endpoint: LOCALSTACK_ENDPOINT,
  region: REGION,
};
