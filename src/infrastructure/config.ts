export interface EnvironmentConfig {
  tableName: string;
  eventBusName: string;
}

export function getConfig(): EnvironmentConfig {
  const tableName = process.env.TABLE_NAME;
  const eventBusName = process.env.EVENT_BUS_NAME;

  if (!tableName) {
    throw new Error('Missing required environment variable: TABLE_NAME');
  }
  if (!eventBusName) {
    throw new Error('Missing required environment variable: EVENT_BUS_NAME');
  }

  return { tableName, eventBusName };
}
