import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Person } from '../../domain/models/person';
import { PersonRepository } from '../../domain/ports/person-repository';

export class DynamoDBPersonRepository implements PersonRepository {
  private readonly docClient: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client?: DynamoDBClient,
  ) {
    this.docClient = DynamoDBDocumentClient.from(client ?? new DynamoDBClient({}));
  }

  async save(person: Person): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          phoneNumber: person.phoneNumber,
          address: person.address,
          createdAt: person.createdAt,
        },
      }),
    );
  }
}
