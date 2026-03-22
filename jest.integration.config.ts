import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Config } from 'jest';

// Load .env file into process.env for integration tests
const configDir = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));
const envFile = readFileSync(resolve(configDir, '.env'), 'utf-8');
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [key, ...rest] = trimmed.split('=');
  process.env[key] = rest.join('=');
}

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/*.integration.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
  clearMocks: true,
  testTimeout: 30_000,
};

export default config;
