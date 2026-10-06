/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Test files share one database, so they must never run in parallel.
  maxWorkers: 1,
  testTimeout: 30000,
};
