/**
 * KDT Aso - Sensor System Tests
 */

const SensorSystem = require('../core/sensors');

describe('SensorSystem', () => {
  let sensorSystem;

  beforeEach(() => {
    sensorSystem = new SensorSystem();
  });

  describe('register', () => {
    it('should register a new sensor', () => {
      const sensor = sensorSystem.register({
        name: 'Camera 1',
        type: 'camera',
        zone: 'perimeter',
        location: { lat: 9.0820, lng: 7.4951 }
      });

      expect(sensor.id).toBeDefined();
      expect(sensor.name).toBe('Camera 1');
      expect(sensor.type).toBe('camera');
      expect(sensor.status).toBe('online');
    });

    it('should throw for unknown sensor type', () => {
      expect(() => {
        sensorSystem.register({
          name: 'Unknown',
          type: 'unknown_type'
        });
      }).toThrow('Unknown sensor type');
    });
  });

  describe('ingest', () => {
    it('should ingest data from a sensor', () => {
      const sensor = sensorSystem.register({
        name: 'Motion 1',
        type: 'motion_sensor',
        zone: 'entrance'
      });

      const data = sensorSystem.ingest(sensor.id, {
        triggered: true,
        zone: 'entrance'
      });

      expect(data.sensorId).toBe(sensor.id);
      expect(data.triggered).toBe(true);
    });

    it('should throw for unknown sensor', () => {
      expect(() => {
        sensorSystem.ingest('non-existent', { data: 'test' });
      }).toThrow('Unknown sensor');
    });

    it('should emit trigger for motion detection', (done) => {
      const sensor = sensorSystem.register({
        name: 'Motion Test',
        type: 'motion_sensor',
        zone: 'test-zone'
      });

      sensorSystem.on('sensor:trigger', (trigger) => {
        expect(trigger.trigger).toBe('motion_detected');
        expect(trigger.sensorId).toBe(sensor.id);
        done();
      });

      sensorSystem.ingest(sensor.id, {
        triggered: true,
        zone: 'test-zone'
      });
    });
  });

  describe('list', () => {
    it('should list all sensors', () => {
      sensorSystem.register({ name: 'S1', type: 'camera' });
      sensorSystem.register({ name: 'S2', type: 'drone' });
      sensorSystem.register({ name: 'S3', type: 'camera' });

      const all = sensorSystem.list();
      expect(all.length).toBe(3);
    });

    it('should filter by type', () => {
      sensorSystem.register({ name: 'S1', type: 'camera' });
      sensorSystem.register({ name: 'S2', type: 'drone' });
      sensorSystem.register({ name: 'S3', type: 'camera' });

      const cameras = sensorSystem.list({ type: 'camera' });
      expect(cameras.length).toBe(2);
    });

    it('should filter by zone', () => {
      sensorSystem.register({ name: 'S1', type: 'camera', zone: 'north' });
      sensorSystem.register({ name: 'S2', type: 'camera', zone: 'south' });

      const north = sensorSystem.list({ zone: 'north' });
      expect(north.length).toBe(1);
      expect(north[0].zone).toBe('north');
    });
  });

  describe('unregister', () => {
    it('should unregister a sensor', () => {
      const sensor = sensorSystem.register({ name: 'Temp', type: 'camera' });
      
      const success = sensorSystem.unregister(sensor.id);
      expect(success).toBe(true);
      expect(sensorSystem.get(sensor.id)).toBeUndefined();
    });

    it('should return false for non-existent sensor', () => {
      const success = sensorSystem.unregister('non-existent');
      expect(success).toBe(false);
    });
  });

  describe('geofence', () => {
    it('should add and check geofence breach', () => {
      sensorSystem.addGeofence('hq-fence', {
        type: 'circle',
        center: { lat: 9.0820, lng: 7.4951 },
        radius: 1000 // meters
      });

      // Inside geofence - no breach
      const inside = sensorSystem.checkGeofenceBreach(
        { lat: 9.0820, lng: 7.4960 },
        'hq-fence'
      );
      expect(inside).toBe(false);

      // Outside geofence - breach
      const outside = sensorSystem.checkGeofenceBreach(
        { lat: 10.0000, lng: 8.0000 },
        'hq-fence'
      );
      expect(outside).toBe(true);
    });
  });

  describe('getCounts', () => {
    it('should return correct counts', () => {
      sensorSystem.register({ name: 'C1', type: 'camera' });
      sensorSystem.register({ name: 'C2', type: 'camera' });
      sensorSystem.register({ name: 'D1', type: 'drone' });

      const counts = sensorSystem.getCounts();
      expect(counts.total).toBe(3);
      expect(counts.byType.camera).toBe(2);
      expect(counts.byType.drone).toBe(1);
      expect(counts.byStatus.online).toBe(3);
    });
  });
});
