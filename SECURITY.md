# KDT Aso — Security Policy

## Architecture

KDT Aso employs defense-in-depth with multiple overlapping security layers:

```
Internet → Nginx (TLS, rate limit, headers) → Express (middleware stack) → Route handlers → Data
```

### Middleware Stack (in order)
1. **Request ID** — unique correlation ID per request
2. **Security Headers** — helmet (CSP, HSTS, X-Frame-Options, etc.)
3. **IP Allowlist** — optional whitelist of allowed IPs
4. **CORS** — strict origin whitelist (no wildcard)
5. **Body Parsing** — 1MB size limit
6. **Input Sanitization** — XSS, prototype pollution prevention
7. **Request Logging** — audit trail for all requests
8. **Rate Limiting** — per-IP limits on all API routes
9. **Content-Type Validation** — reject non-JSON on API routes
10. **Authentication** — JWT token verification with blacklist check
11. **Authorization** — role-based access control

## Authentication

- **JWT tokens** with unique `jti` (token ID) for revocation
- **8-hour expiry** (reduced from 24h)
- **bcrypt** password hashing with 12 rounds
- **HttpOnly, Secure, SameSite=strict** cookies
- **Token blacklist** — immediate revocation capability
- **Concurrent session limit** — max 3 per user, oldest evicted

## Brute Force Protection

- **Rate limiting**: 5 login attempts per 15 minutes per IP
- **Account lockout**: 5 failed attempts → 15-minute lockout (both IP and username)
- **API rate limiting**: 100 requests per 15 minutes per IP
- **Sensitive operations**: 10 per hour (encryption, backups, restores)

## Input Security

- HTML tag stripping
- `javascript:` protocol removal
- Event handler attribute removal
- `data:` protocol removal
- Prototype pollution blocking (`__proto__`, `constructor`, `prototype`)
- Path traversal guards on all file-access routes
- Content-Type enforcement (JSON only on API routes)

## Real-time (WebSocket) Security

- **JWT authentication required** for all Socket.io connections
- Operator identity validation
- Connection logging to security audit

## Monitoring

- **Security audit log** — all auth events, access patterns, security blocks
- **Admin endpoints**: `/api/security/audit`, `/api/security/lockouts`, `/api/security/status`
- **Request correlation** via X-Request-ID header

## Network Security (Nginx)

- TLS 1.2+ only (1.3 preferred)
- Strong cipher suite
- HSTS with preload
- Server version hidden
- Request body limits
- Connection rate limiting
- CSP and Permissions-Policy headers

## Container Security (Docker)

- Alpine-based minimal image
- Non-root user (kdt:1001)
- `no-new-privileges` security option
- Health check
- Read-only root filesystem compatible

## Reporting Vulnerabilities

Contact: security@knightdivisiontactical.com

## Deployment Checklist

See `TRANSFER.md` for the full security checklist when deploying to a new instance.
