import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
  ],
};

export default config;
