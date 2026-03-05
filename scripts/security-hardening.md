# Security Hardening Tracker
# Updated by cron job every 30 minutes

## Completed Rounds

### Round 1 — 2026-03-05 02:15 EST (Initial Hardening)
- [x] Created core/security.js — centralized security middleware
- [x] Added helmet for security headers (CSP, HSTS, X-Frame-Options, etc.)
- [x] Locked down CORS (no more `origin: true`)
- [x] Added express-rate-limit (100 req/15min general, 5/15min auth)
- [x] Added input sanitization (XSS, prototype pollution prevention)
- [x] Added account lockout (5 attempts → 15 min lockout)
- [x] Added Socket.io authentication (JWT required for WS connections)
- [x] Added request body size limits (1MB max)
- [x] Added security audit logging
- [x] Reduced JWT expiry from 24h to 8h
- [x] Increased bcrypt rounds from 10 to 12
- [x] Made JWT_SECRET mandatory (no fallback)
- [x] Added SameSite=strict to auth cookies
- [x] Rate-limited sensitive operations (encryption, backups)
- [x] Restricted encryption API to admin-only
- [x] Reduced health endpoint info leakage
- [x] Added IP allowlist capability (off by default)
- [x] Added request logging middleware
- [x] Added security status dashboard endpoint
- [x] Added lockout status endpoint

## Pending Tasks (for subsequent cron rounds)

### Round 2 — Path traversal protection
- [ ] Audit document routes for path traversal
- [ ] Audit memory routes for path traversal
- [ ] Add path validation middleware

### Round 3 — Error handling hardening
- [ ] Add global error handler (don't leak stack traces)
- [ ] Sanitize error messages in responses
- [ ] Add uncaught exception handler

### Round 4 — Session management improvements
- [ ] Add JWT blacklist (for forced logout)
- [ ] Add session rotation on privilege change
- [ ] Add concurrent session limit

### Round 5 — Nginx hardening
- [ ] Update nginx config with security headers
- [ ] Add request size limits in nginx
- [ ] Add connection rate limiting in nginx
- [ ] Configure TLS (when domain is set up)

### Round 6 — Docker hardening
- [ ] Run as non-root user in container
- [ ] Add security-opt (no-new-privileges)
- [ ] Minimize container image
- [ ] Add health check to Dockerfile

### Round 7 — Dependency audit
- [ ] Run npm audit and fix vulnerabilities
- [ ] Remove unused dependencies
- [ ] Pin dependency versions

### Round 8 — Test security
- [ ] Test rate limiting works
- [ ] Test account lockout works
- [ ] Test CORS blocking works
- [ ] Test socket auth works
- [ ] Test input sanitization works

### Round 9 — Documentation & cleanup
- [ ] Update README with security section
- [ ] Document all API endpoints
- [ ] Create security policy document
- [ ] Commit all changes
