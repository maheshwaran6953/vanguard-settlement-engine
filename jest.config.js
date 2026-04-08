/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Root is current directory
  rootDir: '.',
  // Look for your integration tests
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  // Clean up mocks between tests
  clearMocks: true,

  // Run integration tests sequentially to avoid database race conditions
  maxWorkers: 1,
  
  // Give DB operations 30 seconds to breathe
  testTimeout: 30000,

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // ts-jest configuration goes here now, not in globals
        tsconfig: {
          strict: true,
        },
      },
    ],
  },
};