import { Logger } from '@aws-lambda-powertools/logger';
import { search } from '@aws-lambda-powertools/logger/correlationId';

export const logger = new Logger({
  serviceName: process.env.POWERTOOLS_SERVICE_NAME ?? 'person-service',
  correlationIdSearchFn: search,
  logRecordOrder: ['level', 'timestamp', 'correlation_id', 'message'],
});
