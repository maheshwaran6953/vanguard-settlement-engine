/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  forceExit: true,
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/core/$1',
    '^@infra/(.*)$': '<rootDir>/infra/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
  },
};