import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBPersonRepository } from '../../src/infrastructure/adapters/dynamodb-person-repository';
import { EventBridgeEventPublisher } from '../../src/infrastructure/adapters/eventbridge-event-publisher';
import { CreatePersonUseCase } from '../../src/application/use-cases/create-person';
import { createHandler } from '../../src/handlers/create-person';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createLocalDynamoDBClient, createLocalEventBridgeClient, localConfig } from './setup';

// ── Helpers ───────────────────────────────────────────────────────

function buildApiGatewayEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    httpMethod: 'POST',
    path: '/person',
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/person',
    isBase64Encoded: false,
  };
}

const validPerson = {
  firstName: 'John',
  lastName: 'Doe',
  phoneNumber: '+31612345678',
  address: {
    street: 'Keizersgracht 100',
    city: 'Amsterdam',
    postalCode: '1015AA',
    country: 'Netherlands',
  },
};

// ── Test Suite ────────────────────────────────────────────────────

describe('POST /person — integration (LocalStack)', () => {
  let handler: ReturnType<typeof createHandler>;
  let docClient: DynamoDBDocumentClient;

  beforeAll(() => {
    const dynamoClient = createLocalDynamoDBClient();
    const eventBridgeClient = createLocalEventBridgeClient();
    docClient = DynamoDBDocumentClient.from(dynamoClient);

    const repository = new DynamoDBPersonRepository(localConfig.tableName, dynamoClient);
    const publisher = new EventBridgeEventPublisher(localConfig.eventBusName, eventBridgeClient);
    const useCase = new CreatePersonUseCase(repository, publisher);

    handler = createHandler(useCase);
  });

  it('should create a person and persist it in DynamoDB', async () => {
    const event = buildApiGatewayEvent(validPerson);
    const result = await handler(event);

    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.id).toBeDefined();
    expect(body.firstName).toBe('John');
    expect(body.lastName).toBe('Doe');
    expect(body.phoneNumber).toBe('+31612345678');
    expect(body.createdAt).toBeDefined();

    // Verify the item exists in DynamoDB
    const stored = await docClient.send(
      new GetCommand({
        TableName: localConfig.tableName,
        Key: { id: body.id },
      }),
    );

    expect(stored.Item).toBeDefined();
    expect(stored.Item!.firstName).toBe('John');
    expect(stored.Item!.lastName).toBe('Doe');
    expect(stored.Item!.address.city).toBe('Amsterdam');
  });

  it('should return 400 for invalid input', async () => {
    const event = buildApiGatewayEvent({ firstName: '' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation failed');
    expect(body.errors).toBeDefined();
  });

  it('should return 400 for malformed JSON', async () => {
    const event = {
      ...buildApiGatewayEvent({}),
      body: '{ not valid json }',
    };
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
  });

  it('should return 400 for invalid phone number format', async () => {
    const event = buildApiGatewayEvent({
      ...validPerson,
      phoneNumber: '0612345678', // missing + prefix
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body);
    expect(body.errors.phoneNumber).toBeDefined();
  });

  it('should create multiple persons with unique IDs', async () => {
    const event1 = buildApiGatewayEvent(validPerson);
    const event2 = buildApiGatewayEvent({
      ...validPerson,
      firstName: 'Jane',
      phoneNumber: '+31698765432',
    });

    const [result1, result2] = await Promise.all([handler(event1), handler(event2)]);

    expect(result1.statusCode).toBe(201);
    expect(result2.statusCode).toBe(201);

    const person1 = JSON.parse(result1.body);
    const person2 = JSON.parse(result2.body);

    expect(person1.id).not.toBe(person2.id);
  });

  it('should persist all address fields correctly', async () => {
    const event = buildApiGatewayEvent(validPerson);
    const result = await handler(event);
    const body = JSON.parse(result.body);

    const stored = await docClient.send(
      new GetCommand({
        TableName: localConfig.tableName,
        Key: { id: body.id },
      }),
    );

    expect(stored.Item!.address).toEqual({
      street: 'Keizersgracht 100',
      city: 'Amsterdam',
      postalCode: '1015AA',
      country: 'Netherlands',
    });
  });
});
