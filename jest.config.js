/** @type {import('jest').Config} */
const config = {
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

  collectCoverage: false,
  collectCoverageFrom: [
    'core/**/*.ts',
    'services/**/*.ts',
    'infra/queue/**/*.ts',
    'infra/email/**/*.ts',
    'infra/pdf/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!services/server.ts',
    '!core/config/env.ts',
    '!infra/queue/worker.ts',
    '!infra/queue/redis-connection.ts',
  ],
  coverageDirectory:  'coverage',
  coverageReporters:  ['text', 'text-summary', 'lcov', 'html'],

  coverageThreshold: {
    global: {
      lines:      60,
      functions:  58,
      branches:   44,
      statements: 60,
    },
  },
};

module.exports = config;