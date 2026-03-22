/**
 * We mock the infrastructure modules so the module-level wiring in
 * create-person.ts does not require real AWS credentials or env vars.
 * We then test the exported `createHandler` factory with a mock use case.
 */
jest.mock('../../../src/infrastructure/config', () => ({
  getConfig: () => ({ tableName: 'test-table', eventBusName: 'test-bus' }),
}));
jest.mock('../../../src/infrastructure/adapters/dynamodb-person-repository');
jest.mock('../../../src/infrastructure/adapters/eventbridge-event-publisher');

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createHandler } from '../../../src/handlers/create-person';
import { Person } from '../../../src/domain/models/person';

// --- Test helpers ---

function apiEvent(
  body: unknown,
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/person',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/person',
    ...overrides,
  } as APIGatewayProxyEvent;
}

const validBody = {
  firstName: 'John',
  lastName: 'Doe',
  phoneNumber: '+31612345678',
  address: {
    street: 'Example Street 1',
    city: 'Amsterdam',
    postalCode: '1234AB',
    country: 'Netherlands',
  },
};

const mockPerson: Person = {
  id: 'generated-uuid',
  ...validBody,
  createdAt: '2024-01-15T10:30:00.000Z',
};

// --- Tests ---

describe('CreatePerson Handler', () => {
  const mockExecute = jest.fn();
  const handler = createHandler({ execute: mockExecute });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue(mockPerson);
  });

  it('should return 201 with the created person on valid input', async () => {
    const result = await handler(apiEvent(validBody));

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual(mockPerson);
    expect(mockExecute).toHaveBeenCalledWith(validBody);
  });

  it('should return 400 when body is invalid JSON', async () => {
    const result = await handler(apiEvent('not-json{'));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('should return 400 when body is null', async () => {
    const event = apiEvent(null);
    event.body = null;
    const result = await handler(event);

    // null body → parsed as {} → fails validation
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Validation failed');
  });

  it('should return 400 with field errors on missing required fields', async () => {
    const result = await handler(apiEvent({}));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation failed');
    expect(body.errors).toBeDefined();
    expect(body.errors.firstName).toBeDefined();
    expect(body.errors.lastName).toBeDefined();
    expect(body.errors.phoneNumber).toBeDefined();
    expect(body.errors.address).toBeDefined();
  });

  it('should return 400 on invalid phone number format', async () => {
    const result = await handler(apiEvent({ ...validBody, phoneNumber: 'invalid' }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errors.phoneNumber).toBeDefined();
  });

  it('should return 500 when the use case throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB exploded'));

    const result = await handler(apiEvent(validBody));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should set Content-Type header on all responses', async () => {
    const success = await handler(apiEvent(validBody));
    expect(success.headers?.['Content-Type']).toBe('application/json');

    const failure = await handler(apiEvent({}));
    expect(failure.headers?.['Content-Type']).toBe('application/json');
  });
});
