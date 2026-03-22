import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { CreatePersonInput, Person } from '../domain/models/person';
import { createPersonSchema } from '../shared/validation';
import { CreatePersonUseCase } from '../application/use-cases/create-person';
import { DynamoDBPersonRepository } from '../infrastructure/adapters/dynamodb-person-repository';
import { EventBridgeEventPublisher } from '../infrastructure/adapters/eventbridge-event-publisher';
import { getConfig } from '../infrastructure/config';
import { logger } from '../infrastructure/logger';

// --- Port interface for testability ---

interface CreatePersonPort {
  execute(input: CreatePersonInput): Promise<Person>;
}

// --- Response helper ---

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// --- Handler factory (exported for unit tests) ---

export function createHandler(useCase: CreatePersonPort) {
  return async (event: APIGatewayProxyEvent, context?: Context): Promise<APIGatewayProxyResult> => {
    if (context) {
      logger.addContext(context);
    }
    logger.setCorrelationId(event.requestContext?.requestId ?? 'unknown');
    logger.logEventIfEnabled(event);

    try {
      let body: unknown;
      try {
        body = JSON.parse(event.body ?? '{}');
      } catch {
        return response(400, { message: 'Invalid JSON body' });
      }

      const result = createPersonSchema.safeParse(body);
      if (!result.success) {
        logger.warn('Validation failed', { errors: result.error.flatten().fieldErrors });
        return response(400, {
          message: 'Validation failed',
          errors: result.error.flatten().fieldErrors,
        });
      }

      const person = await useCase.execute(result.data);
      logger.info('Person created', { personId: person.id });

      return response(201, person);
    } catch (error) {
      logger.error('Failed to create person', error as Error);
      return response(500, { message: 'Internal server error' });
    } finally {
      logger.resetKeys();
    }
  };
}

// --- Wired handler for Lambda runtime ---

const config = getConfig();
const repository = new DynamoDBPersonRepository(config.tableName);
const eventPublisher = new EventBridgeEventPublisher(config.eventBusName);

export const handler = createHandler(new CreatePersonUseCase(repository, eventPublisher));
