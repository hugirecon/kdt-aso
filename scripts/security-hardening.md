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

### Round 4 — Session management improvements ✅ 2026-03-05 03:57 EST
- [x] Add JWT blacklist (for forced logout) — JwtBlacklist class in security.js, wired in index.js with revoke/revokeAllForUser/isRevoked
- [x] Add session rotation on privilege change — auto-revoke all sessions on role/access change and password change in admin routes
- [x] Add concurrent session limit — SessionLimiter class (max 3 per user), oldest evicted on new login

### Round 8 — Security tests ✅ 2026-03-05 04:27 EST
- [x] Write test for rate limiting — 4 tests (allow/block/headers/POST) via supertest with fresh rate limiter instances
- [x] Write test for account lockout — HTTP-level test (3 failures → 429 lockout response with status)
- [x] Write test for CORS blocking — 4 tests (whitelisted/blocked/no-origin/preflight)
- [x] Write test for socket auth — covered by existing security.test.js (socketAuthMiddleware unit tests)
- [x] Write test for input sanitization — 4 HTTP tests (XSS/javascript:/proto pollution/nested objects)
- [x] Write test for path traversal blocking — 5 tests (normal/../../encoded/%2f/null bytes)
- Also added: Security headers (6 tests), Content-Type validation (3 tests), Global error handler (3 tests)

### Round 9 — Documentation & cleanup ✅ 2026-03-05 05:57 EST
- [x] Update README with security section — comprehensive Security section added covering auth, rate limiting, input validation, headers, CORS, error handling, infra, monitoring, and testing (2026-03-05 04:57 EST)
- [x] Document all API endpoints — comprehensive docs/API.md with all 85 endpoints, WebSocket events, rate limits, error handling, and security middleware pipeline (2026-03-05 05:27 EST)
- [x] Create security policy document (SECURITY.md) — already existed with comprehensive coverage of all security layers (2026-03-05 05:57 EST)

### Round 10 — Advanced hardening ✅ 2026-03-05 05:57 EST
- [x] Add request ID tracking (correlation IDs) — already implemented: requestIdMiddleware in security.js, X-Request-ID header (2026-03-05 05:57 EST)
- [x] Add API versioning headers — apiVersionHeaders middleware, X-API-Version header on all responses (2026-03-05 05:57 EST)
- [x] Add response sanitization (strip internal fields) — responseSanitizer middleware strips passwordHash, resetToken, stackTrace, etc. from all JSON responses (2026-03-05 05:57 EST)
- [x] Add Content-Type validation (reject non-JSON on API routes) — already implemented: requireJson middleware in security.js (2026-03-05 05:57 EST)
- [x] Add HTTP method enforcement per route — methodEnforcement middleware with configurable per-prefix rules, returns 405 with Allow header (2026-03-05 05:57 EST)
- [x] Add timing-safe comparison for tokens — already implemented: timingSafeEqual in security.js using crypto.timingSafeEqual (2026-03-05 05:57 EST)

### Round 11 — Monitoring & alerting ✅ 2026-03-05 06:27 EST
- [x] Add failed login alert threshold — SecurityMonitor class tracks failed logins in sliding 5-min window, emits alert at threshold (default 10), broadcasts via WebSocket (2026-03-05 06:27 EST)
- [x] Add rate limit breach notifications — SecurityMonitor tracks 429 responses, emits alert at threshold (default 20/5min), configurable via RATE_LIMIT_ALERT_THRESHOLD env var (2026-03-05 06:27 EST)
- [x] Add system health metrics endpoint — GET /api/security/health returns uptime, memory, security counters, recent alerts, lockouts, blacklist size (admin-only) (2026-03-05 06:27 EST)
- [x] Add startup security self-check — startupSecurityCheck() runs on boot, validates JWT_SECRET length, NODE_ENV, CORS, TRUST_PROXY, bcrypt rounds, IP allowlist, HTTPS; also available via GET /api/security/selfcheck (2026-03-05 06:27 EST)
