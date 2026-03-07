/**
 * KDT Aso - Autonomous Operations Platform
 * Core Entry Point
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const AgentRouter = require('./router');
const StandingOrders = require('./standing-orders');
const OperatorManager = require('./operators');
const { AuthManager, authMiddleware, requireRole } = require('./auth');
const VoiceInterface = require('./voice');
const AlertSystem = require('./alerts');
const SensorSystem = require('./sensors');
const AdminSystem = require('./admin');
const LanguageSupport = require('./languages');
const PersistentMemory = require('./persistent-memory');
const DocumentStorage = require('./documents');
const BackupSystem = require('./backup');
const EncryptionSystem = require('./encryption');
const TileServer = require('./tile-server');
const MissionPlanner = require('./mission-planner');
const IncidentTracker = require('./incidents');
const ShiftManager = require('./shifts');
const {
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
  apiVersionHeaders,
  responseSanitizer,
  methodEnforcement,
  AccountLockout,
  SecurityAuditLog,
  ApiKeyManager,
  IpAllowlist,
  JwtBlacklist,
  SessionLimiter,
  SecurityMonitor,
  startupSecurityCheck,
  MAX_BODY_SIZE
} = require('./security');

// Setup process-level error handlers
setupProcessHandlers();

const languageSupport = new LanguageSupport();
const persistentMemory = new PersistentMemory('./memory');
const documentStorage = new DocumentStorage('./documents');
const backupSystem = new BackupSystem({ backupDir: './backups', dataDir: '.' });
const encryptionSystem = new EncryptionSystem({ keyDir: './config/keys' });
const tileServer = new TileServer(path.join(__dirname, '..', 'tiles'));
const missionPlanner = new MissionPlanner();
const incidentTracker = new IncidentTracker();
const shiftManager = new ShiftManager();

// Security systems
const securityAudit = new SecurityAuditLog();
const accountLockout = new AccountLockout({ maxAttempts: 5, lockoutDuration: 15 * 60 * 1000 });
const apiKeyManager = new ApiKeyManager();
const jwtBlacklist = new JwtBlacklist();
const sessionLimiter = new SessionLimiter(3);  // Max 3 concurrent sessions per user

const securityMonitor = new SecurityMonitor({
  failedLoginThreshold: parseInt(process.env.FAILED_LOGIN_ALERT_THRESHOLD || '10'),
  rateLimitThreshold: parseInt(process.env.RATE_LIMIT_ALERT_THRESHOLD || '20'),
  windowMs: 5 * 60 * 1000
});

// Emit security monitor alerts to WebSocket clients (admins)
securityMonitor.onAlert((alert) => {
  // io may not be ready yet at boot, but will be once server starts
  try { io.emit('security:alert', alert); } catch (_) { /* pre-boot */ }
});

// Wire blacklist/session limiter into auth system
const { AuthManager: AuthManagerClass } = require('./auth');
AuthManagerClass.setBlacklist(jwtBlacklist);
AuthManagerClass.setSessionLimiter(sessionLimiter);
const ipAllowlist = new IpAllowlist({ 
  enabled: process.env.IP_ALLOWLIST_ENABLED === 'true',
  allowedIps: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : ['127.0.0.1', '::1', '::ffff:127.0.0.1']
});

// Parse allowed CORS origins from env or use defaults
const corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];
const corsOptions = getCorsOptions(corsOrigins);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  pingTimeout: 30000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6  // 1MB max WebSocket message
});

// ============================================================
// SECURITY MIDDLEWARE STACK (order matters)
// ============================================================

// 0. Request ID tracking
app.use(requestIdMiddleware);

// 1. Security headers (helmet)
app.use(securityHeaders);

// 2. IP allowlist (if enabled)
app.use(ipAllowlist.middleware());

// 3. CORS (locked down) — health check exempt for Docker/load balancers
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  cors(corsOptions)(req, res, next);
});

// 4. Body parsing with size limits
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: false, limit: MAX_BODY_SIZE }));
app.use(cookieParser());

// 5. Input sanitization
app.use(inputSanitizer);

// 6. Request logging
app.use(requestLogger(securityAudit));

// 7. General API rate limiting (with breach monitoring)
app.use('/api', (req, res, next) => {
  // Hook into rate limiter: if res gets 429, record the breach
  const origStatus = res.status.bind(res);
  res.status = function(code) {
    if (code === 429) {
      securityMonitor.recordRateLimitBreach(req.ip, req.path);
    }
    return origStatus(code);
  };
  next();
});
app.use('/api', apiLimiter);

// 8. Content-Type validation on API routes
app.use('/api', requireJson);

// 9. API versioning headers
app.use(apiVersionHeaders('1.0'));

// 10. Response sanitization (strip internal fields from JSON responses)
app.use(responseSanitizer);

// 11. HTTP method enforcement
app.use(methodEnforcement({
  '/api/auth': ['GET', 'POST'],
  '/api/admin': ['GET', 'POST', 'PUT', 'DELETE'],
  '/api/health': ['GET']
}));

// Trust proxy (if behind reverse proxy/nginx)
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

// Cleanup lockout entries periodically
setInterval(() => accountLockout.cleanup(), 5 * 60 * 1000);

// Initialize core systems
const agentRouter = new AgentRouter();
const standingOrders = new StandingOrders();
const operatorManager = new OperatorManager();
const authManager = new AuthManager();
const voiceInterface = new VoiceInterface();
const alertSystem = new AlertSystem();
const sensorSystem = new SensorSystem();
const adminSystem = new AdminSystem('./config');
adminSystem.init().catch(err => console.error('Admin system init failed:', err));

// Sensor system event handlers
sensorSystem.on('sensor:registered', (sensor) => {
  console.log(`Sensor registered: ${sensor.name} (${sensor.type})`);
  io.emit('sensor:registered', sensor);
});

sensorSystem.on('sensor:data', (data) => {
  io.emit('sensor:data', data);
  
  // Update map marker if sensor has location
  const sensor = sensorSystem.get(data.sensorId);
  if (sensor?.location && data.position) {
    io.emit('geo:marker:update', {
      id: `sensor-${data.sensorId}`,
      position: [data.position.lat, data.position.lng],
      type: 'asset',
      label: sensor.name,
      details: `${sensor.type} - Last update: ${data.timestamp}`
    });
  }
});

sensorSystem.on('sensor:trigger', (trigger) => {
  console.log(`Sensor trigger: ${trigger.trigger} from ${trigger.sensorName}`);
  io.emit('sensor:trigger', trigger);
  
  // Map sensor triggers to standing order triggers
  const triggerMapping = {
    'motion_detected': 'movement_detected_perimeter',
    'person_detected': 'movement_detected_perimeter',
    'geofence_breach': 'tracked_asset_leaves_geofence',
    'face_match': 'watchlist_entity_detected',
    'sos_activated': 'emergency_declared',
    'forced_entry': 'movement_detected_perimeter',
    'smoke_detected': 'emergency_declared',
    'gas_leak': 'emergency_declared'
  };
  
  const standingOrderTrigger = triggerMapping[trigger.trigger];
  if (standingOrderTrigger) {
    standingOrders.checkTrigger(standingOrderTrigger, {
      sensor: trigger.sensorId,
      sensorName: trigger.sensorName,
      sensorType: trigger.sensorType,
      zone: trigger.zone,
      originalTrigger: trigger.trigger,
      data: trigger.data
    });
  }
  
  // Create alert for critical triggers
  const criticalTriggers = ['forced_entry', 'sos_activated', 'smoke_detected', 'gas_leak', 'face_match'];
  const highTriggers = ['geofence_breach', 'tamper_alert', 'jamming_detected'];
  
  if (criticalTriggers.includes(trigger.trigger)) {
    alertSystem.security(
      `${trigger.trigger.replace(/_/g, ' ').toUpperCase()}`,
      `${trigger.sensorName} (${trigger.zone || 'Unknown zone'}): ${trigger.trigger.replace(/_/g, ' ')}`,
      'critical',
      trigger
    );
  } else if (highTriggers.includes(trigger.trigger)) {
    alertSystem.security(
      `${trigger.trigger.replace(/_/g, ' ').toUpperCase()}`,
      `${trigger.sensorName} (${trigger.zone || 'Unknown zone'}): ${trigger.trigger.replace(/_/g, ' ')}`,
      'high',
      trigger
    );
  }
});

sensorSystem.on('sensor:offline', (sensor) => {
  console.log(`Sensor offline: ${sensor.name}`);
  io.emit('sensor:offline', sensor);
  
  // Check standing order for asset offline
  standingOrders.checkTrigger('tracked_asset_no_signal', {
    sensor: sensor.id,
    sensorName: sensor.name,
    sensorType: sensor.type,
    zone: sensor.zone,
    lastSeen: sensor.lastSeen
  });
});

// Alert system event handlers
alertSystem.on('alert', (alert) => {
  io.emit('alert:new', alert);
});

alertSystem.on('alert:acknowledged', (alert) => {
  io.emit('alert:updated', alert);
});

alertSystem.on('alert:resolved', (alert) => {
  io.emit('alert:resolved', alert);
});

alertSystem.on('alert:escalated', (alert) => {
  io.emit('alert:escalated', alert);
  console.log(`Alert escalated: ${alert.title} -> ${alert.priority}`);
});

// Serve audio files
app.use('/audio', express.static(path.join(__dirname, '..', 'audio')));

// Serve dashboard static files
app.use(express.static(path.join(__dirname, '..', 'dashboard', 'dist')));

// Auth routes (before auth middleware) — rate limited separately
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Check account lockout (by IP and by username)
  const ipKey = `ip:${req.ip}`;
  const userKey = `user:${username}`;
  
  if (accountLockout.isLocked(ipKey) || accountLockout.isLocked(userKey)) {
    securityAudit.logAuth('login_blocked', `Locked out: ${username}`, req.ip, null, false);
    return res.status(429).json({ 
      error: 'Account temporarily locked due to too many failed attempts. Try again later.',
      ...accountLockout.getStatus(userKey)
    });
  }

  const result = await authManager.authenticate(username, password);
  
  if (result.success) {
    // Clear lockout on success
    accountLockout.recordSuccess(ipKey);
    accountLockout.recordSuccess(userKey);
    securityAudit.logAuth('login_success', `User: ${username}`, req.ip, result.user.id, true);
    
    res.cookie('token', result.token, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,  // 8 hours (reduced from 24)
      path: '/'
    });
    
    // Strip the token from the response body — it's already set as an httpOnly cookie.
    // Exposing it in JSON defeats the purpose of httpOnly (XSS could read it).
    const { token, ...safeResult } = result;
    res.json(safeResult);
  } else {
    // Record failed attempt (except for password change required)
    if (!result.mustChangePassword) {
      accountLockout.recordFailure(ipKey);
      accountLockout.recordFailure(userKey);
      securityAudit.logAuth('login_failed', `User: ${username}`, req.ip, null, false);
      securityMonitor.recordFailedLogin(req.ip, username);
    } else {
      securityAudit.logAuth('login_password_change_required', `User: ${username}`, req.ip, result.userId, false);
    }
    
    res.json(result);
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Extract and blacklist the JWT so it can't be reused even if copied
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (token) {
    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (decoded.jti) {
        jwtBlacklist.revoke(decoded.jti, decoded.exp ? decoded.exp * 1000 : undefined);
        sessionLimiter.remove(decoded.id, decoded.jti);
      }
    } catch (_) { /* token already invalid — fine */ }
  }
  securityAudit.logAuth('logout', 'User logged out', req.ip, req.user?.id);
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware(authManager), (req, res) => {
  res.json({ user: req.user });
});

// Force password change endpoint (for users who must change password)
app.post('/api/auth/change-password', authLimiter, async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  
  if (!userId || !oldPassword || !newPassword) {
    return res.status(400).json({ error: 'User ID, old password, and new password required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long' });
  }

  try {
    const result = await authManager.changePassword(userId, oldPassword, newPassword);
    if (result.success) {
      securityAudit.logAuth('password_change_success', `User: ${userId}`, req.ip, userId, true);
      res.json({ success: true, message: 'Password changed successfully' });
    } else {
      securityAudit.logAuth('password_change_failed', `User: ${userId}`, req.ip, userId, false);
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Tile server routes (before auth — tiles are public)
tileServer.init().catch(err => console.error('[TILES] Init error:', err));
tileServer.registerRoutes(app);

// Apply auth middleware to all protected API routes
app.use('/api', authMiddleware(authManager));

// Admin role check middleware (used on admin/encryption/security routes)
const adminAuth = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Health check endpoint (for Docker/load balancers) — minimal info
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes — requires auth (detailed info only for authenticated users)
app.get('/api/status', (req, res) => {
  // Only expose detailed status to authenticated users
  if (req.user) {
    res.json({
      system: 'KDT Aso',
      version: '0.1.0',
      status: 'operational',
      agents: agentRouter.getAgentStatus(),
      standingOrders: standingOrders.getActiveCount()
    });
  } else {
    res.json({ status: 'operational' });
  }
});

app.post('/api/message', authMiddleware(authManager), async (req, res) => {
  const { operatorId, message, language, sessionId } = req.body;
  
  try {
    const operator = operatorManager.getOperator(operatorId);
    const session = sessionId || `api-${operatorId || 'default'}`;
    const response = await agentRouter.route(message, operator, language, session);
    
    // Broadcast to dashboard
    io.emit('message', {
      from: response.agent,
      content: response.content,
      timestamp: new Date().toISOString()
    });
    
    res.json(response);
  } catch (error) {
    console.error('Message handling error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents', authMiddleware(authManager), (req, res) => {
  res.json(agentRouter.getAgentStatus());
});

app.get('/api/standing-orders', authMiddleware(authManager), (req, res) => {
  res.json(standingOrders.list());
});

// Trigger a standing order manually (for testing or manual intervention)
app.post('/api/standing-orders/trigger', authMiddleware(authManager), async (req, res) => {
  const { trigger, context } = req.body;
  
  try {
    const triggered = standingOrders.checkTrigger(trigger, context || {});
    
    if (triggered) {
      res.json({ success: true, message: `Standing order triggered: ${trigger}` });
    } else {
      res.status(404).json({ success: false, message: `No standing order found for trigger: ${trigger}` });
    }
  } catch (error) {
    console.error('Standing order trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get standing order logs
app.get('/api/standing-orders/logs', authMiddleware(authManager), (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(standingOrders.getLogs(limit));
});

// Get a specific standing order
app.get('/api/standing-orders/:id', authMiddleware(authManager), (req, res) => {
  const order = standingOrders.orders[req.params.id];
  if (order) {
    res.json({ id: req.params.id, ...order });
  } else {
    res.status(404).json({ error: 'Standing order not found' });
  }
});

// Geospatial data store (in-memory for now)
const geoData = {
  markers: [
    { id: 'hq-1', position: [9.0820, 7.4951], type: 'friendly', label: 'KDT HQ', details: 'Main operations center' },
    { id: 'cp-1', position: [9.0750, 7.5100], type: 'friendly', label: 'Checkpoint Alpha', details: 'Northern perimeter' },
    { id: 'obj-1', position: [9.0900, 7.4800], type: 'objective', label: 'Objective Bravo', details: 'Primary target area' },
  ],
  areas: [
    { id: 'aoi-1', positions: [[9.08, 7.49], [9.09, 7.49], [9.09, 7.50], [9.08, 7.50]], type: 'aoi', label: 'Area of Interest 1' },
  ],
  circles: [
    { id: 'range-1', center: [9.0820, 7.4951], radius: 1000, type: 'coverage', label: 'Comms Range' },
  ],
  center: [9.0820, 7.4951]
};

// Geospatial API Routes
app.get('/api/geo/data', authMiddleware(authManager), (req, res) => {
  res.json(geoData);
});

app.post('/api/geo/marker', authMiddleware(authManager), (req, res) => {
  const marker = { ...req.body, id: req.body.id || `marker-${Date.now()}` };
  geoData.markers.push(marker);
  io.emit('geo:marker:add', marker);
  res.json(marker);
});

app.delete('/api/geo/marker/:id', authMiddleware(authManager), (req, res) => {
  const { id } = req.params;
  geoData.markers = geoData.markers.filter(m => m.id !== id);
  io.emit('geo:marker:remove', id);
  res.json({ success: true });
});

app.post('/api/geo/area', authMiddleware(authManager), (req, res) => {
  const area = { ...req.body, id: req.body.id || `area-${Date.now()}` };
  geoData.areas.push(area);
  io.emit('geo:area:add', area);
  res.json(area);
});

app.post('/api/geo/center', authMiddleware(authManager), (req, res) => {
  const { center } = req.body;
  geoData.center = center;
  io.emit('geo:center', center);
  res.json({ success: true });
});

// Alert API Routes
app.get('/api/alerts', authMiddleware(authManager), (req, res) => {
  const filters = {
    priority: req.query.priority,
    category: req.query.category,
    unacknowledged: req.query.unacknowledged === 'true'
  };
  res.json(alertSystem.getActive(filters));
});

app.get('/api/alerts/counts', authMiddleware(authManager), (req, res) => {
  res.json(alertSystem.getCounts());
});

app.get('/api/alerts/history', authMiddleware(authManager), (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const filters = {
    priority: req.query.priority,
    category: req.query.category,
    from: req.query.from,
    to: req.query.to
  };
  res.json(alertSystem.getHistory(limit, filters));
});

app.get('/api/alerts/:id', authMiddleware(authManager), (req, res) => {
  const alert = alertSystem.get(req.params.id);
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts', authMiddleware(authManager), (req, res) => {
  try {
    const alert = alertSystem.create(req.body);
    res.json(alert);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/alerts/:id/acknowledge', authMiddleware(authManager), (req, res) => {
  const { note } = req.body;
  const userId = req.user?.id || 'unknown';
  const alert = alertSystem.acknowledge(req.params.id, userId, note);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/resolve', authMiddleware(authManager), (req, res) => {
  const { resolution } = req.body;
  const userId = req.user?.id || 'unknown';
  const alert = alertSystem.resolve(req.params.id, userId, resolution);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/escalate', authMiddleware(authManager), (req, res) => {
  const { reason } = req.body;
  const alert = alertSystem.escalate(req.params.id, reason || 'Manual escalation');
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/note', authMiddleware(authManager), (req, res) => {
  const { text } = req.body;
  const userId = req.user?.id || 'unknown';
  const alert = alertSystem.addNote(req.params.id, userId, text);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/assign', authMiddleware(authManager), (req, res) => {
  const { assignee } = req.body;
  const alert = alertSystem.assign(req.params.id, assignee);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

// Sensor API Routes
app.get('/api/sensors', authMiddleware(authManager), (req, res) => {
  const filters = {
    type: req.query.type,
    zone: req.query.zone,
    status: req.query.status
  };
  res.json(sensorSystem.list(filters));
});

app.get('/api/sensors/counts', authMiddleware(authManager), (req, res) => {
  res.json(sensorSystem.getCounts());
});

app.get('/api/sensors/types', authMiddleware(authManager), (req, res) => {
  res.json(sensorSystem.sensorTypes);
});

app.get('/api/sensors/latest', authMiddleware(authManager), (req, res) => {
  res.json(sensorSystem.getLatestData());
});

app.get('/api/sensors/:id', authMiddleware(authManager), (req, res) => {
  const sensor = sensorSystem.get(req.params.id);
  if (sensor) {
    res.json(sensor);
  } else {
    res.status(404).json({ error: 'Sensor not found' });
  }
});

app.get('/api/sensors/:id/data', authMiddleware(authManager), (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const data = sensorSystem.getBuffer(req.params.id, limit);
  res.json(data);
});

app.post('/api/sensors/register', authMiddleware(authManager), (req, res) => {
  try {
    const sensor = sensorSystem.register(req.body);
    res.json(sensor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sensors/:id/ingest', authMiddleware(authManager), (req, res) => {
  try {
    const data = sensorSystem.ingest(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/sensors/:id', authMiddleware(authManager), (req, res) => {
  const success = sensorSystem.unregister(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Sensor not found' });
  }
});

// Geofence management
app.get('/api/geofences', authMiddleware(authManager), (req, res) => {
  const geofences = Array.from(sensorSystem.geofences.entries()).map(([id, gf]) => ({ id, ...gf }));
  res.json(geofences);
});

app.post('/api/geofences', authMiddleware(authManager), (req, res) => {
  const { id, ...geofence } = req.body;
  const gfId = id || `gf-${Date.now()}`;
  sensorSystem.addGeofence(gfId, geofence);
  res.json({ id: gfId, ...geofence });
});

// Watchlist management
app.post('/api/watchlist/:type', authMiddleware(authManager), (req, res) => {
  const { type } = req.params;
  const { id, ...data } = req.body;
  sensorSystem.addToWatchlist(type, id, data);
  res.json({ success: true, type, id });
});

// Voice API Routes
app.get('/api/voice/status', authMiddleware(authManager), (req, res) => {
  res.json({
    enabled: voiceInterface.isEnabled(),
    profiles: Object.keys(voiceInterface.voiceProfiles)
  });
});

// STT handled client-side via browser Web Speech API (no server endpoint needed)

app.post('/api/voice/speak', authMiddleware(authManager), async (req, res) => {
  try {
    if (!voiceInterface.isEnabled()) {
      return res.status(503).json({ error: 'Voice interface not enabled' });
    }
    
    const { text, agentId } = req.body;
    const result = await voiceInterface.speak(text, agentId);
    res.json(result);
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket authentication
io.use(socketAuthMiddleware(authManager));

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log(`Dashboard connected: ${socket.id} (user: ${socket.user?.username})`);
  securityAudit.logAuth('socket_connect', `User: ${socket.user?.username}`, socket.handshake.address, socket.user?.id);
  
  socket.on('operator:identify', (operatorId) => {
    // Validate operator ID matches authenticated user
    if (operatorId !== socket.user?.id && socket.user?.role !== 'admin') {
      socket.emit('error', { message: 'Cannot identify as another operator' });
      return;
    }
    socket.operatorId = operatorId;
    socket.join(`operator:${operatorId}`);
  });
  
  socket.on('message', async (data) => {
    try {
    // Input validation for socket messages
    if (!data || typeof data !== 'object') {
      return socket.emit('response', { agent: 'KDT Aso', content: 'Invalid message format.', timestamp: new Date().toISOString() });
    }
    if (typeof data.message !== 'string' || data.message.length === 0 || data.message.length > 10000) {
      return socket.emit('response', { agent: 'KDT Aso', content: 'Message must be a string between 1 and 10,000 characters.', timestamp: new Date().toISOString() });
    }
    if (data.language && (typeof data.language !== 'string' || data.language.length > 10)) {
      return socket.emit('response', { agent: 'KDT Aso', content: 'Invalid language code.', timestamp: new Date().toISOString() });
    }
    if (data.missionId && (typeof data.missionId !== 'string' || data.missionId.length > 100)) {
      return socket.emit('response', { agent: 'KDT Aso', content: 'Invalid mission ID.', timestamp: new Date().toISOString() });
    }
    console.log('[CHAT] Message received:', JSON.stringify({ message: data.message?.substring(0, 50), missionId: data.missionId }));
    const { message, language, voiceEnabled, missionId } = data;
    const operator = operatorManager.getOperator(socket.operatorId);
    const sessionId = `ws-${socket.operatorId || 'default'}-${socket.id}`;
    
    let response;
    if (missionId) {
      // Route to plans officer with mission context
      const mission = missionPlanner.getMission(missionId);
      if (mission) {
        const taskings = (mission.taskings || []).map(t => {
          const tasks = Array.isArray(t.tasks) ? t.tasks.join('; ') : String(t.tasks || '');
          return `${t.unit} [${t.priority}/${t.status}]: ${tasks} — Purpose: ${t.purpose}`;
        }).join('\n');
        const overlays = (mission.mapOverlays || []).map(o => `${o.type}: ${o.name} — ${o.description}`).join('\n');
        
        let opordText = '';
        try { opordText = missionPlanner.generateOpordText(missionId); } catch(e) { console.error('[CHAT] OPORD gen error:', e.message); }
        
        const missionContext = {
          opordText,
          mettTc: JSON.stringify(mission.mettTc || {}, null, 2),
          taskings,
          overlays,
          missionName: mission.name,
          missionStatus: mission.status,
        };
        response = await agentRouter.route(message, operator, language || 'en', sessionId, { missionContext, forceAgent: 'plans_officer' });
      } else {
        response = await agentRouter.route(message, operator, language || 'en', sessionId);
      }
    } else {
      response = await agentRouter.route(message, operator, language || 'en', sessionId);
    }
    
    // Generate voice response if enabled
    if (voiceEnabled && voiceInterface.isEnabled()) {
      try {
        const voiceResult = await voiceInterface.speak(response.content, response.agentId);
        response.audioUrl = voiceResult.audioUrl;
        response.voice = voiceResult.voice;
      } catch (err) {
        console.error('Voice generation error:', err);
      }
    }
    
    socket.emit('response', response);
    io.emit('activity', {
      type: 'message',
      agent: response.agent,
      summary: response.content.substring(0, 100)
    });
    } catch (err) {
      console.error('[CHAT] FATAL handler error:', err);
      socket.emit('response', {
        agent: 'KDT Aso',
        content: 'Internal error processing your request. Please try again.',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // STT handled client-side via browser Web Speech API
  // Voice input transcription happens in browser, then sent as regular message
  
  socket.on('disconnect', () => {
    console.log('Dashboard disconnected:', socket.id);
  });
});

// Standing orders event emitter (for autonomous operations)
standingOrders.on('trigger', async (order, context) => {
  console.log(`Standing order triggered: ${order.name || order.id}`);
  
  try {
    const responses = await agentRouter.executeStandingOrder(order, context);
    
    // Broadcast to all connected dashboards
    io.emit('standing-order:executed', {
      orderId: order.id,
      orderName: order.name || order.id,
      responses,
      timestamp: new Date().toISOString()
    });
    
    // Log activity
    io.emit('activity', {
      type: 'standing-order',
      order: order.name || order.id,
      summary: `Standing order executed with ${responses.length} agent actions`
    });
    
    // Check for escalation
    if (standingOrders.requiresEscalation(order, responses)) {
      const escalation = standingOrders.escalate(order, responses);
      io.emit('escalation', escalation);
    }
  } catch (error) {
    console.error('Standing order execution error:', error);
    io.emit('standing-order:error', {
      orderId: order.id,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Escalation event handler - creates alert through alert system
standingOrders.on('escalation', (escalation) => {
  console.log(`Escalation: ${escalation.orderName} - ${escalation.reason}`);
  
  // Create alert through alert system
  alertSystem.fromStandingOrder(escalation);
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗  ██╗██████╗ ████████╗     █████╗ ███████╗ ██████╗   ║
║   ██║ ██╔╝██╔══██╗╚══██╔══╝    ██╔══██╗██╔════╝██╔═══██╗  ║
║   █████╔╝ ██║  ██║   ██║       ███████║███████╗██║   ██║  ║
║   ██╔═██╗ ██║  ██║   ██║       ██╔══██║╚════██║██║   ██║  ║
║   ██║  ██╗██████╔╝   ██║       ██║  ██║███████║╚██████╔╝  ║
║   ╚═╝  ╚═╝╚═════╝    ╚═╝       ╚═╝  ╚═╝╚══════╝ ╚═════╝   ║
║                                                           ║
║   Autonomous Operations Platform                          ║
║   Knight Division Tactical                                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

  Server running on port ${PORT}
  Dashboard: http://localhost:3002
  API: http://localhost:${PORT}/api
  
  All systems operational. Awaiting Operator.
  `);

  // Run startup security self-check
  const selfCheck = startupSecurityCheck();
  if (!selfCheck.passed) {
    console.warn(`[STARTUP] Security self-check has warnings — review above`);
  }

  // Initialize time-based standing orders
  standingOrders.initializeMonitors();
});

// Memory API Routes
app.get('/api/memory/stats', authMiddleware(authManager), (req, res) => {
  persistentMemory.getStats().then(stats => res.json(stats)).catch(err => res.status(500).json({ error: err.message }));
});

app.get('/api/memory/agent/:agentId', authMiddleware(authManager), pathTraversalGuard(['agentId']), async (req, res) => {
  try {
    const memory = await persistentMemory.loadAgentMemory(req.params.agentId);
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memory/agent/:agentId/fact', authMiddleware(authManager), pathTraversalGuard(['agentId']), async (req, res) => {
  try {
    const { fact, category } = req.body;
    const memory = await persistentMemory.addAgentFact(req.params.agentId, fact, category);
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/memory/operational', authMiddleware(authManager), async (req, res) => {
  try {
    const events = await persistentMemory.getRecentOperationalContext(req.query.hours || 24);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Document API Routes
app.get('/api/documents', authMiddleware(authManager), (req, res) => {
  const docs = documentStorage.list(req.query);
  res.json(docs);
});

app.get('/api/documents/categories', authMiddleware(authManager), (req, res) => {
  res.json(documentStorage.getCategories());
});

app.get('/api/documents/stats', authMiddleware(authManager), (req, res) => {
  res.json(documentStorage.getStats());
});

app.get('/api/documents/:id', authMiddleware(authManager), pathTraversalGuard(['id']), async (req, res) => {
  try {
    const doc = await documentStorage.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', authMiddleware(authManager), async (req, res) => {
  try {
    const doc = await documentStorage.create(req.body);
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/documents/:id', authMiddleware(authManager), pathTraversalGuard(['id']), async (req, res) => {
  try {
    const doc = await documentStorage.update(req.params.id, req.body);
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/documents/:id', authMiddleware(authManager), pathTraversalGuard(['id']), async (req, res) => {
  try {
    await documentStorage.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/documents/search/:query', authMiddleware(authManager), async (req, res) => {
  try {
    const results = await documentStorage.search(req.params.query, req.query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/template/:type', authMiddleware(authManager), async (req, res) => {
  try {
    const content = await documentStorage.generateFromTemplate(req.params.type, req.body);
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Backup API Routes
app.get('/api/backups', authMiddleware(authManager), async (req, res) => {
  try {
    const backups = await backupSystem.listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups', authMiddleware(authManager), sensitiveOpLimiter, async (req, res) => {
  try {
    const backup = await backupSystem.createBackup(req.body);
    securityAudit.logAccess('backup_create', '/api/backups', req.ip, req.user?.id, 'POST');
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/:id', authMiddleware(authManager), async (req, res) => {
  try {
    const info = await backupSystem.getBackupInfo(req.params.id);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/:id/restore', authMiddleware(authManager), sensitiveOpLimiter, async (req, res) => {
  try {
    securityAudit.logAccess('backup_restore', `/api/backups/${req.params.id}/restore`, req.ip, req.user?.id, 'POST');
    const result = await backupSystem.restore(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/backups/:id', authMiddleware(authManager), async (req, res) => {
  try {
    await backupSystem.deleteBackup(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Encryption API Routes (admin only, rate limited)
app.get('/api/encryption/status', authMiddleware(authManager), adminAuth, (req, res) => {
  res.json(encryptionSystem.getStatus());
});

app.post('/api/encryption/session', authMiddleware(authManager), adminAuth, sensitiveOpLimiter, (req, res) => {
  const { userId } = req.body;
  const sessionId = encryptionSystem.generateSessionKey(userId);
  securityAudit.logAccess('encryption_session_create', '/api/encryption/session', req.ip, req.user?.id, 'POST');
  res.json({ sessionId });
});

app.post('/api/encryption/encrypt', authMiddleware(authManager), adminAuth, sensitiveOpLimiter, (req, res) => {
  try {
    const { data, sessionId } = req.body;
    const key = sessionId ? encryptionSystem.getSessionKey(sessionId) : null;
    const encrypted = encryptionSystem.encrypt(data, key);
    res.json({ encrypted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/encryption/decrypt', authMiddleware(authManager), adminAuth, sensitiveOpLimiter, (req, res) => {
  try {
    const { encrypted, sessionId, parseJson } = req.body;
    const key = sessionId ? encryptionSystem.getSessionKey(sessionId) : null;
    const decrypted = encryptionSystem.decrypt(encrypted, key, parseJson);
    res.json({ decrypted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Security Audit API Routes (admin only)
app.get('/api/security/audit', authMiddleware(authManager), adminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const filters = {
    category: req.query.category,
    severity: req.query.severity,
    userId: req.query.userId,
    action: req.query.action
  };
  res.json(securityAudit.getRecent(limit, filters));
});

app.get('/api/security/lockouts', authMiddleware(authManager), adminAuth, (req, res) => {
  const lockouts = [];
  for (const [key, record] of accountLockout.attempts.entries()) {
    if (accountLockout.isLocked(key)) {
      lockouts.push({ key, ...record });
    }
  }
  res.json(lockouts);
});

// Force logout a specific user (admin) or self
app.post('/api/security/revoke-sessions', authMiddleware(authManager), (req, res) => {
  const { userId } = req.body;
  const targetId = userId || req.user.id;
  
  // Only admins can revoke other users' sessions
  if (targetId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required to revoke other users' });
  }

  // Revoke all sessions
  const revokedTokens = sessionLimiter.revokeAll(targetId);
  jwtBlacklist.revokeAllForUser(targetId);
  
  securityAudit.logSecurity('sessions_revoked', `All sessions revoked for user: ${targetId} by ${req.user.id}`, req.ip, 'high');
  
  res.json({ 
    success: true, 
    revokedSessions: revokedTokens.length,
    message: `All sessions for ${targetId} have been revoked`
  });
});

// Get active sessions for current user
app.get('/api/security/sessions', authMiddleware(authManager), (req, res) => {
  const sessions = sessionLimiter.getSessions(req.user.id);
  res.json(sessions.map(s => ({
    ...s,
    tokenId: s.tokenId.substring(0, 8) + '...'  // Mask token ID
  })));
});

app.get('/api/security/status', authMiddleware(authManager), adminAuth, (req, res) => {
  res.json({
    ipAllowlist: {
      enabled: ipAllowlist.enabled,
      count: ipAllowlist.allowedIps.size
    },
    rateLimiting: true,
    securityHeaders: true,
    socketAuth: true,
    accountLockout: true,
    inputSanitization: true,
    auditLogging: true,
    corsLocked: true,
    activeLockouts: [...accountLockout.attempts.entries()]
      .filter(([k]) => accountLockout.isLocked(k)).length,
    recentSecurityEvents: securityAudit.getRecent(10, { category: 'security' }).length
  });
});

// --- Security Monitoring & Health Endpoints ---

// System health metrics (security-focused)
app.get('/api/security/health', authMiddleware(authManager), adminAuth, (req, res) => {
  const metrics = securityMonitor.getHealthMetrics({
    activeLockouts: [...accountLockout.attempts.entries()]
      .filter(([k]) => accountLockout.isLocked(k)).length,
    blacklistedTokens: jwtBlacklist.size,
    auditLogSize: securityAudit.events.length
  });
  res.json(metrics);
});

// Security alerts
app.get('/api/security/alerts', authMiddleware(authManager), adminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(securityMonitor.getAlerts(limit));
});

// Security self-check (re-run on demand)
app.get('/api/security/selfcheck', authMiddleware(authManager), adminAuth, (req, res) => {
  const result = startupSecurityCheck();
  res.json(result);
});

// Language API Routes
app.get('/api/languages', authMiddleware(authManager), (req, res) => {
  res.json(languageSupport.listLanguages());
});

app.post('/api/languages/detect', authMiddleware(authManager), (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text required' });
  }
  const detected = languageSupport.detectLanguage(text);
  const info = languageSupport.getLanguageInfo(detected);
  const isEmergency = languageSupport.isEmergency(text);
  res.json({
    code: detected,
    ...info,
    isEmergency
  });
});

app.get('/api/languages/:code/greeting', authMiddleware(authManager), (req, res) => {
  const greeting = languageSupport.getGreeting(req.params.code);
  res.json({ greeting, language: req.params.code });
});

app.get('/api/languages/:code/emergency-phrases', authMiddleware(authManager), (req, res) => {
  const phrases = languageSupport.getEmergencyPhrases(req.params.code);
  res.json({ phrases, language: req.params.code });
});

// adminAuth defined earlier (before encryption routes)

// User management
app.get('/api/admin/users', authMiddleware(authManager), adminAuth, (req, res) => {
  res.json(adminSystem.listUsers());
});

app.post('/api/admin/users', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const user = await adminSystem.createUser(req.body);
    await adminSystem.logAction(req.user.id, 'user.create', { targetUser: user.username });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/users/:id', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const user = await adminSystem.updateUser(req.params.id, req.body);
    await adminSystem.logAction(req.user.id, 'user.update', { targetUser: user.username });

    // Session rotation: if role or access changed, revoke all existing sessions
    // so the user must re-authenticate with updated privileges
    if (req.body.role || req.body.access) {
      const revokedTokens = sessionLimiter.revokeAll(req.params.id);
      jwtBlacklist.revokeAllForUser(req.params.id);
      for (const tokenId of revokedTokens) {
        jwtBlacklist.revoke(tokenId);
      }
      securityAudit.logSecurity(
        'session_rotation',
        `Sessions rotated for user ${req.params.id} after privilege change by ${req.user.id}`,
        req.ip,
        'high'
      );
    }

    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const user = adminSystem.getUser(req.params.id);
    await adminSystem.deleteUser(req.params.id);
    await adminSystem.logAction(req.user.id, 'user.delete', { targetUser: user?.username });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/users/:id/password', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const password = req.body.password;
    if (!password || password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters' });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase, and numeric characters' });
    }
    await adminSystem.changePassword(req.params.id, password);
    await adminSystem.logAction(req.user.id, 'user.password_change', { targetUser: req.params.id });

    // Session rotation: revoke all sessions after password change
    // Forces re-authentication with new credentials
    const revokedTokens = sessionLimiter.revokeAll(req.params.id);
    jwtBlacklist.revokeAllForUser(req.params.id);
    for (const tokenId of revokedTokens) {
      jwtBlacklist.revoke(tokenId);
    }
    securityAudit.logSecurity(
      'session_rotation',
      `Sessions rotated for user ${req.params.id} after password change by ${req.user.id}`,
      req.ip,
      'high'
    );

    res.json({ success: true, sessionsRevoked: revokedTokens.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Role management
app.get('/api/admin/roles', authMiddleware(authManager), adminAuth, (req, res) => {
  res.json(adminSystem.listRoles());
});

app.post('/api/admin/roles', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const role = await adminSystem.createRole(req.body);
    await adminSystem.logAction(req.user.id, 'role.create', { role: role.id });
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/roles/:id', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const role = await adminSystem.updateRole(req.params.id, req.body);
    await adminSystem.logAction(req.user.id, 'role.update', { role: role.id });
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/roles/:id', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    await adminSystem.deleteRole(req.params.id);
    await adminSystem.logAction(req.user.id, 'role.delete', { role: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Settings management
app.get('/api/admin/settings', authMiddleware(authManager), adminAuth, (req, res) => {
  res.json(adminSystem.getSettings());
});

app.get('/api/admin/settings/:category', authMiddleware(authManager), adminAuth, (req, res) => {
  res.json(adminSystem.getSettings(req.params.category));
});

app.put('/api/admin/settings/:category', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const settings = await adminSystem.updateSettings(req.params.category, req.body);
    await adminSystem.logAction(req.user.id, 'settings.update', { category: req.params.category });
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/settings/reset', authMiddleware(authManager), adminAuth, async (req, res) => {
  try {
    const settings = await adminSystem.resetSettings(req.body.category);
    await adminSystem.logAction(req.user.id, 'settings.reset', { category: req.body.category || 'all' });
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Audit log
app.get('/api/admin/audit', authMiddleware(authManager), adminAuth, async (req, res) => {
  const options = {
    limit: parseInt(req.query.limit) || 100,
    userId: req.query.userId,
    action: req.query.action
  };
  const logs = await adminSystem.getAuditLog(options);
  res.json(logs);
});

// ========== Mission Planner API ==========
app.get('/api/missions', authMiddleware(authManager), (req, res) => {
  res.json(missionPlanner.listMissions(req.query));
});

app.post('/api/missions', authMiddleware(authManager), (req, res) => {
  const mission = missionPlanner.createMission({ ...req.body, createdBy: req.user.id });
  io.emit('mission:created', { id: mission.id, name: mission.name });
  res.json(mission);
});

app.get('/api/missions/tlp-steps', authMiddleware(authManager), (req, res) => {
  res.json(missionPlanner.getTlpSteps());
});

app.get('/api/missions/mett-tc', authMiddleware(authManager), (req, res) => {
  res.json(missionPlanner.getMettTcFramework());
});

app.get('/api/missions/:id', authMiddleware(authManager), (req, res) => {
  const mission = missionPlanner.getMission(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  res.json(mission);
});

app.put('/api/missions/:id/mett-tc/:category', authMiddleware(authManager), (req, res) => {
  try {
    const mission = missionPlanner.updateMettTc(req.params.id, req.params.category, req.body);
    io.emit('mission:updated', { id: mission.id, section: 'mett-tc' });
    res.json(mission);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/missions/:id/opord/:paragraph', authMiddleware(authManager), (req, res) => {
  try {
    const mission = missionPlanner.updateOpord(req.params.id, req.params.paragraph, req.body.section, req.body.data);
    io.emit('mission:updated', { id: mission.id, section: 'opord' });
    res.json(mission);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/missions/:id/advance-tlp', authMiddleware(authManager), (req, res) => {
  try {
    const mission = missionPlanner.advanceTlp(req.params.id);
    io.emit('mission:tlp-advanced', { id: mission.id, step: mission.currentTlpStep });
    res.json(mission);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/missions/:id/overlays', authMiddleware(authManager), (req, res) => {
  try {
    const overlay = missionPlanner.addOverlay(req.params.id, { ...req.body, createdBy: req.user.id });
    io.emit('mission:overlay-added', { missionId: req.params.id, overlay });
    res.json(overlay);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/missions/:id/overlays/:overlayId', authMiddleware(authManager), (req, res) => {
  try {
    missionPlanner.removeOverlay(req.params.id, req.params.overlayId);
    io.emit('mission:overlay-removed', { missionId: req.params.id, overlayId: req.params.overlayId });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/missions/:id/taskings', authMiddleware(authManager), (req, res) => {
  try {
    const task = missionPlanner.addTasking(req.params.id, { ...req.body, assignedBy: req.user.id });
    io.emit('tasking:assigned', task);
    res.json(task);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/missions/:id/taskings/:taskId', authMiddleware(authManager), (req, res) => {
  try {
    const task = missionPlanner.updateTaskingStatus(req.params.id, req.params.taskId, req.body.status);
    io.emit('tasking:updated', task);
    res.json(task);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/missions/:id/opord-text', authMiddleware(authManager), (req, res) => {
  try {
    const text = missionPlanner.generateOpordText(req.params.id);
    res.type('text/plain').send(text);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/missions/:id/recommendations', authMiddleware(authManager), (req, res) => {
  try {
    const mission = missionPlanner.addRecommendation(req.params.id, req.body);
    res.json(mission);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// AI auto-generate tactical overlays from OPORD
app.post('/api/missions/:id/generate-overlays', authMiddleware(authManager), async (req, res) => {
  try {
    const mission = missionPlanner.getMission(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const opordText = missionPlanner.generateOpordText(req.params.id);
    const mettTcText = JSON.stringify(mission.mettTc || {}, null, 2);
    const existingOverlays = mission.mapOverlays.map(o =>
      `${o.type}: ${o.name} at ${JSON.stringify(o.coordinates)}`
    ).join('\n');

    const Anthropic = require('@anthropic-ai/sdk');
    const { getAnthropicApiKey } = require('../scripts/get-api-key');
    const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are a tactical map overlay generator. Given an OPORD and METT-TC analysis, generate realistic tactical map overlays as JSON.

RULES:
- Generate overlays for: phase lines, objectives, friendly positions, enemy positions, routes, boundaries, obstacles, NAIs, rally points
- Use realistic coordinates near the area of operations. If coordinates are mentioned in the OPORD, use those. Otherwise generate plausible coordinates near Abuja, Nigeria (lat ~9.0, lng ~7.5) as the default operational area.
- Each overlay needs: type, name, description, coordinates
- Point types (friendly, enemy, objective, rally-point, nai): coordinates = [lat, lng]
- Line types (phase-line, boundary, route, obstacle): coordinates = [[lat, lng], [lat, lng], ...]
- Return ONLY valid JSON array, no markdown fences or explanation

Existing overlays (avoid duplicating):
${existingOverlays || 'None'}`,
      messages: [{
        role: 'user',
        content: `Generate tactical overlays for this operation:\n\n## OPORD\n${opordText}\n\n## METT-TC\n${mettTcText}`
      }]
    });

    let overlaysJson;
    try {
      const text = response.content[0].text.trim();
      // Strip markdown fences if present
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      overlaysJson = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[GENERATE OVERLAYS] Parse error:', parseErr.message);
      return res.status(500).json({ error: 'AI generated invalid overlay data' });
    }

    if (!Array.isArray(overlaysJson)) {
      return res.status(500).json({ error: 'Expected array of overlays' });
    }

    const created = [];
    for (const raw of overlaysJson) {
      if (!raw.type || !raw.name || !raw.coordinates) continue;
      try {
        const overlay = missionPlanner.addOverlay(req.params.id, {
          type: raw.type,
          name: raw.name,
          description: raw.description || '',
          coordinates: raw.coordinates,
          createdBy: 'ai-auto',
        });
        created.push(overlay);
      } catch (e) { console.error('[GENERATE OVERLAYS] Add error:', e.message); }
    }

    io.emit('mission:overlays-generated', { missionId: req.params.id, count: created.length });
    res.json({ generated: created.length, overlays: created });
  } catch (err) {
    console.error('[GENERATE OVERLAYS] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate overlays' });
  }
});

app.delete('/api/missions/:id', authMiddleware(authManager), adminAuth, (req, res) => {
  missionPlanner.deleteMission(req.params.id);
  io.emit('mission:deleted', { id: req.params.id });
  res.json({ ok: true });
});

// ========== Incident Tracking API ==========
app.get('/api/incidents', authMiddleware(authManager), (req, res) => {
  res.json(incidentTracker.list({ ...req.query, role: req.user.role }));
});

app.post('/api/incidents', authMiddleware(authManager), (req, res) => {
  const incident = incidentTracker.create({ ...req.body, reportedBy: req.user.id });
  io.emit('incident:created', { id: incident.id, title: incident.title, priority: incident.priority });
  res.json(incident);
});

app.get('/api/incidents/types', authMiddleware(authManager), (req, res) => {
  res.json({ types: incidentTracker.getTypes(), priorities: incidentTracker.getPriorityLevels() });
});

app.get('/api/incidents/:id', authMiddleware(authManager), (req, res) => {
  const incident = incidentTracker.get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.json(incident);
});

app.put('/api/incidents/:id', authMiddleware(authManager), (req, res) => {
  try {
    const incident = incidentTracker.update(req.params.id, { ...req.body, updatedBy: req.user.id });
    io.emit('incident:updated', { id: incident.id, status: incident.status });
    res.json(incident);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/incidents/:id/events', authMiddleware(authManager), (req, res) => {
  try {
    const incident = incidentTracker.addEvent(req.params.id, { ...req.body, by: req.user.id });
    io.emit('incident:event', { id: incident.id });
    res.json(incident);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/incidents/:id/aar-template', authMiddleware(authManager), (req, res) => {
  try {
    res.json(incidentTracker.generateAarTemplate(req.params.id));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/incidents/:id/aar', authMiddleware(authManager), (req, res) => {
  try {
    const incident = incidentTracker.storeAar(req.params.id, req.body);
    io.emit('incident:aar-generated', { id: incident.id });
    res.json(incident);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ========== Mission Chat API ==========
app.post('/api/missions/:id/chat', authMiddleware(authManager), async (req, res) => {
  try {
    const mission = missionPlanner.getMission(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const { message, conversationHistory } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    // Build full mission context
    const opordText = missionPlanner.generateOpordText(req.params.id);
    const mettTcText = JSON.stringify(mission.mettTc, null, 2);
    const taskingsText = mission.taskings.map(t => 
      `${t.unit} [${t.priority}/${t.status}]: ${t.tasks.join('; ')} — Purpose: ${t.purpose}`
    ).join('\n');
    const overlaysText = mission.mapOverlays.map(o =>
      `${o.type}: ${o.name} — ${o.description} (by ${o.createdBy})`
    ).join('\n');

    const systemPrompt = `You are KDT Aso, an AI military operations assistant. You are currently assisting with mission planning for "${mission.name}".

## Your Capabilities
- You have the FULL company-level OPORD and all mission data below
- You can extract subordinate unit tasks and generate platoon/squad-level OPORDs
- You follow US Army doctrine: FM 6-0, FM 5-0, ATP 5-0.1
- You produce properly formatted 5-paragraph OPORDs
- You understand METT-TC analysis and Troop Leading Procedures
- When generating a subordinate OPORD, you extract the relevant tasks from the higher OPORD and expand them with appropriate detail for that echelon

## Mission: ${mission.name}
## Status: ${mission.status} | TLP Step: ${mission.currentTlpStep}/8

## FULL OPERATIONS ORDER
${opordText}

## METT-TC ANALYSIS
${mettTcText}

## TASK ASSIGNMENTS
${taskingsText}

## MAP OVERLAYS
${overlaysText}

## Instructions
- When asked to generate a subordinate OPORD (platoon, squad), extract the relevant portions from the company OPORD above
- Expand tactical details appropriate to the subordinate echelon
- Include specific grid coordinates, timelines, and coordinating instructions
- Format as a proper 5-paragraph OPORD
- Reference phase lines, objectives, and other control measures from the company plan
- Be direct and professional. This is an operations environment.

Current time: ${new Date().toISOString()}`;

    // Build messages array with conversation history
    const messages = [];
    if (conversationHistory?.length) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const Anthropic = require('@anthropic-ai/sdk');
    const { getAnthropicApiKey } = require('../scripts/get-api-key');
    const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages,
    });

    const responseContent = response.content[0].text;

    res.json({
      role: 'assistant',
      content: responseContent,
      missionId: mission.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[MISSION CHAT] Error:', err.message);
    res.status(500).json({ error: 'Failed to process mission chat' });
  }
});

// ========== Shift Management API ==========
app.get('/api/shifts/schedules', authMiddleware(authManager), (req, res) => {
  res.json(shiftManager.listSchedules());
});

app.post('/api/shifts/schedules', authMiddleware(authManager), adminAuth, (req, res) => {
  const schedule = shiftManager.createSchedule(req.body);
  res.json(schedule);
});

app.delete('/api/shifts/schedules/:id', authMiddleware(authManager), adminAuth, (req, res) => {
  shiftManager.deleteSchedule(req.params.id);
  res.json({ ok: true });
});

app.get('/api/shifts/active', authMiddleware(authManager), (req, res) => {
  res.json(shiftManager.getActiveShifts());
});

// Start shift auto-checker after server init
shiftManager.startAutoCheck(io, () => ({
  incidents: incidentTracker.list({ status: 'open' }),
  missions: missionPlanner.listMissions({ status: 'executing' }),
  pendingTasks: [],
  alerts: [],
}));

// Global error handler — MUST be after all routes
app.use(globalErrorHandler);

// SPA catch-all - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'dist', 'index.html'));
});

module.exports = { app, io, agentRouter, standingOrders, operatorManager, alertSystem, sensorSystem, adminSystem };
