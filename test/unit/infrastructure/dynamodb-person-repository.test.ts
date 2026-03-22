import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBPersonRepository } from '../../../src/infrastructure/adapters/dynamodb-person-repository';
import { Person } from '../../../src/domain/models/person';

const ddbMock = mockClient(DynamoDBDocumentClient);

const TABLE_NAME = 'test-person-table';

const person: Person = {
  id: 'abc-123',
  firstName: 'John',
  lastName: 'Doe',
  phoneNumber: '+31612345678',
  address: {
    street: 'Example Street 1',
    city: 'Amsterdam',
    postalCode: '1234AB',
    country: 'Netherlands',
  },
  createdAt: '2024-01-15T10:30:00.000Z',
};

describe('DynamoDBPersonRepository', () => {
  let repository: DynamoDBPersonRepository;

  beforeEach(() => {
    ddbMock.reset();
    repository = new DynamoDBPersonRepository(TABLE_NAME);
  });

  it('should save a person to DynamoDB with the correct table and item', async () => {
    ddbMock.on(PutCommand).resolves({});

    await repository.save(person);

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);

    const input = calls[0].args[0].input;
    expect(input.TableName).toBe(TABLE_NAME);
    expect(input.Item).toEqual({
      id: 'abc-123',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+31612345678',
      address: person.address,
      createdAt: '2024-01-15T10:30:00.000Z',
    });
  });

  it('should propagate DynamoDB errors', async () => {
    ddbMock.on(PutCommand).rejects(new Error('DynamoDB is down'));

    await expect(repository.save(person)).rejects.toThrow('DynamoDB is down');
  });
});
