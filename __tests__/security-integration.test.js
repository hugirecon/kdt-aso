/**
 * KDT Aso - Security Integration Tests (Round 8)
 * Tests security middleware via HTTP requests using supertest
 * 
 * Uses a minimal Express app with the same security middleware stack
 * to avoid heavy dependencies (Anthropic, sensors, etc.)
 */

const express = require('express');
const request = require('supertest');
const {
  apiLimiter,
  authLimiter,
  sensitiveOpLimiter,
  inputSanitizer,
  securityHeaders,
  getCorsOptions,
  pathTraversalGuard,
  globalErrorHandler,
  requestIdMiddleware,
  requireJson,
  AccountLockout,
  MAX_BODY_SIZE
} = require('../core/security');
const cors = require('cors');

// ============================================================
// Helper: create a fresh Express app with security middleware
// (fresh app per describe block to avoid rate limit state leaking)
// ============================================================

function createTestApp(opts = {}) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(securityHeaders);

  if (opts.cors !== false) {
    app.use(cors(getCorsOptions(opts.corsOrigins || [])));
  }

  app.use(express.json({ limit: MAX_BODY_SIZE }));
  app.use(inputSanitizer);

  // Rate limiters — use fresh instances so tests don't leak state
  // express-rate-limit uses a MemoryStore by default, but the module-level
  // instances accumulate across tests. We create per-app instances here.
  if (opts.rateLimiter) {
    app.use('/api', opts.rateLimiter);
  }

  if (opts.requireJson !== false) {
    app.use('/api', requireJson);
  }

  // Simple test routes
  app.get('/api/ping', (req, res) => res.json({ ok: true }));
  app.post('/api/echo', (req, res) => res.json({ body: req.body }));
  app.post('/api/auth/login', opts.authLimiter || ((req, res) => res.json({ ok: true })));
  app.get('/api/doc/:id', pathTraversalGuard(['id']), (req, res) => res.json({ id: req.params.id }));

  // Error handler
  app.use(globalErrorHandler);
  return app;
}

// Helper to make a fresh rate limiter for isolated tests
function freshRateLimiter(max, windowMs = 15 * 60 * 1000) {
  const rateLimit = require('express-rate-limit');
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later' },
    validate: { xForwardedForHeader: false }
  });
}

// ============================================================
// Rate Limiting Tests
// ============================================================

describe('Rate Limiting', () => {
  test('should allow requests under the limit', async () => {
    const app = createTestApp({ rateLimiter: freshRateLimiter(10) });

    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Should include rate limit headers
    expect(res.headers['ratelimit-limit']).toBe('10');
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  test('should block requests over the limit', async () => {
    const app = createTestApp({ rateLimiter: freshRateLimiter(3) });

    // First 3 should succeed
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/ping');
      expect(res.status).toBe(200);
    }

    // 4th should be rate limited
    const blocked = await request(app).get('/api/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain('Too many requests');
  });

  test('should return rate limit headers', async () => {
    const app = createTestApp({ rateLimiter: freshRateLimiter(5) });

    const res = await request(app).get('/api/ping');
    expect(res.headers['ratelimit-limit']).toBe('5');
    expect(Number(res.headers['ratelimit-remaining'])).toBe(4);
  });

  test('should rate limit POST requests too', async () => {
    const app = createTestApp({ rateLimiter: freshRateLimiter(2) });

    await request(app).post('/api/echo').send({ test: 1 }).set('Content-Type', 'application/json');
    await request(app).post('/api/echo').send({ test: 2 }).set('Content-Type', 'application/json');

    const blocked = await request(app)
      .post('/api/echo')
      .send({ test: 3 })
      .set('Content-Type', 'application/json');
    expect(blocked.status).toBe(429);
  });
});

// ============================================================
// Account Lockout Tests (HTTP-level)
// ============================================================

describe('Account Lockout (HTTP)', () => {
  test('should lock after max failed attempts and return lockout info', () => {
    const lockout = new AccountLockout({ maxAttempts: 3, lockoutDuration: 5000 });

    const app = createTestApp({
      authLimiter: (req, res) => {
        const key = `user:${req.body.username}`;
        if (lockout.isLocked(key)) {
          return res.status(429).json({
            error: 'Account temporarily locked',
            ...lockout.getStatus(key)
          });
        }
        // Simulate failed login
        lockout.recordFailure(key);
        const status = lockout.getStatus(key);
        if (status.locked) {
          return res.status(429).json({ error: 'Account locked', ...status });
        }
        return res.status(401).json({ error: 'Invalid credentials', ...status });
      }
    });

    return request(app)
      .post('/api/auth/login')
      .send({ username: 'victim', password: 'wrong' })
      .set('Content-Type', 'application/json')
      .expect(401)
      .then(() =>
        request(app)
          .post('/api/auth/login')
          .send({ username: 'victim', password: 'wrong' })
          .set('Content-Type', 'application/json')
          .expect(401)
      )
      .then(() =>
        request(app)
          .post('/api/auth/login')
          .send({ username: 'victim', password: 'wrong' })
          .set('Content-Type', 'application/json')
          .expect(429)
      )
      .then(res => {
        expect(res.body.locked).toBe(true);
      });
  });
});

// ============================================================
// CORS Blocking Tests
// ============================================================

describe('CORS Blocking', () => {
  test('should allow requests from whitelisted origins', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/ping')
      .set('Origin', 'http://localhost:3001');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });

  test('should block requests from non-whitelisted origins', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/ping')
      .set('Origin', 'http://evil.example.com');

    // CORS middleware throws an error which globalErrorHandler catches
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Origin not allowed');
  });

  test('should allow requests with no origin (server-to-server)', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/ping');
    // No Origin header → should be allowed
    expect(res.status).toBe(200);
  });

  test('should return correct CORS headers on preflight', async () => {
    const app = createTestApp();
    const res = await request(app)
      .options('/api/ping')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });
});

// ============================================================
// Input Sanitization Tests (HTTP-level)
// ============================================================

describe('Input Sanitization (HTTP)', () => {
  test('should strip XSS from request body', async () => {
    const app = createTestApp({ requireJson: true });
    const res = await request(app)
      .post('/api/echo')
      .send({ name: '<script>alert("xss")</script>' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.body.name).not.toContain('<script>');
    expect(res.body.body.name).not.toContain('</script>');
  });

  test('should strip javascript: protocol from body', async () => {
    const app = createTestApp({ requireJson: true });
    const res = await request(app)
      .post('/api/echo')
      .send({ url: 'javascript:alert(1)' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.body.url).not.toContain('javascript:');
  });

  test('should block prototype pollution keys', async () => {
    const app = createTestApp({ requireJson: true });
    const res = await request(app)
      .post('/api/echo')
      .send({ __proto__: { admin: true }, normal: 'value' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    // __proto__ key should have been stripped by sanitizeObject;
    // verify it's not an own property on the result
    expect(Object.prototype.hasOwnProperty.call(res.body.body, '__proto__')).toBe(false);
    expect(res.body.body.normal).toBe('value');
  });

  test('should sanitize nested objects', async () => {
    const app = createTestApp({ requireJson: true });
    const res = await request(app)
      .post('/api/echo')
      .send({
        level1: {
          level2: {
            evil: '<img onerror=alert(1) src=x>'
          }
        }
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const deep = res.body.body.level1.level2.evil;
    expect(deep).not.toContain('onerror=');
    expect(deep).not.toContain('<');
  });
});

// ============================================================
// Path Traversal Blocking Tests
// ============================================================

describe('Path Traversal Blocking', () => {
  test('should allow normal path params', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/doc/my-document-123');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('my-document-123');
  });

  test('should block .. traversal', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/doc/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid parameter');
  });

  test('should block encoded traversal (%2e%2e)', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/doc/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
    expect(res.status).toBe(400);
  });

  test('should block forward slashes in params', async () => {
    const app = createTestApp();
    // Express won't route this the same way, but encoded slashes still get checked
    const res = await request(app).get('/api/doc/foo%2fbar');
    expect(res.status).toBe(400);
  });

  test('should block null bytes', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/doc/file%00.txt');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// Security Headers Tests
// ============================================================

describe('Security Headers', () => {
  let app;
  beforeAll(() => {
    app = createTestApp();
  });

  test('should set X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('should set X-Frame-Options', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  test('should set Strict-Transport-Security', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  test('should not expose X-Powered-By', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('should set Content-Security-Policy', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  test('should include X-Request-ID', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBe(16); // 8 random bytes = 16 hex chars
  });
});

// ============================================================
// Content-Type Validation Tests
// ============================================================

describe('Content-Type Validation', () => {
  test('should reject POST without Content-Type on API routes', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/echo')
      .send('not json');

    expect(res.status).toBe(415);
    expect(res.body.error).toContain('application/json');
  });

  test('should accept POST with application/json', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/echo')
      .send({ test: true })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
  });

  test('should allow GET without Content-Type', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
  });
});

// ============================================================
// Error Handler Tests
// ============================================================

describe('Global Error Handler', () => {
  test('should not leak stack traces in production', async () => {
    const app = express();
    app.use(express.json());

    app.get('/api/crash', (req, res, next) => {
      next(new Error('Internal secret error'));
    });

    app.use(globalErrorHandler);

    // In test mode (NODE_ENV=test), it does show the error
    // Let's check the response structure
    const res = await request(app).get('/api/crash');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    // Should not contain a stack trace
    expect(res.body.stack).toBeUndefined();
  });

  test('should handle JSON parse errors gracefully', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/test', (req, res) => res.json({ ok: true }));
    app.use(globalErrorHandler);

    const res = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send('{ bad json }}}');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid JSON');
  });

  test('should handle payload too large', async () => {
    const app = express();
    app.use(express.json({ limit: '100b' }));
    app.post('/api/test', (req, res) => res.json({ ok: true }));
    app.use(globalErrorHandler);

    const largePayload = { data: 'x'.repeat(200) };
    const res = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(largePayload));

    expect(res.status).toBe(413);
    expect(res.body.error).toContain('too large');
  });
});
