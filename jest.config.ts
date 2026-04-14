import type { Config } from 'jest';

const config: Config = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  rootDir:         '.',

  projects: [
    {
      displayName:     'unit',
      preset:          'ts-jest',
      testEnvironment: 'node',
      testMatch:       ['**/tests/unit/**/*.test.ts'],
      testTimeout:     5000,
    },
    {
      displayName:     'integration',
      preset:          'ts-jest',
      testEnvironment: 'node',
      testMatch:       ['**/tests/integration/**/*.test.ts'],
      testTimeout:     30000,
      maxWorkers:      1,
    },
  ],

  // Coverage is collected across both projects when running npm test.
  // Unit tests alone give near-100% on pure functions.
  // Integration tests cover the service and HTTP layers.
  collectCoverage:      false,   // only collect when --coverage flag is passed
  collectCoverageFrom: [
    'core/**/*.ts',
    'services/**/*.ts',
    'infra/queue/**/*.ts',
    'infra/email/**/*.ts',
    'infra/pdf/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    // Exclude entry points and config — not meaningfully testable
    '!services/server.ts',
    '!core/config/env.ts',
    '!infra/queue/worker.ts',
    '!infra/queue/redis-connection.ts',
  ],
  coverageDirectory:   'coverage',
  coverageReporters:   ['text', 'text-summary', 'lcov', 'html'],

  // Fail CI if coverage drops below these thresholds.
  // These are deliberately achievable given what we have built.
  // Raise them as you add more tests.
  coverageThreshold: {
    global: {
      lines:      60,
      functions:  60,
      branches:   50,
      statements: 60,
    },
  },

  globals: {
    'ts-jest': { tsconfig: { strict: true } },
  },
};

export default config;