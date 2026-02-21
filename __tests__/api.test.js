/**
 * KDT Aso - API Integration Tests
 */

const request = require('supertest');

// Mock express app for testing
let app;

beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  
  // Import after setting env
  const server = require('../core/index');
  app = server.app;
});

describe('API Endpoints', () => {
  let authToken;
  let authCookie;

  describe('Health Check', () => {
    it('GET /api/health should return ok', async () => {
      const res = await request(app)
        .get('/api/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.uptime).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('POST /api/auth/login should authenticate user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin' })
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.token).toBeDefined();
      authToken = res.body.token;
      
      // Get auth cookie
      const cookies = res.headers['set-cookie'];
      if (cookies) {
        authCookie = cookies[0];
      }
    });

    it('POST /api/auth/login should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('GET /api/auth/me should return current user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie || '')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.username).toBe('admin');
    });
  });

  describe('Status', () => {
    it('GET /api/status should return system status', async () => {
      const res = await request(app)
        .get('/api/status')
        .expect(200);

      expect(res.body.system).toBe('KDT Aso');
      expect(res.body.status).toBe('operational');
    });
  });

  describe('Languages', () => {
    it('GET /api/languages should return supported languages', async () => {
      const res = await request(app)
        .get('/api/languages')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(5);
    });

    it('POST /api/languages/detect should detect language', async () => {
      const res = await request(app)
        .post('/api/languages/detect')
        .send({ text: 'Sannu, yaya kake?' })
        .expect(200);

      expect(res.body.code).toBe('ha');
      expect(res.body.name).toBe('Hausa');
    });

    it('POST /api/languages/detect should require text', async () => {
      const res = await request(app)
        .post('/api/languages/detect')
        .send({})
        .expect(400);

      expect(res.body.error).toBe('Text required');
    });
  });

  describe('Sensors', () => {
    let sensorId;

    it('POST /api/sensors/register should register sensor', async () => {
      const res = await request(app)
        .post('/api/sensors/register')
        .send({
          name: 'Test Camera',
          type: 'camera',
          zone: 'test-zone'
        })
        .expect(200);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Test Camera');
      sensorId = res.body.id;
    });

    it('GET /api/sensors should list sensors', async () => {
      const res = await request(app)
        .get('/api/sensors')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/sensors/counts should return counts', async () => {
      const res = await request(app)
        .get('/api/sensors/counts')
        .expect(200);

      expect(res.body.total).toBeDefined();
      expect(res.body.byType).toBeDefined();
      expect(res.body.byStatus).toBeDefined();
    });

    it('POST /api/sensors/:id/ingest should accept data', async () => {
      if (!sensorId) return;

      const res = await request(app)
        .post(`/api/sensors/${sensorId}/ingest`)
        .send({
          motion: true,
          timestamp: new Date().toISOString()
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('Standing Orders', () => {
    it('GET /api/standing-orders should return orders', async () => {
      const res = await request(app)
        .get('/api/standing-orders')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/standing-orders/logs should return logs', async () => {
      const res = await request(app)
        .get('/api/standing-orders/logs')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Alerts', () => {
    let alertId;

    it('POST /api/alerts should create alert', async () => {
      const res = await request(app)
        .post('/api/alerts')
        .send({
          priority: 'medium',
          category: 'system',
          title: 'Test Alert',
          message: 'This is a test alert'
        })
        .expect(200);

      expect(res.body.id).toBeDefined();
      alertId = res.body.id;
    });

    it('GET /api/alerts should list alerts', async () => {
      const res = await request(app)
        .get('/api/alerts')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/alerts/counts should return counts', async () => {
      const res = await request(app)
        .get('/api/alerts/counts')
        .expect(200);

      expect(res.body.total).toBeDefined();
    });

    it('POST /api/alerts/:id/acknowledge should acknowledge', async () => {
      if (!alertId) return;

      const res = await request(app)
        .post(`/api/alerts/${alertId}/acknowledge`)
        .send({ userId: 'test-user' })
        .expect(200);

      expect(res.body.acknowledged).toBe(true);
    });
  });
});
