import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
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
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', 'lib/**/*.ts', '!**/*.d.ts'],
};

export default config;
