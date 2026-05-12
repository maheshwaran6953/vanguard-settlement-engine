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
      displayName:      'integration',
      preset:           'ts-jest',
      testEnvironment:  'node',
      testMatch:        ['**/tests/integration/**/*.test.ts'],
      testTimeout:      30000,
      maxWorkers:       1,
      // runInBand forces all test files in this project to run
      // sequentially in the same process — no parallel DB access
      runner:           'jest-runner',
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
      lines:      30,
      functions:  20,
      branches:   15,
      statements: 30,
    },
  },
};

module.exports = config;