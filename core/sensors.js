/**
 * KDT Aso - Sensor Integration System
 * Handles data from cameras, drones, trackers, motion sensors, etc.
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class SensorSystem extends EventEmitter {
  constructor() {
    super();
    this.sensors = new Map();
    this.dataBuffer = new Map();  // Buffer recent data per sensor
    this.bufferSize = 100;
    
    // Sensor types and their configurations
    this.sensorTypes = {
      camera: {
        dataFields: ['frame', 'timestamp', 'detections', 'motion'],
        triggers: ['motion_detected', 'person_detected', 'vehicle_detected', 'face_match']
      },
      drone: {
        dataFields: ['position', 'altitude', 'heading', 'battery', 'status', 'feed'],
        triggers: ['low_battery', 'geofence_breach', 'signal_lost', 'target_acquired']
      },
      gps_tracker: {
        dataFields: ['position', 'speed', 'heading', 'battery', 'timestamp'],
        triggers: ['geofence_breach', 'speed_alert', 'sos_activated', 'battery_low', 'offline']
      },
      motion_sensor: {
        dataFields: ['triggered', 'zone', 'timestamp', 'sensitivity'],
        triggers: ['motion_detected', 'zone_breach', 'tamper_alert']
      },
      environmental: {
        dataFields: ['temperature', 'humidity', 'smoke', 'gas', 'noise_level'],
        triggers: ['temperature_alert', 'smoke_detected', 'gas_leak', 'noise_alert']
      },
      access_control: {
        dataFields: ['event_type', 'credential', 'door_id', 'granted', 'timestamp'],
        triggers: ['access_denied', 'forced_entry', 'door_held_open', 'tailgating']
      },
      radio: {
        dataFields: ['frequency', 'signal_strength', 'transmission', 'timestamp'],
        triggers: ['transmission_detected', 'jamming_detected', 'unknown_frequency']
      },
      generic: {
        dataFields: ['data', 'timestamp'],
        triggers: ['alert', 'warning', 'info']
      }
    };

    // Geofences for breach detection
    this.geofences = new Map();
    
    // Watchlist for face/plate recognition
    this.watchlists = {
      faces: new Map(),
      plates: new Map(),
      devices: new Map()
    };
  }

  /**
   * Register a new sensor
   */
  register(options) {
    const {
      id = uuidv4(),
      name,
      type,
      location = null,      // { lat, lng, altitude? }
      zone = null,          // Zone/area name
      config = {},
      metadata = {}
    } = options;

    if (!this.sensorTypes[type]) {
      throw new Error(`Unknown sensor type: ${type}`);
    }

    const sensor = {
      id,
      name,
      type,
      location,
      zone,
      config,
      metadata,
      status: 'online',
      lastSeen: new Date().toISOString(),
      lastData: null,
      registeredAt: new Date().toISOString(),
      stats: {
        dataCount: 0,
        triggerCount: 0,
        errorCount: 0
      }
    };

    this.sensors.set(id, sensor);
    this.dataBuffer.set(id, []);
    
    this.emit('sensor:registered', sensor);
    return sensor;
  }

  /**
   * Unregister a sensor
   */
  unregister(sensorId) {
    const sensor = this.sensors.get(sensorId);
    if (sensor) {
      this.sensors.delete(sensorId);
      this.dataBuffer.delete(sensorId);
      this.emit('sensor:unregistered', sensor);
      return true;
    }
    return false;
  }

  /**
   * Get a sensor by ID
   */
  get(sensorId) {
    return this.sensors.get(sensorId);
  }

  /**
   * List all sensors
   */
  list(filters = {}) {
    let sensors = Array.from(this.sensors.values());

    if (filters.type) {
      sensors = sensors.filter(s => s.type === filters.type);
    }
    if (filters.zone) {
      sensors = sensors.filter(s => s.zone === filters.zone);
    }
    if (filters.status) {
      sensors = sensors.filter(s => s.status === filters.status);
    }

    return sensors;
  }

  /**
   * Get sensor counts by type and status
   */
  getCounts() {
    const sensors = Array.from(this.sensors.values());
    const byType = {};
    const byStatus = { online: 0, offline: 0, error: 0 };

    for (const sensor of sensors) {
      byType[sensor.type] = (byType[sensor.type] || 0) + 1;
      byStatus[sensor.status] = (byStatus[sensor.status] || 0) + 1;
    }

    return { total: sensors.length, byType, byStatus };
  }

  /**
   * Ingest data from a sensor
   */
  ingest(sensorId, data) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      throw new Error(`Unknown sensor: ${sensorId}`);
    }

    const timestamp = data.timestamp || new Date().toISOString();
    const dataPoint = {
      ...data,
      timestamp,
      sensorId,
      sensorType: sensor.type,
      sensorName: sensor.name,
      zone: sensor.zone
    };

    // Update sensor state
    sensor.lastSeen = timestamp;
    sensor.lastData = dataPoint;
    sensor.status = 'online';
    sensor.stats.dataCount++;

    // Buffer data
    const buffer = this.dataBuffer.get(sensorId);
    buffer.push(dataPoint);
    if (buffer.length > this.bufferSize) {
      buffer.shift();
    }

    // Emit data event
    this.emit('sensor:data', dataPoint);
    this.emit(`sensor:data:${sensor.type}`, dataPoint);

    // Process triggers
    this.processTriggers(sensor, dataPoint);

    return dataPoint;
  }

  /**
   * Process sensor data for triggers
   */
  processTriggers(sensor, data) {
    const triggers = [];

    switch (sensor.type) {
      case 'camera':
        if (data.motion) {
          triggers.push({ trigger: 'motion_detected', data });
        }
        if (data.detections?.persons?.length > 0) {
          triggers.push({ trigger: 'person_detected', data, count: data.detections.persons.length });
        }
        if (data.detections?.vehicles?.length > 0) {
          triggers.push({ trigger: 'vehicle_detected', data, count: data.detections.vehicles.length });
        }
        if (data.detections?.faces?.some(f => this.watchlists.faces.has(f.id))) {
          triggers.push({ trigger: 'face_match', data, matches: data.detections.faces.filter(f => this.watchlists.faces.has(f.id)) });
        }
        break;

      case 'drone':
        if (data.battery < 20) {
          triggers.push({ trigger: 'low_battery', data, level: data.battery });
        }
        if (data.position && this.checkGeofenceBreach(data.position, sensor.config.geofence)) {
          triggers.push({ trigger: 'geofence_breach', data });
        }
        break;

      case 'gps_tracker':
        if (data.battery < 15) {
          triggers.push({ trigger: 'battery_low', data, level: data.battery });
        }
        if (data.speed > (sensor.config.speedLimit || 150)) {
          triggers.push({ trigger: 'speed_alert', data, speed: data.speed });
        }
        if (data.sos) {
          triggers.push({ trigger: 'sos_activated', data });
        }
        if (data.position && this.checkGeofenceBreach(data.position, sensor.config.geofence)) {
          triggers.push({ trigger: 'geofence_breach', data });
        }
        break;

      case 'motion_sensor':
        if (data.triggered) {
          triggers.push({ trigger: 'motion_detected', data, zone: data.zone });
        }
        if (data.tamper) {
          triggers.push({ trigger: 'tamper_alert', data });
        }
        break;

      case 'environmental':
        if (data.smoke > (sensor.config.smokeThreshold || 50)) {
          triggers.push({ trigger: 'smoke_detected', data, level: data.smoke });
        }
        if (data.gas > (sensor.config.gasThreshold || 100)) {
          triggers.push({ trigger: 'gas_leak', data, level: data.gas });
        }
        if (data.temperature > (sensor.config.tempMax || 50) || data.temperature < (sensor.config.tempMin || 0)) {
          triggers.push({ trigger: 'temperature_alert', data, temp: data.temperature });
        }
        break;

      case 'access_control':
        if (!data.granted) {
          triggers.push({ trigger: 'access_denied', data });
        }
        if (data.event_type === 'forced') {
          triggers.push({ trigger: 'forced_entry', data });
        }
        break;

      case 'radio':
        if (data.unknown_source) {
          triggers.push({ trigger: 'unknown_frequency', data });
        }
        if (data.jamming) {
          triggers.push({ trigger: 'jamming_detected', data });
        }
        break;
    }

    // Emit triggers
    for (const trigger of triggers) {
      sensor.stats.triggerCount++;
      this.emit('sensor:trigger', {
        ...trigger,
        sensorId: sensor.id,
        sensorName: sensor.name,
        sensorType: sensor.type,
        zone: sensor.zone,
        timestamp: data.timestamp
      });
    }

    return triggers;
  }

  /**
   * Check if position breaches geofence
   */
  checkGeofenceBreach(position, geofenceId) {
    if (!geofenceId) return false;
    const geofence = this.geofences.get(geofenceId);
    if (!geofence) return false;

    // Simple circular geofence check
    if (geofence.type === 'circle') {
      const distance = this.haversineDistance(
        position.lat, position.lng,
        geofence.center.lat, geofence.center.lng
      );
      return distance > geofence.radius;
    }

    // Polygon geofence (point-in-polygon)
    if (geofence.type === 'polygon') {
      return !this.pointInPolygon(position, geofence.points);
    }

    return false;
  }

  /**
   * Haversine distance between two points (meters)
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Point in polygon check
   */
  pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      
      if (((yi > point.lng) !== (yj > point.lng)) &&
          (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Add geofence
   */
  addGeofence(id, geofence) {
    this.geofences.set(id, geofence);
    return geofence;
  }

  /**
   * Add to watchlist
   */
  addToWatchlist(type, id, data) {
    if (this.watchlists[type]) {
      this.watchlists[type].set(id, data);
    }
  }

  /**
   * Mark sensor offline
   */
  markOffline(sensorId) {
    const sensor = this.sensors.get(sensorId);
    if (sensor) {
      sensor.status = 'offline';
      this.emit('sensor:offline', sensor);
    }
  }

  /**
   * Get sensor data buffer
   */
  getBuffer(sensorId, limit = 50) {
    const buffer = this.dataBuffer.get(sensorId);
    if (!buffer) return [];
    return buffer.slice(-limit);
  }

  /**
   * Get latest data from all sensors
   */
  getLatestData() {
    const latest = {};
    for (const [id, sensor] of this.sensors) {
      if (sensor.lastData) {
        latest[id] = {
          sensor: { id, name: sensor.name, type: sensor.type, zone: sensor.zone },
          data: sensor.lastData
        };
      }
    }
    return latest;
  }
}

module.exports = SensorSystem;
