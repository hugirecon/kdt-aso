# KDT Aso — API Reference

> Complete documentation for all REST API endpoints.  
> Base URL: `http://localhost:3001/api`

## Table of Contents

- [Authentication](#authentication)
- [System](#system)
- [Messaging](#messaging)
- [Agents](#agents)
- [Standing Orders](#standing-orders)
- [Geospatial](#geospatial)
- [Alerts](#alerts)
- [Sensors](#sensors)
- [Geofences & Watchlists](#geofences--watchlists)
- [Voice](#voice)
- [Memory](#memory)
- [Documents](#documents)
- [Backups](#backups)
- [Encryption](#encryption)
- [Security](#security)
- [Languages](#languages)
- [Admin — Users](#admin--users)
- [Admin — Roles](#admin--roles)
- [Admin — Settings](#admin--settings)
- [Admin — Audit](#admin--audit)
- [WebSocket Events](#websocket-events)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)

---

## Authentication

All endpoints below `/api` (except `/api/auth/login`, `/api/auth/logout`, and `/api/health`) require a valid JWT. The token is set as an `httpOnly` cookie on login.

### `POST /api/auth/login`

Authenticate and receive a session cookie.

- **Rate limit:** 5 requests / 15 min (per IP)
- **Account lockout:** 5 failed attempts → 15 min lockout (by IP and username)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | ✅ | Account username |
| `password` | string | ✅ | Account password |

**Success (200):**
```json
{ "success": true, "token": "jwt...", "user": { "id": "...", "username": "...", "role": "..." } }
```

**Locked out (429):**
```json
{ "error": "Account temporarily locked...", "locked": true, "remainingMs": 900000 }
```

### `POST /api/auth/logout`

Clear the session cookie.

**Response:** `{ "success": true }`

### `GET /api/auth/me`

Return the currently authenticated user.

**Response:** `{ "user": { "id": "...", "username": "...", "role": "..." } }`

---

## System

### `GET /api/health`

Health check for Docker / load balancers. No auth required (after middleware applies, returns minimal info).

**Response:** `{ "status": "ok" }`

### `GET /api/status`

System status with agent and standing order info (authenticated users get full detail).

**Response:**
```json
{
  "system": "KDT Aso",
  "version": "0.1.0",
  "status": "operational",
  "agents": { ... },
  "standingOrders": 5
}
```

---

## Messaging

### `POST /api/message`

Send a message to the agent router. The system determines the appropriate agent and returns its response. Also broadcasts the response via WebSocket.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operatorId` | string | — | Operator profile ID |
| `message` | string | ✅ | The message text |
| `language` | string | — | Language code or `"auto"` (default) |
| `sessionId` | string | — | Conversation session ID |

**Response:**
```json
{
  "agent": "Intelligence Officer",
  "agentId": "intelligence_officer",
  "section": "hero",
  "content": "Agent response text...",
  "timestamp": "2026-03-05T10:00:00.000Z",
  "language": "en",
  "languageName": "English",
  "isEmergency": false
}
```

---

## Agents

### `GET /api/agents`

List all loaded agents and their status.

**Response:**
```json
{
  "intelligence_officer": { "name": "Intelligence Officer", "section": "hero", "status": "online" },
  "watch_officer": { "name": "Watch Officer", "section": "operations", "status": "online" }
}
```

---

## Standing Orders

### `GET /api/standing-orders`

List all standing orders.

### `GET /api/standing-orders/:id`

Get a specific standing order by ID.

**404:** `{ "error": "Standing order not found" }`

### `POST /api/standing-orders/trigger`

Manually trigger a standing order.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trigger` | string | ✅ | Trigger name to fire |
| `context` | object | — | Additional context data |

### `GET /api/standing-orders/logs`

Get standing order execution logs.

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 100 | Max entries to return |

---

## Geospatial

### `GET /api/geo/data`

Get all geospatial data (markers, areas, circles, center).

### `POST /api/geo/marker`

Add a map marker. Auto-generates ID if not provided. Broadcasts `geo:marker:add` via WebSocket.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | — | Marker ID (auto-generated if omitted) |
| `position` | [lat, lng] | ✅ | Coordinates |
| `type` | string | ✅ | `"friendly"`, `"hostile"`, `"objective"`, etc. |
| `label` | string | ✅ | Display name |
| `details` | string | — | Additional info |

### `DELETE /api/geo/marker/:id`

Remove a marker. Broadcasts `geo:marker:remove`.

### `POST /api/geo/area`

Add an area overlay. Broadcasts `geo:area:add`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | — | Area ID |
| `positions` | [[lat,lng],...] | ✅ | Polygon vertices |
| `type` | string | ✅ | `"aoi"`, `"restricted"`, etc. |
| `label` | string | ✅ | Display name |

### `POST /api/geo/center`

Set the map center. Broadcasts `geo:center`.

| Field | Type | Required |
|-------|------|----------|
| `center` | [lat, lng] | ✅ |

---

## Alerts

### `GET /api/alerts`

List active alerts with optional filters.

| Query | Type | Description |
|-------|------|-------------|
| `priority` | string | Filter by priority level |
| `category` | string | Filter by category |
| `unacknowledged` | `"true"` | Only unacknowledged alerts |

### `GET /api/alerts/counts`

Get alert counts by priority/status.

### `GET /api/alerts/history`

Get historical (resolved) alerts.

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 100 | Max entries |
| `priority` | string | — | Filter |
| `category` | string | — | Filter |
| `from` | string | — | Start date |
| `to` | string | — | End date |

### `GET /api/alerts/:id`

Get a specific alert.

### `POST /api/alerts`

Create a new alert.

### `POST /api/alerts/:id/acknowledge`

Acknowledge an alert.

| Field | Type | Description |
|-------|------|-------------|
| `note` | string | Optional acknowledgment note |

### `POST /api/alerts/:id/resolve`

Resolve an alert.

| Field | Type | Description |
|-------|------|-------------|
| `resolution` | string | Resolution description |

### `POST /api/alerts/:id/escalate`

Escalate an alert.

| Field | Type | Description |
|-------|------|-------------|
| `reason` | string | Escalation reason (default: "Manual escalation") |

### `POST /api/alerts/:id/note`

Add a note to an alert.

| Field | Type | Required |
|-------|------|----------|
| `text` | string | ✅ |

### `POST /api/alerts/:id/assign`

Assign an alert to a user.

| Field | Type | Required |
|-------|------|----------|
| `assignee` | string | ✅ |

---

## Sensors

### `GET /api/sensors`

List registered sensors.

| Query | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by sensor type |
| `zone` | string | Filter by zone |
| `status` | string | Filter by status |

### `GET /api/sensors/counts`

Get sensor counts by type/status.

### `GET /api/sensors/types`

List available sensor types.

### `GET /api/sensors/latest`

Get latest data reading from all sensors.

### `GET /api/sensors/:id`

Get a specific sensor.

### `GET /api/sensors/:id/data`

Get buffered data from a sensor.

| Query | Type | Default |
|-------|------|---------|
| `limit` | number | 50 |

### `POST /api/sensors/register`

Register a new sensor.

### `POST /api/sensors/:id/ingest`

Ingest data from a sensor.

### `DELETE /api/sensors/:id`

Unregister a sensor.

---

## Geofences & Watchlists

### `GET /api/geofences`

List all geofences.

### `POST /api/geofences`

Create a geofence.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | — | Auto-generated if omitted |
| *(geofence config)* | object | ✅ | Geofence definition |

### `POST /api/watchlist/:type`

Add an entry to a watchlist.

| Param | Description |
|-------|-------------|
| `:type` | Watchlist type (e.g., `"vehicle"`, `"person"`) |

| Field | Type | Required |
|-------|------|----------|
| `id` | string | ✅ |
| *(additional data)* | any | — |

---

## Voice

### `GET /api/voice/status`

Get voice interface status and available profiles.

**Response:**
```json
{ "enabled": true, "profiles": ["default", "command", "briefing"] }
```

### `POST /api/voice/speak`

Generate text-to-speech audio.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | ✅ | Text to speak |
| `agentId` | string | — | Agent voice profile to use |

**503:** Voice interface not enabled.

---

## Memory

### `GET /api/memory/stats`

Get memory system statistics.

### `GET /api/memory/agent/:agentId`

Get an agent's persistent memory. Path traversal protected.

### `POST /api/memory/agent/:agentId/fact`

Add a fact to an agent's memory.

| Field | Type | Required |
|-------|------|----------|
| `fact` | string | ✅ |
| `category` | string | — |

### `GET /api/memory/operational`

Get recent operational context/events.

| Query | Type | Default |
|-------|------|---------|
| `hours` | number | 24 |

---

## Documents

### `GET /api/documents`

List documents. Supports query string filters.

### `GET /api/documents/categories`

List document categories.

### `GET /api/documents/stats`

Get document storage statistics.

### `GET /api/documents/:id`

Get a specific document. Path traversal protected.

### `POST /api/documents`

Create a new document.

### `PUT /api/documents/:id`

Update a document. Path traversal protected.

### `DELETE /api/documents/:id`

Delete a document. Path traversal protected.

### `GET /api/documents/search/:query`

Search documents. Supports query string options.

### `POST /api/documents/template/:type`

Generate a document from a template.

| Param | Description |
|-------|-------------|
| `:type` | Template type |

---

## Backups

### `GET /api/backups`

List all backups.

### `POST /api/backups`

Create a new backup. Rate limited (sensitive operation). Audit logged.

### `GET /api/backups/:id`

Get backup info.

### `POST /api/backups/:id/restore`

Restore from a backup. Rate limited. Audit logged.

### `DELETE /api/backups/:id`

Delete a backup.

---

## Encryption

> **Admin only.** All encryption endpoints require admin role and are rate limited as sensitive operations.

### `GET /api/encryption/status`

Get encryption system status.

### `POST /api/encryption/session`

Generate an encryption session key.

| Field | Type | Required |
|-------|------|----------|
| `userId` | string | ✅ |

### `POST /api/encryption/encrypt`

Encrypt data.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | any | ✅ | Data to encrypt |
| `sessionId` | string | — | Session key to use (uses master key if omitted) |

### `POST /api/encryption/decrypt`

Decrypt data.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `encrypted` | string | ✅ | Encrypted payload |
| `sessionId` | string | — | Session key used for encryption |
| `parseJson` | boolean | — | Parse result as JSON |

---

## Security

> **Admin only** (except session management for own account).

### `GET /api/security/audit`

Get security audit log entries.

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 100 | Max entries |
| `category` | string | — | Filter category |
| `severity` | string | — | Filter severity |
| `userId` | string | — | Filter by user |
| `action` | string | — | Filter by action |

### `GET /api/security/lockouts`

List currently locked-out IPs/usernames. Admin only.

### `POST /api/security/revoke-sessions`

Force logout a user by revoking all their sessions. Non-admins can only revoke their own sessions.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Target user (defaults to self) |

**Response:**
```json
{ "success": true, "revokedSessions": 3, "message": "All sessions for user123 have been revoked" }
```

### `GET /api/security/sessions`

List active sessions for the current user. Token IDs are masked.

### `GET /api/security/status`

Security dashboard — overview of all security features. Admin only.

**Response:**
```json
{
  "ipAllowlist": { "enabled": false, "count": 0 },
  "rateLimiting": true,
  "securityHeaders": true,
  "socketAuth": true,
  "accountLockout": true,
  "inputSanitization": true,
  "auditLogging": true,
  "corsLocked": true,
  "activeLockouts": 0,
  "recentSecurityEvents": 3
}
```

---

## Languages

### `GET /api/languages`

List supported languages.

### `POST /api/languages/detect`

Detect the language of a text sample.

| Field | Type | Required |
|-------|------|----------|
| `text` | string | ✅ |

**Response:**
```json
{ "code": "en", "name": "English", "isEmergency": false }
```

### `GET /api/languages/:code/greeting`

Get a greeting in the specified language.

### `GET /api/languages/:code/emergency-phrases`

Get emergency phrases in the specified language.

---

## Admin — Users

> **Admin only.** All admin endpoints require admin role.

### `GET /api/admin/users`

List all users.

### `POST /api/admin/users`

Create a user. Audit logged.

### `PUT /api/admin/users/:id`

Update a user. If `role` or `access` changes, all existing sessions are revoked (session rotation).

### `DELETE /api/admin/users/:id`

Delete a user. Audit logged.

### `POST /api/admin/users/:id/password`

Change a user's password. All existing sessions are revoked. Audit logged.

**Response:** `{ "success": true, "sessionsRevoked": 2 }`

---

## Admin — Roles

### `GET /api/admin/roles`

List all roles.

### `POST /api/admin/roles`

Create a role.

### `PUT /api/admin/roles/:id`

Update a role.

### `DELETE /api/admin/roles/:id`

Delete a role.

---

## Admin — Settings

### `GET /api/admin/settings`

Get all settings.

### `GET /api/admin/settings/:category`

Get settings for a specific category.

### `PUT /api/admin/settings/:category`

Update settings for a category. Audit logged.

### `POST /api/admin/settings/reset`

Reset settings to defaults.

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Category to reset (omit for all) |

---

## Admin — Audit

### `GET /api/admin/audit`

Get admin audit log.

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 100 | Max entries |
| `userId` | string | — | Filter by actor |
| `action` | string | — | Filter by action type |

---

## WebSocket Events

WebSocket connections require JWT authentication (via `socketAuthMiddleware`).

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `operator:identify` | `operatorId` | Associate socket with operator profile |
| `message` | `{ message, language?, voiceEnabled? }` | Send a message to the agent router |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `response` | `{ agent, content, audioUrl?, ... }` | Agent response to a message |
| `message` | `{ from, content, timestamp }` | Broadcast of API message responses |
| `activity` | `{ type, agent?, summary }` | Activity feed update |
| `geo:marker:add` | marker object | New map marker |
| `geo:marker:remove` | marker ID | Removed marker |
| `geo:area:add` | area object | New map area |
| `geo:center` | `[lat, lng]` | Map center changed |
| `standing-order:executed` | `{ orderId, responses, timestamp }` | Standing order completed |
| `standing-order:error` | `{ orderId, error, timestamp }` | Standing order failed |
| `escalation` | escalation object | Alert escalation triggered |

---

## Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| General API | 100 requests | 15 minutes |
| Auth (`/api/auth/login`) | 5 requests | 15 minutes |
| Sensitive ops (encryption, backups, restore) | 10 requests | 15 minutes |

All rate-limited responses return `429 Too Many Requests` with `Retry-After` header.

---

## Error Handling

All errors follow a consistent format:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Forbidden (insufficient role) |
| 404 | Resource not found |
| 429 | Rate limited or account locked |
| 500 | Internal server error |

**Security notes:**
- Stack traces are never exposed in production
- Internal field names are not leaked in error responses
- All 500 errors are logged to the security audit system

---

## Security Features

All API requests pass through the following middleware pipeline:

1. **Request ID** — Correlation ID attached to every request
2. **Security Headers** — Helmet (CSP, HSTS, X-Frame-Options, etc.)
3. **IP Allowlist** — Optional IP filtering (disabled by default)
4. **CORS** — Locked to configured origins only
5. **Body Size Limit** — 1 MB max
6. **Input Sanitization** — XSS, prototype pollution, path traversal protection
7. **Request Logging** — All requests logged to audit system
8. **Rate Limiting** — Per-scope limits (see above)
9. **Content-Type Validation** — Non-JSON rejected on API routes
10. **JWT Authentication** — 8-hour expiry, no fallback secret
11. **Session Management** — Max 3 concurrent sessions per user, JWT blacklist for forced logout
