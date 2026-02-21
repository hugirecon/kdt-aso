module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'core/**/*.js',
    '!core/index.js', // Exclude main entry (tested via API tests)
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/__tests__/test-config/']
};
