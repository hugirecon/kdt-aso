/**
 * KDT Aso - Authentication Module
 * Handles login, sessions, and access control
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Secret key for JWT (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'kdt-aso-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

class AuthManager {
  constructor() {
    this.usersPath = path.join(__dirname, '..', 'config', 'users.json');
    this.users = this.loadUsers();
  }

  /**
   * Load users from file
   */
  loadUsers() {
    if (fs.existsSync(this.usersPath)) {
      return JSON.parse(fs.readFileSync(this.usersPath, 'utf-8'));
    }
    // Create default admin user if no users exist
    const defaultUsers = {
      users: [
        {
          id: 'admin',
          username: 'admin',
          passwordHash: bcrypt.hashSync('admin', 10), // Change immediately in production
          name: 'Administrator',
          title: 'System Administrator',
          role: 'admin',
          access: ['hero', 'operations', 'surveillance', 'geospatial', 'communications', 'logistics', 'admin'],
          createdAt: new Date().toISOString()
        }
      ]
    };
    this.saveUsers(defaultUsers);
    console.log('Created default admin user (username: admin, password: admin) — CHANGE IMMEDIATELY');
    return defaultUsers;
  }

  /**
   * Save users to file
   */
  saveUsers(users = this.users) {
    fs.writeFileSync(this.usersPath, JSON.stringify(users, null, 2));
  }

  /**
   * Authenticate user
   */
  async authenticate(username, password) {
    const user = this.users.users.find(u => u.username === username);
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        name: user.name,
        title: user.title
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        title: user.title,
        role: user.role,
        access: user.access
      }
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = this.users.users.find(u => u.id === decoded.id);
      if (!user) {
        return { valid: false, error: 'User not found' };
      }
      return { 
        valid: true, 
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          title: user.title,
          role: user.role,
          access: user.access
        }
      };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }

  /**
   * Create new user
   */
  async createUser(userData, creatorRole = 'admin') {
    // Only admins can create users
    if (creatorRole !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Check if username exists
    if (this.users.users.find(u => u.username === userData.username)) {
      return { success: false, error: 'Username already exists' };
    }

    const newUser = {
      id: `user-${Date.now()}`,
      username: userData.username,
      passwordHash: await bcrypt.hash(userData.password, 10),
      name: userData.name || userData.username,
      title: userData.title || 'Operator',
      role: userData.role || 'operator',
      access: userData.access || ['hero', 'operations'],
      createdAt: new Date().toISOString()
    };

    this.users.users.push(newUser);
    this.saveUsers();

    return {
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        title: newUser.title,
        role: newUser.role
      }
    };
  }

  /**
   * Change password
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = this.users.users.find(u => u.id === userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const validPassword = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!validPassword) {
      return { success: false, error: 'Invalid current password' };
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    this.saveUsers();

    return { success: true };
  }

  /**
   * List all users (admin only)
   */
  listUsers() {
    return this.users.users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      title: u.title,
      role: u.role,
      access: u.access,
      createdAt: u.createdAt
    }));
  }

  /**
   * Delete user (admin only)
   */
  deleteUser(userId, deleterRole = 'admin') {
    if (deleterRole !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const index = this.users.users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, error: 'User not found' };
    }

    // Prevent deleting the last admin
    const user = this.users.users[index];
    if (user.role === 'admin') {
      const adminCount = this.users.users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return { success: false, error: 'Cannot delete the last admin' };
      }
    }

    this.users.users.splice(index, 1);
    this.saveUsers();

    return { success: true };
  }
}

/**
 * Express middleware for authentication
 */
function authMiddleware(authManager) {
  return (req, res, next) => {
    // Skip auth for public endpoints
    const publicPaths = ['/auth/login', '/status', '/api/auth/login', '/api/status'];
    if (publicPaths.some(p => req.path === p || req.path.endsWith(p))) {
      return next();
    }

    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = authManager.verifyToken(token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    req.user = result.user;
    next();
  };
}

/**
 * Role-based access middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { AuthManager, authMiddleware, requireRole };
