/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  forceExit: true,
  
  // From your JS config: Essential for DB stability
  maxWorkers: 1, 
  testTimeout: 30000,
  clearMocks: true,
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],

  // From your TS config: Path mapping
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/core/$1',
    '^@infra/(.*)$': '<rootDir>/infra/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
  },

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
        },
      },
    ],
  },
};