/**
 * KDT Aso - Authentication Module
 * Handles login, sessions, and access control
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// JWT Secret — MUST be set via environment variable in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'kdt-aso-production-secret-change-me') {
  console.error('╔══════════════════════════════════════════════════════════╗');
  console.error('║  CRITICAL: JWT_SECRET not set or using default value!   ║');
  console.error('║  Generate one: node -e "console.log(require(\'crypto\')   ║');
  console.error('║    .randomBytes(64).toString(\'hex\'))"                   ║');
  console.error('║  Set it in .env file as JWT_SECRET=<your-key>           ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  // In production, refuse to start without a proper secret
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}
const crypto = require('crypto');
const BCRYPT_ROUNDS = 12;  // Increased from 10
const JWT_EXPIRY = '8h';   // Reduced from 24h

/**
 * Validate password strength
 * Requires: ≥12 chars, uppercase, lowercase, digit, special char
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < 12) return 'Password must be at least 12 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a digit';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character';
  return null; // valid
}

// External blacklist/session limiter — set via AuthManager.setBlacklist() / setSessionLimiter()
let _jwtBlacklist = null;
let _sessionLimiter = null;

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
    const securePassword = crypto.randomBytes(16).toString('base64');
    const defaultUsers = {
      users: [
        {
          id: 'admin',
          username: 'admin',
          passwordHash: bcrypt.hashSync(securePassword, BCRYPT_ROUNDS),
          name: 'Administrator',
          title: 'System Administrator',
          role: 'admin',
          access: ['hero', 'operations', 'surveillance', 'geospatial', 'communications', 'logistics', 'admin'],
          createdAt: new Date().toISOString(),
          mustChangePassword: true // Force password change on first login
        }
      ]
    };
    this.saveUsers(defaultUsers);
    console.log(`╔═══════════════════════════════════════════════════════════╗`);
    console.log(`║  DEFAULT ADMIN CREDENTIALS (SAVE THESE SECURELY)         ║`);
    console.log(`║  Username: admin                                         ║`);
    console.log(`║  Password: ${securePassword}                        ║`);
    console.log(`║  ** MUST CHANGE PASSWORD ON FIRST LOGIN **              ║`);
    console.log(`╚═══════════════════════════════════════════════════════════╝`);
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
    
    // Always run bcrypt.compare even if user doesn't exist to prevent timing attacks
    const dummyHash = '$2b$12$c7TWNVSPyddgg5sRNrHWOeUMVRQXuSAZTDmAGyyKqHi4HuXbso4EW'; // dummy hash
    const providedPasswordHash = user ? user.passwordHash : dummyHash;
    
    const validPassword = await bcrypt.compare(password, providedPasswordHash);
    
    if (!user || !validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Check if user must change password
    if (user.mustChangePassword) {
      return { 
        success: false, 
        error: 'Password change required',
        mustChangePassword: true,
        userId: user.id
      };
    }

    // Generate unique token ID for revocation support
    const jti = crypto.randomBytes(16).toString('hex');
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        name: user.name,
        title: user.title,
        jti  // Token ID for blacklist
      },
      JWT_SECRET,
      { 
        expiresIn: JWT_EXPIRY,
        algorithm: 'HS256'  // Explicitly specify algorithm to prevent "none" algorithm attacks
      }
    );

    // Register session and evict old ones if over limit
    if (_sessionLimiter && _jwtBlacklist) {
      const evicted = _sessionLimiter.register(user.id, jti, null, null);
      for (const oldJti of evicted) {
        _jwtBlacklist.revoke(oldJti);
      }
    }

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
      const decoded = jwt.verify(token, JWT_SECRET, { 
        algorithms: ['HS256']  // Only allow secure HMAC algorithms
      });
      
      // Check JWT blacklist
      if (_jwtBlacklist) {
        if (decoded.jti && _jwtBlacklist.isRevoked(decoded.jti)) {
          return { valid: false, error: 'Token has been revoked' };
        }
        if (_jwtBlacklist.isUserRevoked(decoded.id, decoded.iat)) {
          return { valid: false, error: 'All sessions revoked' };
        }
      }

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
        },
        jti: decoded.jti
      };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }

  /**
   * Set external JWT blacklist
   */
  static setBlacklist(blacklist) { _jwtBlacklist = blacklist; }

  /**
   * Set external session limiter
   */
  static setSessionLimiter(limiter) { _sessionLimiter = limiter; }

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

    // Validate password strength
    const pwError = validatePasswordStrength(userData.password);
    if (pwError) {
      return { success: false, error: pwError };
    }

    const newUser = {
      id: `user-${Date.now()}`,
      username: userData.username,
      passwordHash: await bcrypt.hash(userData.password, BCRYPT_ROUNDS),
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

    // Validate new password strength
    const pwError = validatePasswordStrength(newPassword);
    if (pwError) {
      return { success: false, error: pwError };
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = false; // Clear the flag once password is changed
    this.saveUsers();

    return { success: true };
  }

  /**
   * Force password change (admin only)
   */
  async forcePasswordChange(userId, newPassword, adminRole = 'admin') {
    if (adminRole !== 'admin') {
      return { success: false, error: 'Admin access required' };
    }

    const user = this.users.users.find(u => u.id === userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Validate new password strength even for admin resets
    const pwError = validatePasswordStrength(newPassword);
    if (pwError) {
      return { success: false, error: pwError };
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = false;
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
    const publicPaths = ['/auth/login', '/status', '/api/auth/login', '/api/status', '/api/health', '/health'];
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
