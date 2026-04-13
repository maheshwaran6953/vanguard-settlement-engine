import type { Config } from 'jest';

const config: Config = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  rootDir:         '.',

  // Two projects: unit tests (fast, no DB) and integration tests (real DB)
  projects: [
    {
      displayName:  'unit',
      preset:       'ts-jest',
      testEnvironment: 'node',
      testMatch:    ['**/tests/unit/**/*.test.ts'],
      testTimeout:  5000,
    },
    {
      displayName:  'integration',
      preset:       'ts-jest',
      testEnvironment: 'node',
      testMatch:    ['**/tests/integration/**/*.test.ts'],
      testTimeout:  30000,
      maxWorkers:   1,
    },
  ],

  globals: {
    'ts-jest': { tsconfig: { strict: true } },
  },
};

export default config;