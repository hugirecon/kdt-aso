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

const languageSupport = new LanguageSupport();
const persistentMemory = new PersistentMemory('./memory');
const documentStorage = new DocumentStorage('./documents');
const backupSystem = new BackupSystem({ backupDir: './backups', dataDir: '.' });
const encryptionSystem = new EncryptionSystem({ keyDir: './config/keys' });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true, // Allow all origins temporarily
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({ origin: true, credentials: true })); // Allow all origins temporarily
app.use(express.json());
app.use(cookieParser());

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

// Auth routes (before auth middleware)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await authManager.authenticate(username, password);
  
  if (result.success) {
    res.cookie('token', result.token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }
  
  res.json(result);
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware(authManager), (req, res) => {
  res.json({ user: req.user });
});

// Apply auth middleware to protected routes
app.use('/api', authMiddleware(authManager));

// Health check endpoint (for Docker/load balancers)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    system: 'KDT Aso',
    version: '0.1.0',
    status: 'operational',
    agents: agentRouter.getAgentStatus(),
    standingOrders: standingOrders.getActiveCount()
  });
});

app.post('/api/message', async (req, res) => {
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

app.get('/api/agents', (req, res) => {
  res.json(agentRouter.getAgentStatus());
});

app.get('/api/standing-orders', (req, res) => {
  res.json(standingOrders.list());
});

// Trigger a standing order manually (for testing or manual intervention)
app.post('/api/standing-orders/trigger', async (req, res) => {
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
app.get('/api/standing-orders/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(standingOrders.getLogs(limit));
});

// Get a specific standing order
app.get('/api/standing-orders/:id', (req, res) => {
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
app.get('/api/geo/data', (req, res) => {
  res.json(geoData);
});

app.post('/api/geo/marker', (req, res) => {
  const marker = { ...req.body, id: req.body.id || `marker-${Date.now()}` };
  geoData.markers.push(marker);
  io.emit('geo:marker:add', marker);
  res.json(marker);
});

app.delete('/api/geo/marker/:id', (req, res) => {
  const { id } = req.params;
  geoData.markers = geoData.markers.filter(m => m.id !== id);
  io.emit('geo:marker:remove', id);
  res.json({ success: true });
});

app.post('/api/geo/area', (req, res) => {
  const area = { ...req.body, id: req.body.id || `area-${Date.now()}` };
  geoData.areas.push(area);
  io.emit('geo:area:add', area);
  res.json(area);
});

app.post('/api/geo/center', (req, res) => {
  const { center } = req.body;
  geoData.center = center;
  io.emit('geo:center', center);
  res.json({ success: true });
});

// Alert API Routes
app.get('/api/alerts', (req, res) => {
  const filters = {
    priority: req.query.priority,
    category: req.query.category,
    unacknowledged: req.query.unacknowledged === 'true'
  };
  res.json(alertSystem.getActive(filters));
});

app.get('/api/alerts/counts', (req, res) => {
  res.json(alertSystem.getCounts());
});

app.get('/api/alerts/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const filters = {
    priority: req.query.priority,
    category: req.query.category,
    from: req.query.from,
    to: req.query.to
  };
  res.json(alertSystem.getHistory(limit, filters));
});

app.get('/api/alerts/:id', (req, res) => {
  const alert = alertSystem.get(req.params.id);
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts', (req, res) => {
  try {
    const alert = alertSystem.create(req.body);
    res.json(alert);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const { note } = req.body;
  const userId = req.user?.id || 'unknown';
  const alert = alertSystem.acknowledge(req.params.id, userId, note);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/resolve', (req, res) => {
  const { resolution } = req.body;
  const userId = req.user?.id || 'unknown';
  const alert = alertSystem.resolve(req.params.id, userId, resolution);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/escalate', (req, res) => {
  const { reason } = req.body;
  const alert = alertSystem.escalate(req.params.id, reason || 'Manual escalation');
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/note', (req, res) => {
  const { text } = req.body;
  const userId = req.user?.id || 'unknown';
  const alert = alertSystem.addNote(req.params.id, userId, text);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

app.post('/api/alerts/:id/assign', (req, res) => {
  const { assignee } = req.body;
  const alert = alertSystem.assign(req.params.id, assignee);
  
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

// Sensor API Routes
app.get('/api/sensors', (req, res) => {
  const filters = {
    type: req.query.type,
    zone: req.query.zone,
    status: req.query.status
  };
  res.json(sensorSystem.list(filters));
});

app.get('/api/sensors/counts', (req, res) => {
  res.json(sensorSystem.getCounts());
});

app.get('/api/sensors/types', (req, res) => {
  res.json(sensorSystem.sensorTypes);
});

app.get('/api/sensors/latest', (req, res) => {
  res.json(sensorSystem.getLatestData());
});

app.get('/api/sensors/:id', (req, res) => {
  const sensor = sensorSystem.get(req.params.id);
  if (sensor) {
    res.json(sensor);
  } else {
    res.status(404).json({ error: 'Sensor not found' });
  }
});

app.get('/api/sensors/:id/data', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const data = sensorSystem.getBuffer(req.params.id, limit);
  res.json(data);
});

app.post('/api/sensors/register', (req, res) => {
  try {
    const sensor = sensorSystem.register(req.body);
    res.json(sensor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sensors/:id/ingest', (req, res) => {
  try {
    const data = sensorSystem.ingest(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/sensors/:id', (req, res) => {
  const success = sensorSystem.unregister(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Sensor not found' });
  }
});

// Geofence management
app.get('/api/geofences', (req, res) => {
  const geofences = Array.from(sensorSystem.geofences.entries()).map(([id, gf]) => ({ id, ...gf }));
  res.json(geofences);
});

app.post('/api/geofences', (req, res) => {
  const { id, ...geofence } = req.body;
  const gfId = id || `gf-${Date.now()}`;
  sensorSystem.addGeofence(gfId, geofence);
  res.json({ id: gfId, ...geofence });
});

// Watchlist management
app.post('/api/watchlist/:type', (req, res) => {
  const { type } = req.params;
  const { id, ...data } = req.body;
  sensorSystem.addToWatchlist(type, id, data);
  res.json({ success: true, type, id });
});

// Voice API Routes
app.get('/api/voice/status', (req, res) => {
  res.json({
    enabled: voiceInterface.isEnabled(),
    profiles: Object.keys(voiceInterface.voiceProfiles)
  });
});

// STT handled client-side via browser Web Speech API (no server endpoint needed)

app.post('/api/voice/speak', async (req, res) => {
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

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Dashboard connected:', socket.id);
  
  socket.on('operator:identify', (operatorId) => {
    socket.operatorId = operatorId;
    socket.join(`operator:${operatorId}`);
  });
  
  socket.on('message', async (data) => {
    const { message, language, voiceEnabled } = data;
    const operator = operatorManager.getOperator(socket.operatorId);
    const sessionId = `ws-${socket.operatorId || 'default'}-${socket.id}`;
    
    const response = await agentRouter.route(message, operator, language || 'en', sessionId);
    
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

  // Initialize time-based standing orders
  standingOrders.initializeMonitors();
});

// Memory API Routes
app.get('/api/memory/stats', (req, res) => {
  persistentMemory.getStats().then(stats => res.json(stats)).catch(err => res.status(500).json({ error: err.message }));
});

app.get('/api/memory/agent/:agentId', async (req, res) => {
  try {
    const memory = await persistentMemory.loadAgentMemory(req.params.agentId);
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memory/agent/:agentId/fact', async (req, res) => {
  try {
    const { fact, category } = req.body;
    const memory = await persistentMemory.addAgentFact(req.params.agentId, fact, category);
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/memory/operational', async (req, res) => {
  try {
    const events = await persistentMemory.getRecentOperationalContext(req.query.hours || 24);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Document API Routes
app.get('/api/documents', (req, res) => {
  const docs = documentStorage.list(req.query);
  res.json(docs);
});

app.get('/api/documents/categories', (req, res) => {
  res.json(documentStorage.getCategories());
});

app.get('/api/documents/stats', (req, res) => {
  res.json(documentStorage.getStats());
});

app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await documentStorage.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', async (req, res) => {
  try {
    const doc = await documentStorage.create(req.body);
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/documents/:id', async (req, res) => {
  try {
    const doc = await documentStorage.update(req.params.id, req.body);
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  try {
    await documentStorage.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/documents/search/:query', async (req, res) => {
  try {
    const results = await documentStorage.search(req.params.query, req.query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/template/:type', async (req, res) => {
  try {
    const content = await documentStorage.generateFromTemplate(req.params.type, req.body);
    res.json({ content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Backup API Routes
app.get('/api/backups', async (req, res) => {
  try {
    const backups = await backupSystem.listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    const backup = await backupSystem.createBackup(req.body);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/:id', async (req, res) => {
  try {
    const info = await backupSystem.getBackupInfo(req.params.id);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/:id/restore', async (req, res) => {
  try {
    const result = await backupSystem.restore(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/backups/:id', async (req, res) => {
  try {
    await backupSystem.deleteBackup(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Encryption API Routes
app.get('/api/encryption/status', (req, res) => {
  res.json(encryptionSystem.getStatus());
});

app.post('/api/encryption/session', (req, res) => {
  const { userId } = req.body;
  const sessionId = encryptionSystem.generateSessionKey(userId);
  res.json({ sessionId });
});

app.post('/api/encryption/encrypt', (req, res) => {
  try {
    const { data, sessionId } = req.body;
    const key = sessionId ? encryptionSystem.getSessionKey(sessionId) : null;
    const encrypted = encryptionSystem.encrypt(data, key);
    res.json({ encrypted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/encryption/decrypt', (req, res) => {
  try {
    const { encrypted, sessionId, parseJson } = req.body;
    const key = sessionId ? encryptionSystem.getSessionKey(sessionId) : null;
    const decrypted = encryptionSystem.decrypt(encrypted, key, parseJson);
    res.json({ decrypted });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Language API Routes
app.get('/api/languages', (req, res) => {
  res.json(languageSupport.listLanguages());
});

app.post('/api/languages/detect', (req, res) => {
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

app.get('/api/languages/:code/greeting', (req, res) => {
  const greeting = languageSupport.getGreeting(req.params.code);
  res.json({ greeting, language: req.params.code });
});

app.get('/api/languages/:code/emergency-phrases', (req, res) => {
  const phrases = languageSupport.getEmergencyPhrases(req.params.code);
  res.json({ phrases, language: req.params.code });
});

// Admin API Routes (protected)
const adminAuth = (req, res, next) => {
  // Check if user has admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

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
    await adminSystem.changePassword(req.params.id, req.body.password);
    await adminSystem.logAction(req.user.id, 'user.password_change', { targetUser: req.params.id });
    res.json({ success: true });
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

module.exports = { app, io, agentRouter, standingOrders, operatorManager, alertSystem, sensorSystem, adminSystem };
