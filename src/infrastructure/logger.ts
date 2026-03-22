type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry = { level, message, timestamp: new Date().toISOString(), ...context };
  const output = JSON.stringify(entry);

  switch (level) {
    case 'ERROR':
      console.error(output);
      break;
    case 'WARN':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('INFO', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('WARN', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('ERROR', message, context),
};
