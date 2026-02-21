/**
 * KDT Aso - Admin Management System
 * Handles user management, roles, permissions, and system configuration
 */

const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class AdminSystem {
  constructor(configPath = './config') {
    this.configPath = configPath;
    this.usersFile = path.join(configPath, 'users.json');
    this.rolesFile = path.join(configPath, 'roles.json');
    this.settingsFile = path.join(configPath, 'settings.json');
    
    this.users = new Map();
    this.roles = new Map();
    this.settings = {};
    
    // Default roles
    this.defaultRoles = {
      admin: {
        id: 'admin',
        name: 'Administrator',
        permissions: ['*'],
        description: 'Full system access'
      },
      operator: {
        id: 'operator',
        name: 'Operator',
        permissions: [
          'dashboard:view',
          'agents:interact',
          'alerts:view',
          'alerts:acknowledge',
          'sensors:view',
          'map:view',
          'standing-orders:view'
        ],
        description: 'Standard operational access'
      },
      viewer: {
        id: 'viewer',
        name: 'Viewer',
        permissions: [
          'dashboard:view',
          'alerts:view',
          'sensors:view',
          'map:view'
        ],
        description: 'Read-only access'
      }
    };

    // Default settings
    this.defaultSettings = {
      system: {
        name: 'KDT Aso',
        timezone: 'Africa/Lagos',
        language: 'en',
        maintenanceMode: false
      },
      security: {
        sessionTimeout: 3600,
        maxLoginAttempts: 5,
        lockoutDuration: 900,
        requireMFA: false
      },
      agents: {
        defaultModel: 'claude-3-sonnet',
        maxConcurrentSessions: 10,
        sessionTimeout: 1800
      },
      alerts: {
        autoEscalate: true,
        escalationTimes: {
          critical: 300,
          high: 900,
          medium: 3600,
          low: 86400
        }
      },
      voice: {
        enabled: true,
        defaultVoice: 'adam',
        speed: 1.0
      }
    };
  }

  async init() {
    await this.loadUsers();
    await this.loadRoles();
    await this.loadSettings();
    console.log('Admin system initialized');
  }

  // ==================== USER MANAGEMENT ====================

  async loadUsers() {
    try {
      const data = await fs.readFile(this.usersFile, 'utf8');
      const parsed = JSON.parse(data);
      // Handle both array format and { users: [] } format
      const users = Array.isArray(parsed) ? parsed : (parsed.users || []);
      for (const user of users) {
        this.users.set(user.id || user.username, user);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading users:', err);
      }
    }
  }

  async saveUsers() {
    const users = Array.from(this.users.values());
    await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
  }

  async createUser(userData) {
    const { username, password, name, email, role = 'operator' } = userData;
    
    // Check if username exists
    for (const user of this.users.values()) {
      if (user.username === username) {
        throw new Error('Username already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      name: name || username,
      email,
      role,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      active: true,
      loginAttempts: 0,
      lockedUntil: null
    };

    this.users.set(user.id, user);
    await this.saveUsers();

    // Return user without password
    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(userId, updates) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Don't allow updating password through this method
    const { password, ...safeUpdates } = updates;
    
    Object.assign(user, safeUpdates, { updatedAt: new Date().toISOString() });
    await this.saveUsers();

    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  async changePassword(userId, newPassword) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date().toISOString();
    await this.saveUsers();
  }

  async deleteUser(userId) {
    if (!this.users.has(userId)) {
      throw new Error('User not found');
    }
    this.users.delete(userId);
    await this.saveUsers();
  }

  listUsers() {
    return Array.from(this.users.values()).map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });
  }

  getUser(userId) {
    const user = this.users.get(userId);
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  // ==================== ROLE MANAGEMENT ====================

  async loadRoles() {
    try {
      const data = await fs.readFile(this.rolesFile, 'utf8');
      const roles = JSON.parse(data);
      for (const role of roles) {
        this.roles.set(role.id, role);
      }
    } catch (err) {
      // Use default roles if file doesn't exist
      for (const [id, role] of Object.entries(this.defaultRoles)) {
        this.roles.set(id, role);
      }
      await this.saveRoles();
    }
  }

  async saveRoles() {
    const roles = Array.from(this.roles.values());
    await fs.writeFile(this.rolesFile, JSON.stringify(roles, null, 2));
  }

  async createRole(roleData) {
    const { id, name, permissions = [], description = '' } = roleData;
    
    if (this.roles.has(id)) {
      throw new Error('Role ID already exists');
    }

    const role = { id, name, permissions, description };
    this.roles.set(id, role);
    await this.saveRoles();
    return role;
  }

  async updateRole(roleId, updates) {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // Don't allow changing built-in role IDs
    const { id, ...safeUpdates } = updates;
    Object.assign(role, safeUpdates);
    await this.saveRoles();
    return role;
  }

  async deleteRole(roleId) {
    // Don't allow deleting default roles
    if (this.defaultRoles[roleId]) {
      throw new Error('Cannot delete built-in role');
    }
    if (!this.roles.has(roleId)) {
      throw new Error('Role not found');
    }
    this.roles.delete(roleId);
    await this.saveRoles();
  }

  listRoles() {
    return Array.from(this.roles.values());
  }

  getRole(roleId) {
    return this.roles.get(roleId);
  }

  hasPermission(user, permission) {
    const role = this.roles.get(user.role);
    if (!role) return false;
    
    // Admin has all permissions
    if (role.permissions.includes('*')) return true;
    
    // Check specific permission
    return role.permissions.includes(permission);
  }

  // ==================== SETTINGS MANAGEMENT ====================

  async loadSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      this.settings = JSON.parse(data);
    } catch (err) {
      this.settings = { ...this.defaultSettings };
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await fs.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
  }

  getSettings(category = null) {
    if (category) {
      return this.settings[category] || {};
    }
    return this.settings;
  }

  async updateSettings(category, updates) {
    if (!this.settings[category]) {
      this.settings[category] = {};
    }
    Object.assign(this.settings[category], updates);
    await this.saveSettings();
    return this.settings[category];
  }

  async resetSettings(category = null) {
    if (category) {
      this.settings[category] = { ...this.defaultSettings[category] };
    } else {
      this.settings = { ...this.defaultSettings };
    }
    await this.saveSettings();
    return this.settings;
  }

  // ==================== AUDIT LOGGING ====================

  async logAction(userId, action, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      details,
      ip: details.ip || 'unknown'
    };

    // Append to audit log file
    const logFile = path.join(this.configPath, 'audit.log');
    try {
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }

    return logEntry;
  }

  async getAuditLog(options = {}) {
    const { limit = 100, userId = null, action = null } = options;
    const logFile = path.join(this.configPath, 'audit.log');
    
    try {
      const data = await fs.readFile(logFile, 'utf8');
      let entries = data.trim().split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line))
        .reverse();

      if (userId) {
        entries = entries.filter(e => e.userId === userId);
      }
      if (action) {
        entries = entries.filter(e => e.action === action);
      }

      return entries.slice(0, limit);
    } catch (err) {
      return [];
    }
  }
}

module.exports = AdminSystem;
