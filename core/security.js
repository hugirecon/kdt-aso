/**
 * KDT Aso - Security Middleware Module
 * Centralized security hardening for the platform
 * 
 * Created: 2026-03-05
 * Security Level: Production-grade
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// ============================================================
// RATE LIMITING
// ============================================================

/**
 * General API rate limiter - 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' },
  validate: { xForwardedForHeader: false }
});

/**
 * Auth-specific rate limiter - 5 attempts per 15 minutes per IP
 * Prevents brute force on login
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Account temporarily locked. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
  validate: { xForwardedForHeader: false }
});

/**
 * Sensitive operations rate limiter - 10 per hour
 * For admin actions, encryption, backups, etc.
 */
const sensitiveOpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for sensitive operations' }
});

// ============================================================
// SECURITY HEADERS (Helmet)
// ============================================================

const securityHeaders = helmet({
  contentSecurityPolicy: false,  // Disabled for now — MapLibre GL needs broad access for tiles/workers/WebGL
  crossOriginEmbedderPolicy: false,  // Allow Leaflet tiles
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
});

// ============================================================
// INPUT SANITIZATION
// ============================================================

/**
 * Sanitize string input - strip potential XSS vectors
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '')           // Remove angle brackets
    .replace(/javascript:/gi, '')    // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '')     // Remove event handlers
    .replace(/data:/gi, '')          // Remove data: protocol
    .trim();
}

/**
 * Deep sanitize an object's string values
 */
function sanitizeObject(obj) {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    // Block prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    cleaned[sanitizeString(key)] = sanitizeObject(value);
  }
  return cleaned;
}

/**
 * Input sanitization middleware
 */
function inputSanitizer(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
}

// ============================================================
// REQUEST VALIDATION
// ============================================================

/**
 * Validate request body size (prevent DoS via large payloads)
 * Applied via express.json({ limit: '1mb' }) in main app
 */
const MAX_BODY_SIZE = '1mb';

/**
 * Validate that required fields exist in request body
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({ 
        error: `Missing required fields: ${missing.join(', ')}` 
      });
    }
    next();
  };
}

// ============================================================
// ACCOUNT LOCKOUT
// ============================================================

class AccountLockout {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 5;
    this.lockoutDuration = options.lockoutDuration || 15 * 60 * 1000; // 15 min
    this.attempts = new Map();  // ip/username -> { count, firstAttempt, lockedUntil }
  }

  /**
   * Check if an account/IP is locked out
   */
  isLocked(key) {
    const record = this.attempts.get(key);
    if (!record) return false;
    
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      return true;
    }
    
    // Lockout expired, reset
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      this.attempts.delete(key);
      return false;
    }
    
    return false;
  }

  /**
   * Record a failed attempt
   */
  recordFailure(key) {
    const record = this.attempts.get(key) || { count: 0, firstAttempt: Date.now() };
    record.count++;
    
    if (record.count >= this.maxAttempts) {
      record.lockedUntil = Date.now() + this.lockoutDuration;
      console.warn(`[SECURITY] Account lockout triggered for: ${key} (${record.count} failed attempts)`);
    }
    
    this.attempts.set(key, record);
    return record;
  }

  /**
   * Clear attempts on successful login
   */
  recordSuccess(key) {
    this.attempts.delete(key);
  }

  /**
   * Get lockout status
   */
  getStatus(key) {
    const record = this.attempts.get(key);
    if (!record) return { locked: false, attempts: 0 };
    
    return {
      locked: this.isLocked(key),
      attempts: record.count,
      remainingAttempts: Math.max(0, this.maxAttempts - record.count),
      lockedUntil: record.lockedUntil ? new Date(record.lockedUntil).toISOString() : null
    };
  }

  /**
   * Cleanup expired entries (run periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      if (record.lockedUntil && now >= record.lockedUntil) {
        this.attempts.delete(key);
      }
      // Also clean old non-locked entries (older than 1 hour)
      if (!record.lockedUntil && (now - record.firstAttempt) > 60 * 60 * 1000) {
        this.attempts.delete(key);
      }
    }
  }
}

// ============================================================
// SECURITY AUDIT LOGGER
// ============================================================

class SecurityAuditLog {
  constructor() {
    this.events = [];
    this.maxEvents = 10000;
  }

  log(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...event
    };
    
    this.events.push(entry);
    
    // Trim if over max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log critical events to console
    if (event.severity === 'critical' || event.severity === 'high') {
      console.warn(`[SECURITY AUDIT] ${event.severity.toUpperCase()}: ${event.action} - ${event.detail || ''}`);
    }

    return entry;
  }

  logAuth(action, detail, ip, userId = null, success = true) {
    return this.log({
      category: 'auth',
      action,
      detail,
      ip,
      userId,
      success,
      severity: success ? 'info' : 'warning'
    });
  }

  logAccess(action, resource, ip, userId, method) {
    return this.log({
      category: 'access',
      action,
      resource,
      ip,
      userId,
      method,
      severity: 'info'
    });
  }

  logSecurity(action, detail, ip, severity = 'warning') {
    return this.log({
      category: 'security',
      action,
      detail,
      ip,
      severity
    });
  }

  getRecent(limit = 100, filters = {}) {
    let results = [...this.events].reverse();
    
    if (filters.category) {
      results = results.filter(e => e.category === filters.category);
    }
    if (filters.severity) {
      results = results.filter(e => e.severity === filters.severity);
    }
    if (filters.userId) {
      results = results.filter(e => e.userId === filters.userId);
    }
    if (filters.action) {
      results = results.filter(e => e.action === filters.action);
    }
    
    return results.slice(0, limit);
  }
}

// ============================================================
// CORS CONFIGURATION (Locked Down)
// ============================================================

/**
 * Generate strict CORS options
 * Only allows the dashboard origin and localhost variants
 */
function getCorsOptions(allowedOrigins = []) {
  const defaultOrigins = [
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002'
  ];

  const origins = [...new Set([...defaultOrigins, ...allowedOrigins])];

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return callback(null, true);
      
      if (origins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[SECURITY] CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 600  // Cache preflight for 10 minutes
  };
}

// ============================================================
// SOCKET.IO AUTHENTICATION
// ============================================================

/**
 * Socket.io authentication middleware
 * Verifies JWT token before allowing WebSocket connection
 */
function socketAuthMiddleware(authManager) {
  return (socket, next) => {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
                  parseCookie(socket.handshake.headers?.cookie, 'token');

    if (!token) {
      console.warn(`[SECURITY] Socket connection rejected: no token (${socket.handshake.address})`);
      return next(new Error('Authentication required'));
    }

    const result = authManager.verifyToken(token);
    if (!result.valid) {
      console.warn(`[SECURITY] Socket connection rejected: invalid token (${socket.handshake.address})`);
      return next(new Error('Invalid authentication'));
    }

    socket.user = result.user;
    next();
  };
}

/**
 * Parse a specific cookie from cookie header string
 */
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ============================================================
// JWT BLACKLIST (for forced logout / token revocation)
// ============================================================

class JwtBlacklist {
  constructor() {
    this.blacklisted = new Map();  // jti or token hash -> expiry timestamp
    // Cleanup every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Blacklist a token (by its jti claim or hash)
   */
  revoke(tokenId, expiresAt) {
    this.blacklisted.set(tokenId, expiresAt || Date.now() + 8 * 60 * 60 * 1000);
  }

  /**
   * Check if a token is blacklisted
   */
  isRevoked(tokenId) {
    return this.blacklisted.has(tokenId);
  }

  /**
   * Revoke all tokens for a user (by storing a "revoked before" timestamp)
   */
  revokeAllForUser(userId) {
    this.blacklisted.set(`user:${userId}`, Date.now());
  }

  /**
   * Check if a user's tokens issued before a certain time are revoked
   */
  isUserRevoked(userId, tokenIssuedAt) {
    const revokedBefore = this.blacklisted.get(`user:${userId}`);
    if (!revokedBefore) return false;
    return tokenIssuedAt * 1000 <= revokedBefore;  // JWT iat is in seconds
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.blacklisted.entries()) {
      if (typeof expiry === 'number' && !key.startsWith('user:') && expiry < now) {
        this.blacklisted.delete(key);
      }
    }
  }

  /**
   * Get count of blacklisted entries
   */
  get size() {
    return this.blacklisted.size;
  }
}

// ============================================================
// CONCURRENT SESSION LIMITER
// ============================================================

class SessionLimiter {
  constructor(maxSessions = 3) {
    this.maxSessions = maxSessions;
    this.sessions = new Map();  // userId -> [{ tokenId, createdAt, ip, userAgent }]
  }

  /**
   * Register a new session, evict oldest if over limit
   */
  register(userId, tokenId, ip, userAgent) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, []);
    }
    
    const userSessions = this.sessions.get(userId);
    userSessions.push({
      tokenId,
      createdAt: Date.now(),
      ip,
      userAgent: (userAgent || '').substring(0, 100)
    });

    const evicted = [];
    // If over limit, evict oldest sessions
    while (userSessions.length > this.maxSessions) {
      const old = userSessions.shift();
      evicted.push(old.tokenId);
    }

    return evicted;  // Return token IDs that should be blacklisted
  }

  /**
   * Remove a session (logout)
   */
  remove(userId, tokenId) {
    const userSessions = this.sessions.get(userId);
    if (!userSessions) return;
    
    const idx = userSessions.findIndex(s => s.tokenId === tokenId);
    if (idx !== -1) userSessions.splice(idx, 1);
    if (userSessions.length === 0) this.sessions.delete(userId);
  }

  /**
   * Get active sessions for a user
   */
  getSessions(userId) {
    return this.sessions.get(userId) || [];
  }

  /**
   * Force logout all sessions for a user
   */
  revokeAll(userId) {
    const sessions = this.sessions.get(userId) || [];
    this.sessions.delete(userId);
    return sessions.map(s => s.tokenId);
  }
}

// ============================================================
// API KEY SYSTEM (for future property/agent instances)
// ============================================================

class ApiKeyManager {
  constructor() {
    this.keys = new Map();  // key -> { propertyId, agentId, permissions, createdAt, lastUsed }
  }

  /**
   * Generate a new API key for a property/agent instance
   */
  generate(propertyId, agentId, permissions = ['read', 'write']) {
    const key = `kdt_${crypto.randomBytes(32).toString('hex')}`;
    const record = {
      propertyId,
      agentId,
      permissions,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      active: true
    };
    this.keys.set(key, record);
    return { key, ...record };
  }

  /**
   * Validate an API key
   */
  validate(key) {
    const record = this.keys.get(key);
    if (!record || !record.active) return null;
    
    record.lastUsed = new Date().toISOString();
    return record;
  }

  /**
   * Revoke an API key
   */
  revoke(key) {
    const record = this.keys.get(key);
    if (record) {
      record.active = false;
      return true;
    }
    return false;
  }

  /**
   * List all keys for a property
   */
  listForProperty(propertyId) {
    const results = [];
    for (const [key, record] of this.keys.entries()) {
      if (record.propertyId === propertyId) {
        results.push({ 
          key: key.substring(0, 8) + '...',  // Mask key
          ...record 
        });
      }
    }
    return results;
  }
}

// ============================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================

function requestLogger(auditLog) {
  return (req, res, next) => {
    const start = Date.now();
    
    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userId: req.user?.id || null,
        userAgent: req.headers['user-agent']?.substring(0, 100)
      };

      // Log security-relevant requests
      if (req.path.includes('/auth/') || req.path.includes('/admin/') || 
          req.path.includes('/encryption/') || req.path.includes('/backup')) {
        auditLog.logAccess(
          `${req.method} ${req.path}`,
          req.path,
          req.ip,
          req.user?.id,
          req.method
        );
      }

      // Log failed requests
      if (res.statusCode >= 400) {
        auditLog.logSecurity(
          `HTTP ${res.statusCode}`,
          `${req.method} ${req.path}`,
          req.ip,
          res.statusCode >= 500 ? 'high' : 'warning'
        );
      }
    });

    next();
  };
}

// ============================================================
// IP ALLOWLIST (for production deployments)
// ============================================================

class IpAllowlist {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.allowedIps = new Set(options.allowedIps || ['127.0.0.1', '::1', '::ffff:127.0.0.1']);
    this.allowedSubnets = options.allowedSubnets || [];  // e.g. '192.168.1.0/24'
  }

  /**
   * Check if an IP is allowed
   */
  isAllowed(ip) {
    if (!this.enabled) return true;
    if (this.allowedIps.has(ip)) return true;
    
    // Check subnets
    for (const subnet of this.allowedSubnets) {
      if (this.ipInSubnet(ip, subnet)) return true;
    }
    
    return false;
  }

  /**
   * Basic subnet check (supports /24, /16, /8)
   */
  ipInSubnet(ip, subnet) {
    const [subnetIp, bits] = subnet.split('/');
    const mask = parseInt(bits);
    
    const ipParts = ip.replace('::ffff:', '').split('.').map(Number);
    const subnetParts = subnetIp.split('.').map(Number);
    
    if (ipParts.length !== 4 || subnetParts.length !== 4) return false;
    
    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const subnetNum = (subnetParts[0] << 24) | (subnetParts[1] << 16) | (subnetParts[2] << 8) | subnetParts[3];
    const maskNum = ~(0xFFFFFFFF >>> mask);
    
    return (ipNum & maskNum) === (subnetNum & maskNum);
  }

  /**
   * Middleware to enforce IP allowlist
   */
  middleware() {
    return (req, res, next) => {
      if (!this.isAllowed(req.ip)) {
        console.warn(`[SECURITY] IP blocked: ${req.ip}`);
        return res.status(403).json({ error: 'Access denied' });
      }
      next();
    };
  }

  addIp(ip) { this.allowedIps.add(ip); }
  removeIp(ip) { this.allowedIps.delete(ip); }
  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
}

// ============================================================
// REQUEST ID TRACKING
// ============================================================

/**
 * Add unique request ID for correlation/debugging
 */
function requestIdMiddleware(req, res, next) {
  req.id = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
}

// ============================================================
// CONTENT-TYPE VALIDATION
// ============================================================

/**
 * Reject non-JSON content types on API routes
 */
function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
  }
  next();
}

// ============================================================
// TIMING-SAFE TOKEN COMPARISON
// ============================================================

/**
 * Timing-safe string comparison (prevents timing attacks)
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ============================================================
// API VERSIONING HEADERS
// ============================================================

/**
 * Add API version header to all responses
 */
function apiVersionHeaders(version = '1.0') {
  return (req, res, next) => {
    res.setHeader('X-API-Version', version);
    res.setHeader('X-Powered-By', 'KDT-Aso'); // override default Express header
    next();
  };
}

// ============================================================
// RESPONSE SANITIZATION
// ============================================================

/**
 * Strip internal/sensitive fields from JSON responses before sending.
 * Wraps res.json to automatically clean outgoing data.
 */
const INTERNAL_FIELDS = new Set([
  'passwordHash', 'password', '__v', '__proto__',
  'resetToken', 'resetTokenExpiry', 'loginAttempts',
  'lockUntil', 'internalNotes', '_raw', 'stackTrace'
]);

function responseSanitizer(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    return originalJson(stripInternalFields(data));
  };
  next();
}

function stripInternalFields(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripInternalFields);
  if (typeof obj !== 'object') return obj;
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (INTERNAL_FIELDS.has(key)) continue;
    cleaned[key] = typeof value === 'object' ? stripInternalFields(value) : value;
  }
  return cleaned;
}

// ============================================================
// HTTP METHOD ENFORCEMENT
// ============================================================

/**
 * Restrict allowed HTTP methods per route prefix.
 * Usage: app.use(methodEnforcement({ '/api/auth': ['GET', 'POST'], '/api/admin': ['GET', 'POST', 'PUT', 'DELETE'] }))
 * Falls back to allowing GET, POST, PUT, PATCH, DELETE for unspecified routes.
 */
const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

function methodEnforcement(routeRules = {}) {
  return (req, res, next) => {
    // Find the most specific matching rule
    let allowedMethods = DEFAULT_ALLOWED_METHODS;
    let longestMatch = 0;
    
    for (const [prefix, methods] of Object.entries(routeRules)) {
      if (req.path.startsWith(prefix) && prefix.length > longestMatch) {
        allowedMethods = methods.map(m => m.toUpperCase()).concat(['OPTIONS', 'HEAD']);
        longestMatch = prefix.length;
      }
    }
    
    if (!allowedMethods.includes(req.method)) {
      res.setHeader('Allow', allowedMethods.join(', '));
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
    next();
  };
}

// ============================================================
// PATH TRAVERSAL PROTECTION
// ============================================================

/**
 * Validate that a path parameter doesn't contain traversal attempts
 */
function pathTraversalGuard(paramNames = ['id']) {
  return (req, res, next) => {
    for (const param of paramNames) {
      const value = req.params[param] || req.query[param];
      if (value && !isSafePathComponent(value)) {
        console.warn(`[SECURITY] Path traversal attempt blocked: ${param}=${value} from ${req.ip}`);
        return res.status(400).json({ error: 'Invalid parameter' });
      }
    }
    next();
  };
}

/**
 * Check if a string is safe to use as a path component (no traversal, no special chars)
 * Use this inside class methods as defense-in-depth
 */
function isSafePathComponent(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 255) return false;
  return !(
    value.includes('..') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.includes('%2e') ||
    value.includes('%2f') ||
    value.includes('%5c') ||
    value.includes('%00') ||
    /[\x00-\x1f\x7f]/.test(value)  // control characters
  );
}

/**
 * Sanitize and validate a path component, throwing if invalid.
 * Call this in any code that builds file paths from user input.
 */
function validatePathComponent(value, paramName = 'parameter') {
  if (!isSafePathComponent(value)) {
    throw new Error(`Invalid ${paramName}: contains forbidden characters`);
  }
  return value;
}

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

/**
 * Global error handler — never leak stack traces in production
 */
function globalErrorHandler(err, req, res, _next) {
  // Log the full error internally
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error'
  });
}

/**
 * Setup process-level error handlers
 */
function setupProcessHandlers() {
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    // Give time to flush logs, then exit
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`[SHUTDOWN] Received ${signal}, shutting down gracefully...`);
    setTimeout(() => {
      console.log('[SHUTDOWN] Forcing exit');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ============================================================
// SECURITY MONITORING & ALERTING
// ============================================================

/**
 * SecurityMonitor — tracks failed logins, rate limit breaches,
 * and provides alert thresholds + system health metrics.
 */
class SecurityMonitor {
  constructor(options = {}) {
    this.failedLoginThreshold = options.failedLoginThreshold || 10;   // per window
    this.rateLimitThreshold = options.rateLimitThreshold || 20;       // breaches per window
    this.windowMs = options.windowMs || 5 * 60 * 1000;               // 5-minute window
    this.listeners = [];

    // Sliding window counters
    this.failedLogins = [];      // timestamps
    this.rateLimitBreaches = []; // timestamps
    this.alerts = [];            // recent alert log
    this.maxAlerts = 500;

    // Cleanup stale entries every minute
    this._cleanupInterval = setInterval(() => this._cleanup(), 60 * 1000);
  }

  /**
   * Register a callback for security alerts
   * callback(alert) where alert = { type, severity, message, timestamp, data }
   */
  onAlert(callback) {
    this.listeners.push(callback);
  }

  _emit(alert) {
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }
    for (const cb of this.listeners) {
      try { cb(alert); } catch (e) { console.error('[SecurityMonitor] alert callback error:', e); }
    }
  }

  /**
   * Record a failed login and check threshold
   */
  recordFailedLogin(ip, username) {
    const now = Date.now();
    this.failedLogins.push({ ts: now, ip, username });

    const recentCount = this.failedLogins.filter(e => now - e.ts < this.windowMs).length;
    if (recentCount >= this.failedLoginThreshold) {
      const alert = {
        type: 'failed_login_surge',
        severity: 'high',
        message: `${recentCount} failed logins in the last ${this.windowMs / 60000} minutes (threshold: ${this.failedLoginThreshold})`,
        timestamp: new Date().toISOString(),
        data: { recentCount, threshold: this.failedLoginThreshold, lastIp: ip, lastUsername: username }
      };
      this._emit(alert);
      console.warn(`[SECURITY MONITOR] ⚠️  ${alert.message}`);
    }
  }

  /**
   * Record a rate limit breach and check threshold
   */
  recordRateLimitBreach(ip, path) {
    const now = Date.now();
    this.rateLimitBreaches.push({ ts: now, ip, path });

    const recentCount = this.rateLimitBreaches.filter(e => now - e.ts < this.windowMs).length;
    if (recentCount >= this.rateLimitThreshold) {
      const alert = {
        type: 'rate_limit_surge',
        severity: 'high',
        message: `${recentCount} rate limit breaches in the last ${this.windowMs / 60000} minutes (threshold: ${this.rateLimitThreshold})`,
        timestamp: new Date().toISOString(),
        data: { recentCount, threshold: this.rateLimitThreshold, lastIp: ip, lastPath: path }
      };
      this._emit(alert);
      console.warn(`[SECURITY MONITOR] ⚠️  ${alert.message}`);
    }
  }

  /**
   * Get system health metrics (security-focused)
   */
  getHealthMetrics(extras = {}) {
    const now = Date.now();
    const recentFailedLogins = this.failedLogins.filter(e => now - e.ts < this.windowMs).length;
    const recentRateLimitBreaches = this.rateLimitBreaches.filter(e => now - e.ts < this.windowMs).length;

    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      uptimeFormatted: formatUptime(process.uptime()),
      memory: {
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external
      },
      security: {
        failedLoginsInWindow: recentFailedLogins,
        failedLoginThreshold: this.failedLoginThreshold,
        rateLimitBreachesInWindow: recentRateLimitBreaches,
        rateLimitThreshold: this.rateLimitThreshold,
        windowMinutes: this.windowMs / 60000,
        recentAlerts: this.alerts.slice(-10),
        totalAlertsEmitted: this.alerts.length
      },
      ...extras
    };
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit = 50) {
    return this.alerts.slice(-limit);
  }

  /**
   * Remove entries outside the sliding window
   */
  _cleanup() {
    const cutoff = Date.now() - this.windowMs * 2; // keep 2x window for trends
    this.failedLogins = this.failedLogins.filter(e => e.ts > cutoff);
    this.rateLimitBreaches = this.rateLimitBreaches.filter(e => e.ts > cutoff);
  }

  destroy() {
    clearInterval(this._cleanupInterval);
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Startup security self-check — validates the security configuration
 * on boot and logs warnings for anything misconfigured.
 * Returns { passed: boolean, checks: [...] }
 */
function startupSecurityCheck(options = {}) {
  const checks = [];

  function check(name, condition, warnMsg) {
    const passed = !!condition;
    checks.push({ name, passed, message: passed ? 'OK' : warnMsg });
    if (!passed) console.warn(`[SECURITY SELFCHECK] ⚠️  ${name}: ${warnMsg}`);
    else console.log(`[SECURITY SELFCHECK] ✅ ${name}`);
  }

  // 1. JWT_SECRET is set and not a weak default
  check(
    'JWT_SECRET',
    process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32,
    'JWT_SECRET missing or too short (need ≥32 chars)'
  );

  // 2. NODE_ENV is production (or at least not undefined)
  check(
    'NODE_ENV',
    process.env.NODE_ENV === 'production',
    `NODE_ENV is "${process.env.NODE_ENV || 'undefined'}" — should be "production" in deployment`
  );

  // 3. CORS origins are configured
  const corsOrigins = process.env.CORS_ORIGINS;
  check(
    'CORS_ORIGINS',
    corsOrigins && corsOrigins.length > 0,
    'No CORS_ORIGINS configured — falling back to localhost defaults'
  );

  // 4. Trust proxy is explicitly set
  check(
    'TRUST_PROXY',
    process.env.TRUST_PROXY !== undefined,
    'TRUST_PROXY not set — rate limiting may not work correctly behind a reverse proxy'
  );

  // 5. Bcrypt rounds are adequate
  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  check(
    'BCRYPT_ROUNDS',
    bcryptRounds >= 12,
    `Bcrypt rounds = ${bcryptRounds}, recommended ≥12`
  );

  // 6. IP allowlist awareness
  check(
    'IP_ALLOWLIST',
    process.env.IP_ALLOWLIST_ENABLED === 'true' || process.env.NODE_ENV !== 'production',
    'IP allowlist disabled in production — consider enabling for sensitive deployments'
  );

  // 7. HTTPS enforcement (if in production)
  if (process.env.NODE_ENV === 'production') {
    check(
      'HTTPS',
      process.env.FORCE_HTTPS === 'true' || process.env.TRUST_PROXY === 'true',
      'No HTTPS enforcement detected in production'
    );
  }

  const allPassed = checks.every(c => c.passed);
  const summary = `Security self-check: ${checks.filter(c => c.passed).length}/${checks.length} passed`;
  console.log(`[SECURITY SELFCHECK] ${allPassed ? '✅' : '⚠️ '} ${summary}`);

  return { passed: allPassed, checks, summary };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Middleware
  securityHeaders,
  apiLimiter,
  authLimiter,
  sensitiveOpLimiter,
  inputSanitizer,
  requestLogger,
  socketAuthMiddleware,
  getCorsOptions,
  pathTraversalGuard,
  globalErrorHandler,
  setupProcessHandlers,
  requestIdMiddleware,
  requireJson,
  timingSafeEqual,
  apiVersionHeaders,
  responseSanitizer,
  stripInternalFields,
  methodEnforcement,
  
  // Classes
  AccountLockout,
  SecurityAuditLog,
  ApiKeyManager,
  IpAllowlist,
  JwtBlacklist,
  SessionLimiter,
  SecurityMonitor,
  
  // Startup
  startupSecurityCheck,
  
  // Utilities
  sanitizeString,
  sanitizeObject,
  requireFields,
  isSafePathComponent,
  validatePathComponent,
  
  // Constants
  MAX_BODY_SIZE
};
