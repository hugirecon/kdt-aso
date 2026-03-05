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

### Round 1b — 2026-03-05 02:25 EST (Also in initial pass)
- [x] Added path traversal guards on document/memory routes (pathTraversalGuard middleware)
- [x] Added global error handler (no stack trace leaks in production)
- [x] Added uncaught exception / unhandled rejection handlers
- [x] Added graceful shutdown (SIGTERM/SIGINT)
- [x] Updated nginx: X-Frame DENY, CSP, Permissions-Policy, server_tokens off
- [x] Updated nginx: request size limits (1mb body)
- [x] Updated nginx: connection rate limiting zones
- [x] Dockerfile: non-root user (kdt:1001)
- [x] Dockerfile: security_opt no-new-privileges
- [x] Dockerfile: Alpine-based minimal image
- [x] Dockerfile: production health check
- [x] docker-compose: no-new-privileges, property env vars
- [x] npm audit fix: 0 vulnerabilities
- [x] Dependency versions updated (tar, minimatch)

## Pending Tasks

### Round 4 — Session management improvements
- [ ] Add JWT blacklist (for forced logout)
- [ ] Add session rotation on privilege change
- [ ] Add concurrent session limit

### Round 8 — Security tests
- [ ] Write test for rate limiting
- [ ] Write test for account lockout
- [ ] Write test for CORS blocking
- [ ] Write test for socket auth
- [ ] Write test for input sanitization
- [ ] Write test for path traversal blocking

### Round 9 — Documentation & cleanup
- [ ] Update README with security section
- [ ] Document all API endpoints
- [ ] Create security policy document (SECURITY.md)

### Round 10 — Advanced hardening
- [ ] Add request ID tracking (correlation IDs)
- [ ] Add API versioning headers
- [ ] Add response sanitization (strip internal fields)
- [ ] Add Content-Type validation (reject non-JSON on API routes)
- [ ] Add HTTP method enforcement per route
- [ ] Add timing-safe comparison for tokens

### Round 11 — Monitoring & alerting
- [ ] Add failed login alert threshold
- [ ] Add rate limit breach notifications
- [ ] Add system health metrics endpoint
- [ ] Add startup security self-check
