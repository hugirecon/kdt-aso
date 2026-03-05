# KDT Aso

**Autonomous Operations Platform**

Knight Division Tactical

---

## Overview

KDT Aso is an autonomous AI operations platform that runs operations, coordinates assets, processes intelligence, and executes tasks without dependence on foreign cloud infrastructure.

Named after **Aso Rock**, Nigeria's seat of power.

## Architecture

```
KDT Aso
├── Agents (Your Staff)
│   ├── KDT Hero (Intelligence Branch)
│   │   ├── Intelligence Officer
│   │   ├── Intel Analyst
│   │   └── Collection Manager
│   ├── Operations Section
│   │   ├── Operations Officer
│   │   └── Watch Officer
│   ├── Geospatial Section
│   │   └── Geospatial Officer
│   ├── Surveillance Section
│   │   └── Surveillance Officer
│   ├── Communications Section
│   │   └── Communications Officer
│   ├── Logistics Section
│   │   └── Logistics Officer
│   └── Admin Section
│       └── Admin Officer
├── Core Engine
│   ├── Agent Router
│   ├── Standing Orders
│   └── Operator Manager
└── Dashboard (React)
```

## Key Concepts

- **Operator**: The human user. Commands the system.
- **Agents**: AI staff members organized by role. Talk to them like people.
- **KDT Hero**: The intelligence technology brand. All intel functions.
- **Standing Orders**: Pre-authorized automated responses.
- **Authority Levels**: What agents can do autonomously vs. what requires approval.

## Quick Start

```bash
# Install dependencies
npm install

# Start the core server
npm start

# In another terminal, start the dashboard
npm run dashboard
```

## API

- `GET /api/status` - System status
- `POST /api/message` - Send message to agents
- `GET /api/agents` - List all agents and status
- `GET /api/standing-orders` - List standing orders

## Configuration

- `config/system.yaml` - Main system configuration
- `config/standing_orders.yaml` - Automated responses
- `config/operators/` - Operator profiles

## Agents

Each agent has a SOUL.md defining their:
- Identity and role
- Personality and communication style
- Authority levels
- Coordination patterns

Agents are located in `agents/<section>/<role>/SOUL.md`.

## Standing Orders

Pre-authorized responses to events. Define:
- Trigger conditions
- Authority level required
- Actions to execute
- Escalation thresholds

## Security

KDT Aso includes production-grade security hardening across all layers.

### Authentication & Access Control
- **JWT authentication** with 8-hour token expiry, mandatory secret (no fallback)
- **bcrypt password hashing** (12 rounds)
- **Account lockout** — 5 failed attempts triggers 15-minute lockout
- **JWT blacklist** — forced logout / token revocation support
- **Session rotation** — all sessions revoked on role change or password change
- **Concurrent session limit** — max 3 sessions per user (oldest evicted)
- **Socket.io authentication** — JWT required for all WebSocket connections
- **Admin-only routes** — encryption and sensitive APIs restricted by role

### Rate Limiting
- **General API**: 100 requests / 15 min per IP
- **Auth endpoints**: 5 attempts / 15 min per IP (successful requests skipped)
- **Sensitive operations**: 10 / hour (admin actions, encryption, backups)

### Input Validation & Sanitization
- XSS prevention (script tags, event handlers, javascript: URIs)
- Prototype pollution protection
- Path traversal guards on document and memory routes
- Request body size limits (1 MB max)

### Security Headers (via Helmet)
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy, Permissions-Policy
- Cross-Origin isolation headers

### CORS
- Strict origin allowlist (configurable via `CORS_ORIGINS` env var)
- No wildcard origins in production

### Error Handling
- Global error handler — no stack traces leak in production
- Uncaught exception / unhandled rejection handlers
- Graceful shutdown on SIGTERM/SIGINT

### Infrastructure
- **Docker**: Non-root user (`kdt:1001`), `no-new-privileges`, Alpine-based minimal image
- **Nginx**: Rate limiting zones, server tokens off, request size limits, security headers
- **Dependencies**: 0 known vulnerabilities (`npm audit`)

### Monitoring
- Security audit logging for auth events and sensitive operations
- Request logging middleware
- Security status dashboard (`GET /api/security/status`)
- Account lockout status endpoint (`GET /api/security/lockout-status`)

### Security Testing
Tests cover: rate limiting, account lockout, CORS blocking, socket auth, input sanitization, path traversal blocking, security headers, content-type validation, and global error handling.

Run tests:
```bash
npm test
```

### Reporting Vulnerabilities
See [SECURITY.md](./SECURITY.md) for the vulnerability disclosure policy.

## License

PROPRIETARY - Knight Division Tactical

---

*KDT Aso drives itself.*
