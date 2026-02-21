/**
 * KDT Aso - Alert System
 * Manages alerts, notifications, and escalations
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AlertSystem extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map();
    this.history = [];
    this.maxHistory = 1000;
    
    // Alert priority levels
    this.priorities = {
      critical: { level: 5, color: '#dc3545', sound: 'alarm', timeout: null },
      high: { level: 4, color: '#fd7e14', sound: 'alert', timeout: 300000 },      // 5 min auto-escalate
      medium: { level: 3, color: '#ffc107', sound: 'notification', timeout: 900000 }, // 15 min
      low: { level: 2, color: '#17a2b8', sound: 'chime', timeout: 3600000 },       // 1 hour
      info: { level: 1, color: '#6c757d', sound: null, timeout: null }
    };
    
    // Alert categories
    this.categories = [
      'security',      // Perimeter, intrusion, threat
      'operational',   // Mission, patrol, task
      'intelligence',  // Watchlist, threat indicator
      'system',        // Equipment, comms, maintenance
      'administrative' // Reports, schedules
    ];
    
    // Escalation timers
    this.escalationTimers = new Map();
  }

  /**
   * Create a new alert
   */
  create(options) {
    const {
      priority = 'medium',
      category = 'operational',
      title,
      message,
      source = 'system',
      data = {},
      requiresAck = false,
      autoEscalate = true,
      assignedTo = null
    } = options;

    const alert = {
      id: uuidv4(),
      priority,
      priorityLevel: this.priorities[priority]?.level || 3,
      category,
      title,
      message,
      source,
      data,
      requiresAck,
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      assignedTo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      escalationLevel: 0,
      notes: []
    };

    this.alerts.set(alert.id, alert);
    
    // Set up auto-escalation timer
    if (autoEscalate && this.priorities[priority]?.timeout) {
      this.setupEscalation(alert);
    }

    // Emit event
    this.emit('alert:created', alert);
    this.emit('alert', alert);

    return alert;
  }

  /**
   * Get an alert by ID
   */
  get(alertId) {
    return this.alerts.get(alertId);
  }

  /**
   * Get all active (unresolved) alerts
   */
  getActive(filters = {}) {
    let alerts = Array.from(this.alerts.values())
      .filter(a => !a.resolved);

    if (filters.priority) {
      alerts = alerts.filter(a => a.priority === filters.priority);
    }
    if (filters.category) {
      alerts = alerts.filter(a => a.category === filters.category);
    }
    if (filters.unacknowledged) {
      alerts = alerts.filter(a => !a.acknowledged);
    }

    // Sort by priority (highest first) then by date (newest first)
    return alerts.sort((a, b) => {
      if (b.priorityLevel !== a.priorityLevel) {
        return b.priorityLevel - a.priorityLevel;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /**
   * Get alert counts by priority
   */
  getCounts() {
    const active = this.getActive();
    return {
      total: active.length,
      critical: active.filter(a => a.priority === 'critical').length,
      high: active.filter(a => a.priority === 'high').length,
      medium: active.filter(a => a.priority === 'medium').length,
      low: active.filter(a => a.priority === 'low').length,
      info: active.filter(a => a.priority === 'info').length,
      unacknowledged: active.filter(a => !a.acknowledged).length
    };
  }

  /**
   * Acknowledge an alert
   */
  acknowledge(alertId, userId, note = null) {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.acknowledged = true;
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date().toISOString();
    alert.updatedAt = new Date().toISOString();

    if (note) {
      alert.notes.push({
        type: 'acknowledgment',
        user: userId,
        text: note,
        timestamp: new Date().toISOString()
      });
    }

    // Clear escalation timer
    this.clearEscalation(alertId);

    this.emit('alert:acknowledged', alert);
    return alert;
  }

  /**
   * Resolve an alert
   */
  resolve(alertId, userId, resolution = null) {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.resolved = true;
    alert.resolvedBy = userId;
    alert.resolvedAt = new Date().toISOString();
    alert.updatedAt = new Date().toISOString();

    if (resolution) {
      alert.notes.push({
        type: 'resolution',
        user: userId,
        text: resolution,
        timestamp: new Date().toISOString()
      });
    }

    // Clear escalation timer
    this.clearEscalation(alertId);

    // Move to history
    this.addToHistory(alert);
    this.alerts.delete(alertId);

    this.emit('alert:resolved', alert);
    return alert;
  }

  /**
   * Escalate an alert
   */
  escalate(alertId, reason = 'Auto-escalation due to timeout') {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    const priorities = ['info', 'low', 'medium', 'high', 'critical'];
    const currentIndex = priorities.indexOf(alert.priority);
    
    if (currentIndex < priorities.length - 1) {
      const newPriority = priorities[currentIndex + 1];
      alert.priority = newPriority;
      alert.priorityLevel = this.priorities[newPriority].level;
      alert.escalationLevel++;
      alert.updatedAt = new Date().toISOString();

      alert.notes.push({
        type: 'escalation',
        user: 'system',
        text: reason,
        timestamp: new Date().toISOString()
      });

      // Set up new escalation timer
      if (this.priorities[newPriority]?.timeout) {
        this.setupEscalation(alert);
      }

      this.emit('alert:escalated', alert);
      this.emit('alert', alert);
    }

    return alert;
  }

  /**
   * Add a note to an alert
   */
  addNote(alertId, userId, text) {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.notes.push({
      type: 'note',
      user: userId,
      text,
      timestamp: new Date().toISOString()
    });
    alert.updatedAt = new Date().toISOString();

    this.emit('alert:updated', alert);
    return alert;
  }

  /**
   * Assign alert to a user/agent
   */
  assign(alertId, assignee) {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.assignedTo = assignee;
    alert.updatedAt = new Date().toISOString();

    alert.notes.push({
      type: 'assignment',
      user: 'system',
      text: `Assigned to ${assignee}`,
      timestamp: new Date().toISOString()
    });

    this.emit('alert:assigned', alert);
    return alert;
  }

  /**
   * Setup escalation timer for an alert
   */
  setupEscalation(alert) {
    this.clearEscalation(alert.id);
    
    const timeout = this.priorities[alert.priority]?.timeout;
    if (timeout && !alert.acknowledged) {
      const timer = setTimeout(() => {
        this.escalate(alert.id);
      }, timeout);
      
      this.escalationTimers.set(alert.id, timer);
    }
  }

  /**
   * Clear escalation timer
   */
  clearEscalation(alertId) {
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }
  }

  /**
   * Add alert to history
   */
  addToHistory(alert) {
    this.history.unshift(alert);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  /**
   * Get alert history
   */
  getHistory(limit = 100, filters = {}) {
    let history = [...this.history];

    if (filters.priority) {
      history = history.filter(a => a.priority === filters.priority);
    }
    if (filters.category) {
      history = history.filter(a => a.category === filters.category);
    }
    if (filters.from) {
      history = history.filter(a => new Date(a.createdAt) >= new Date(filters.from));
    }
    if (filters.to) {
      history = history.filter(a => new Date(a.createdAt) <= new Date(filters.to));
    }

    return history.slice(0, limit);
  }

  /**
   * Create alert from standing order escalation
   */
  fromStandingOrder(escalation) {
    return this.create({
      priority: escalation.priority || 'high',
      category: 'operational',
      title: `Standing Order: ${escalation.orderName}`,
      message: escalation.reason,
      source: 'standing-orders',
      data: {
        orderId: escalation.orderId,
        responses: escalation.responses
      },
      requiresAck: escalation.requiresAcknowledgment
    });
  }

  /**
   * Create security alert
   */
  security(title, message, priority = 'high', data = {}) {
    return this.create({
      priority,
      category: 'security',
      title,
      message,
      source: 'security-system',
      data,
      requiresAck: priority === 'critical' || priority === 'high'
    });
  }

  /**
   * Create intelligence alert
   */
  intelligence(title, message, priority = 'medium', data = {}) {
    return this.create({
      priority,
      category: 'intelligence',
      title,
      message,
      source: 'kdt-hero',
      data,
      requiresAck: priority === 'critical'
    });
  }

  /**
   * Create system alert
   */
  system(title, message, priority = 'low', data = {}) {
    return this.create({
      priority,
      category: 'system',
      title,
      message,
      source: 'system',
      data,
      requiresAck: false
    });
  }
}

module.exports = AlertSystem;
