/**
 * KDT Aso - Security Tests
 * Validates all security hardening measures
 */

const {
  AccountLockout,
  SecurityAuditLog,
  JwtBlacklist,
  SessionLimiter,
  IpAllowlist,
  sanitizeString,
  sanitizeObject,
  timingSafeEqual
} = require('../core/security');

// ============================================================
// Account Lockout Tests
// ============================================================

describe('AccountLockout', () => {
  let lockout;

  beforeEach(() => {
    lockout = new AccountLockout({ maxAttempts: 3, lockoutDuration: 1000 });
  });

  test('should not lock on first failure', () => {
    lockout.recordFailure('test-ip');
    expect(lockout.isLocked('test-ip')).toBe(false);
  });

  test('should lock after max attempts', () => {
    lockout.recordFailure('test-ip');
    lockout.recordFailure('test-ip');
    lockout.recordFailure('test-ip');
    expect(lockout.isLocked('test-ip')).toBe(true);
  });

  test('should clear on success', () => {
    lockout.recordFailure('test-ip');
    lockout.recordFailure('test-ip');
    lockout.recordSuccess('test-ip');
    expect(lockout.isLocked('test-ip')).toBe(false);
  });

  test('should unlock after duration expires', async () => {
    lockout.recordFailure('test-ip');
    lockout.recordFailure('test-ip');
    lockout.recordFailure('test-ip');
    expect(lockout.isLocked('test-ip')).toBe(true);
    
    // Wait for lockout to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(lockout.isLocked('test-ip')).toBe(false);
  });

  test('should track remaining attempts', () => {
    lockout.recordFailure('test-ip');
    const status = lockout.getStatus('test-ip');
    expect(status.remainingAttempts).toBe(2);
    expect(status.locked).toBe(false);
  });
});

// ============================================================
// JWT Blacklist Tests
// ============================================================

describe('JwtBlacklist', () => {
  let blacklist;

  beforeEach(() => {
    blacklist = new JwtBlacklist();
  });

  test('should not block non-revoked tokens', () => {
    expect(blacklist.isRevoked('some-jti')).toBe(false);
  });

  test('should block revoked tokens', () => {
    blacklist.revoke('some-jti');
    expect(blacklist.isRevoked('some-jti')).toBe(true);
  });

  test('should revoke all tokens for a user', () => {
    blacklist.revokeAllForUser('user-1');
    // Token issued 1 second ago should be revoked
    const iatSeconds = Math.floor((Date.now() - 1000) / 1000);
    expect(blacklist.isUserRevoked('user-1', iatSeconds)).toBe(true);
  });

  test('should not revoke tokens issued after revocation', () => {
    blacklist.revokeAllForUser('user-1');
    // Token issued 1 second in the future should NOT be revoked
    const iatSeconds = Math.floor((Date.now() + 1000) / 1000);
    expect(blacklist.isUserRevoked('user-1', iatSeconds)).toBe(false);
  });
});

// ============================================================
// Session Limiter Tests
// ============================================================

describe('SessionLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new SessionLimiter(2);  // Max 2 sessions
  });

  test('should allow sessions under limit', () => {
    const evicted = limiter.register('user-1', 'token-1', '127.0.0.1', 'test');
    expect(evicted).toHaveLength(0);
    expect(limiter.getSessions('user-1')).toHaveLength(1);
  });

  test('should evict oldest when over limit', () => {
    limiter.register('user-1', 'token-1', '127.0.0.1', 'test');
    limiter.register('user-1', 'token-2', '127.0.0.1', 'test');
    const evicted = limiter.register('user-1', 'token-3', '127.0.0.1', 'test');
    
    expect(evicted).toEqual(['token-1']);
    expect(limiter.getSessions('user-1')).toHaveLength(2);
  });

  test('should remove session on logout', () => {
    limiter.register('user-1', 'token-1', '127.0.0.1', 'test');
    limiter.remove('user-1', 'token-1');
    expect(limiter.getSessions('user-1')).toHaveLength(0);
  });

  test('should revoke all sessions', () => {
    limiter.register('user-1', 'token-1', '127.0.0.1', 'test');
    limiter.register('user-1', 'token-2', '127.0.0.1', 'test');
    const revoked = limiter.revokeAll('user-1');
    
    expect(revoked).toHaveLength(2);
    expect(limiter.getSessions('user-1')).toHaveLength(0);
  });
});

// ============================================================
// IP Allowlist Tests
// ============================================================

describe('IpAllowlist', () => {
  test('should allow all when disabled', () => {
    const allowlist = new IpAllowlist({ enabled: false });
    expect(allowlist.isAllowed('1.2.3.4')).toBe(true);
  });

  test('should block unknown IPs when enabled', () => {
    const allowlist = new IpAllowlist({ enabled: true, allowedIps: ['10.0.0.1'] });
    expect(allowlist.isAllowed('1.2.3.4')).toBe(false);
  });

  test('should allow listed IPs', () => {
    const allowlist = new IpAllowlist({ enabled: true, allowedIps: ['10.0.0.1'] });
    expect(allowlist.isAllowed('10.0.0.1')).toBe(true);
  });

  test('should support subnet matching', () => {
    const allowlist = new IpAllowlist({ 
      enabled: true, 
      allowedIps: [],
      allowedSubnets: ['192.168.1.0/24']
    });
    expect(allowlist.isAllowed('192.168.1.100')).toBe(true);
    expect(allowlist.isAllowed('192.168.2.100')).toBe(false);
  });

  test('should allow adding IPs dynamically', () => {
    const allowlist = new IpAllowlist({ enabled: true, allowedIps: [] });
    expect(allowlist.isAllowed('10.0.0.5')).toBe(false);
    allowlist.addIp('10.0.0.5');
    expect(allowlist.isAllowed('10.0.0.5')).toBe(true);
  });
});

// ============================================================
// Input Sanitization Tests
// ============================================================

describe('Input Sanitization', () => {
  test('should strip angle brackets', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
  });

  test('should strip javascript: protocol', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  test('should strip event handlers', () => {
    expect(sanitizeString('onerror=alert(1)')).toBe('alert(1)');
  });

  test('should handle non-string input', () => {
    expect(sanitizeString(42)).toBe(42);
    expect(sanitizeString(null)).toBe(null);
  });

  test('should deep sanitize objects', () => {
    const input = {
      name: '<script>evil</script>',
      nested: {
        value: 'javascript:hack()'
      }
    };
    const result = sanitizeObject(input);
    expect(result.name).not.toContain('<script>');
    expect(result.nested.value).not.toContain('javascript:');
  });

  test('should block prototype pollution', () => {
    const input = Object.create(null);
    input['__proto__'] = { admin: true };
    input['constructor'] = { isAdmin: true };
    input['normal'] = 'value';
    
    const result = sanitizeObject(input);
    expect(Object.keys(result)).not.toContain('__proto__');
    expect(Object.keys(result)).not.toContain('constructor');
    expect(result.normal).toBe('value');
  });
});

// ============================================================
// Security Audit Log Tests
// ============================================================

describe('SecurityAuditLog', () => {
  let audit;

  beforeEach(() => {
    audit = new SecurityAuditLog();
  });

  test('should log events with timestamps', () => {
    audit.log({ action: 'test', severity: 'info' });
    const recent = audit.getRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].timestamp).toBeDefined();
    expect(recent[0].action).toBe('test');
  });

  test('should filter by category', () => {
    audit.logAuth('login', 'test', '127.0.0.1');
    audit.logSecurity('block', 'test', '127.0.0.1');
    
    const authEvents = audit.getRecent(10, { category: 'auth' });
    expect(authEvents).toHaveLength(1);
    expect(authEvents[0].action).toBe('login');
  });

  test('should respect max events limit', () => {
    const smallAudit = new SecurityAuditLog();
    smallAudit.maxEvents = 5;
    
    for (let i = 0; i < 10; i++) {
      smallAudit.log({ action: `event-${i}`, severity: 'info' });
    }
    
    expect(smallAudit.events.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================
// Timing-Safe Comparison Tests
// ============================================================

describe('Timing-Safe Comparison', () => {
  test('should return true for equal strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  test('should return false for different strings', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
  });

  test('should return false for different lengths', () => {
    expect(timingSafeEqual('abc', 'abcdef')).toBe(false);
  });

  test('should handle non-string input', () => {
    expect(timingSafeEqual(null, 'abc')).toBe(false);
    expect(timingSafeEqual(123, 'abc')).toBe(false);
  });
});
