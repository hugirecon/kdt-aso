/**
 * Jest Setup File
 * Runs before each test file
 */

// Increase timeout for async operations
jest.setTimeout(30000);

// Mock console.log in tests to reduce noise
// Comment out for debugging
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
// };

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.ANTHROPIC_API_KEY = 'test-key'; // Mocked

// Cleanup after all tests
afterAll(async () => {
  // Give async operations time to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});
