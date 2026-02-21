/**
 * KDT Aso - Authentication Tests
 */

const AuthManager = require('../core/auth');

describe('AuthManager', () => {
  let authManager;

  beforeEach(() => {
    authManager = new AuthManager('./config');
    // Mock users for testing
    authManager.users = [
      { id: 'test-1', username: 'admin', password: '$2a$10$hash', role: 'admin', active: true },
      { id: 'test-2', username: 'operator', password: '$2a$10$hash', role: 'operator', active: true },
      { id: 'test-3', username: 'inactive', password: '$2a$10$hash', role: 'viewer', active: false }
    ];
  });

  describe('validateCredentials', () => {
    it('should return null for non-existent user', async () => {
      const result = await authManager.validateCredentials('nonexistent', 'password');
      expect(result).toBeNull();
    });

    it('should return null for inactive user', async () => {
      const result = await authManager.validateCredentials('inactive', 'password');
      expect(result).toBeNull();
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const user = { id: 'test-1', username: 'admin', role: 'admin' };
      const token = authManager.generateToken(user);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const user = { id: 'test-1', username: 'admin', role: 'admin' };
      const token = authManager.generateToken(user);
      const decoded = authManager.verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded.id).toBe('test-1');
      expect(decoded.username).toBe('admin');
    });

    it('should return null for invalid token', () => {
      const decoded = authManager.verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh a valid token', () => {
      const user = { id: 'test-1', username: 'admin', role: 'admin' };
      const token = authManager.generateToken(user);
      const newToken = authManager.refreshToken(token);
      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(token);
    });
  });
});
