/**
 * KDT Aso - Alert System Tests
 */

const AlertSystem = require('../core/alerts');

describe('AlertSystem', () => {
  let alertSystem;

  beforeEach(() => {
    alertSystem = new AlertSystem();
  });

  describe('create', () => {
    it('should create an alert with all properties', () => {
      const alert = alertSystem.create({
        priority: 'high',
        category: 'security',
        title: 'Test Alert',
        message: 'This is a test alert',
        source: 'test'
      });

      expect(alert.id).toBeDefined();
      expect(alert.priority).toBe('high');
      expect(alert.category).toBe('security');
      expect(alert.title).toBe('Test Alert');
      expect(alert.status).toBe('active');
      expect(alert.acknowledged).toBe(false);
    });

    it('should emit alert:created event', (done) => {
      alertSystem.on('alert:created', (alert) => {
        expect(alert.title).toBe('Event Test');
        done();
      });

      alertSystem.create({
        priority: 'low',
        category: 'system',
        title: 'Event Test',
        message: 'Testing event emission'
      });
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge an alert', () => {
      const alert = alertSystem.create({
        priority: 'medium',
        category: 'operational',
        title: 'Ack Test',
        message: 'Test'
      });

      const acked = alertSystem.acknowledge(alert.id, 'test-user');
      expect(acked.acknowledged).toBe(true);
      expect(acked.acknowledgedBy).toBe('test-user');
      expect(acked.acknowledgedAt).toBeDefined();
    });

    it('should return null for non-existent alert', () => {
      const result = alertSystem.acknowledge('non-existent-id', 'user');
      expect(result).toBeNull();
    });
  });

  describe('resolve', () => {
    it('should resolve an alert', () => {
      const alert = alertSystem.create({
        priority: 'high',
        category: 'security',
        title: 'Resolve Test',
        message: 'Test'
      });

      const resolved = alertSystem.resolve(alert.id, 'resolver', 'Fixed');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedBy).toBe('resolver');
      expect(resolved.resolution).toBe('Fixed');
    });
  });

  describe('escalate', () => {
    it('should escalate alert priority', () => {
      const alert = alertSystem.create({
        priority: 'medium',
        category: 'operational',
        title: 'Escalate Test',
        message: 'Test'
      });

      const escalated = alertSystem.escalate(alert.id, 'admin', 'Too slow');
      expect(escalated.priority).toBe('high');
      expect(escalated.escalationHistory.length).toBe(1);
    });

    it('should not escalate critical alerts further', () => {
      const alert = alertSystem.create({
        priority: 'critical',
        category: 'security',
        title: 'Critical Test',
        message: 'Test'
      });

      const result = alertSystem.escalate(alert.id, 'admin');
      // Still critical, no change
      expect(result.priority).toBe('critical');
    });
  });

  describe('helper methods', () => {
    it('security() should create security alert', () => {
      const alert = alertSystem.security('Security Test', 'Message', 'high');
      expect(alert.category).toBe('security');
      expect(alert.priority).toBe('high');
    });

    it('intelligence() should create intelligence alert', () => {
      const alert = alertSystem.intelligence('Intel Test', 'Message');
      expect(alert.category).toBe('intelligence');
    });

    it('system() should create system alert', () => {
      const alert = alertSystem.system('System Test', 'Message');
      expect(alert.category).toBe('system');
    });
  });

  describe('getCounts', () => {
    it('should return correct counts', () => {
      alertSystem.create({ priority: 'high', category: 'security', title: 'T1', message: 'M' });
      alertSystem.create({ priority: 'medium', category: 'operational', title: 'T2', message: 'M' });
      alertSystem.create({ priority: 'high', category: 'security', title: 'T3', message: 'M' });

      const counts = alertSystem.getCounts();
      expect(counts.total).toBe(3);
      expect(counts.byPriority.high).toBe(2);
      expect(counts.byPriority.medium).toBe(1);
      expect(counts.byCategory.security).toBe(2);
    });
  });
});
