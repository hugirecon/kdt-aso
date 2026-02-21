/**
 * KDT Aso - Admin System Tests
 */

const AdminSystem = require('../core/admin');
const fs = require('fs').promises;
const path = require('path');

describe('AdminSystem', () => {
  let adminSystem;
  const testConfigPath = './__tests__/test-config';

  beforeAll(async () => {
    // Create test config directory
    await fs.mkdir(testConfigPath, { recursive: true });
  });

  beforeEach(async () => {
    adminSystem = new AdminSystem(testConfigPath);
    await adminSystem.init();
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.rm(testConfigPath, { recursive: true });
    } catch (e) {}
  });

  describe('User Management', () => {
    it('should create a new user', async () => {
      const user = await adminSystem.createUser({
        username: 'testuser',
        password: 'testpass123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'operator'
      });

      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('operator');
      expect(user.password).toBeUndefined(); // Should not return password
    });

    it('should not allow duplicate usernames', async () => {
      await adminSystem.createUser({
        username: 'duplicate',
        password: 'pass1',
        role: 'viewer'
      });

      await expect(adminSystem.createUser({
        username: 'duplicate',
        password: 'pass2',
        role: 'viewer'
      })).rejects.toThrow('Username already exists');
    });

    it('should update user', async () => {
      const user = await adminSystem.createUser({
        username: 'updateme',
        password: 'pass',
        role: 'viewer'
      });

      const updated = await adminSystem.updateUser(user.id, {
        name: 'Updated Name',
        email: 'new@email.com'
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.email).toBe('new@email.com');
    });

    it('should delete user', async () => {
      const user = await adminSystem.createUser({
        username: 'deleteme',
        password: 'pass',
        role: 'viewer'
      });

      await adminSystem.deleteUser(user.id);
      const found = adminSystem.getUser(user.id);
      expect(found).toBeNull();
    });

    it('should list all users', async () => {
      await adminSystem.createUser({ username: 'u1', password: 'p', role: 'admin' });
      await adminSystem.createUser({ username: 'u2', password: 'p', role: 'operator' });

      const users = adminSystem.listUsers();
      expect(users.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Role Management', () => {
    it('should have default roles', () => {
      const roles = adminSystem.listRoles();
      const roleIds = roles.map(r => r.id);
      
      expect(roleIds).toContain('admin');
      expect(roleIds).toContain('operator');
      expect(roleIds).toContain('viewer');
    });

    it('should create custom role', async () => {
      const role = await adminSystem.createRole({
        id: 'custom-role',
        name: 'Custom Role',
        permissions: ['dashboard:view', 'alerts:view'],
        description: 'A custom role'
      });

      expect(role.id).toBe('custom-role');
      expect(role.permissions.length).toBe(2);
    });

    it('should not allow deleting built-in roles', async () => {
      await expect(adminSystem.deleteRole('admin'))
        .rejects.toThrow('Cannot delete built-in role');
    });

    it('should check permissions correctly', () => {
      const adminUser = { role: 'admin' };
      const viewerUser = { role: 'viewer' };

      expect(adminSystem.hasPermission(adminUser, 'anything')).toBe(true);
      expect(adminSystem.hasPermission(viewerUser, 'dashboard:view')).toBe(true);
      expect(adminSystem.hasPermission(viewerUser, 'users:delete')).toBe(false);
    });
  });

  describe('Settings Management', () => {
    it('should get default settings', () => {
      const settings = adminSystem.getSettings();
      
      expect(settings.system).toBeDefined();
      expect(settings.security).toBeDefined();
      expect(settings.agents).toBeDefined();
      expect(settings.voice).toBeDefined();
    });

    it('should get settings by category', () => {
      const security = adminSystem.getSettings('security');
      expect(security.sessionTimeout).toBeDefined();
      expect(security.maxLoginAttempts).toBeDefined();
    });

    it('should update settings', async () => {
      await adminSystem.updateSettings('system', {
        name: 'Updated Name'
      });

      const system = adminSystem.getSettings('system');
      expect(system.name).toBe('Updated Name');
    });

    it('should reset settings', async () => {
      await adminSystem.updateSettings('system', { name: 'Changed' });
      await adminSystem.resetSettings('system');

      const system = adminSystem.getSettings('system');
      expect(system.name).toBe('KDT Aso');
    });
  });

  describe('Audit Logging', () => {
    it('should log actions', async () => {
      await adminSystem.logAction('test-user', 'test.action', { detail: 'test' });

      const logs = await adminSystem.getAuditLog({ limit: 1 });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('test.action');
      expect(logs[0].userId).toBe('test-user');
    });

    it('should filter audit logs by user', async () => {
      await adminSystem.logAction('user1', 'action1', {});
      await adminSystem.logAction('user2', 'action2', {});

      const logs = await adminSystem.getAuditLog({ userId: 'user1' });
      expect(logs.every(l => l.userId === 'user1')).toBe(true);
    });
  });
});
