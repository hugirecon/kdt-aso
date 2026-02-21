/**
 * KDT Aso - Standing Orders Engine
 * Manages pre-authorized responses and automations
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

class StandingOrders extends EventEmitter {
  constructor() {
    super();
    this.orders = this.loadOrders();
    this.activeMonitors = new Map();
    this.logs = [];
  }

  loadOrders() {
    const ordersPath = path.join(__dirname, '..', 'config', 'standing_orders.yaml');
    if (fs.existsSync(ordersPath)) {
      const config = yaml.parse(fs.readFileSync(ordersPath, 'utf-8'));
      return config.standing_orders || {};
    }
    return {};
  }

  /**
   * Get list of all standing orders
   */
  list() {
    return Object.entries(this.orders).map(([id, order]) => ({
      id,
      trigger: order.trigger,
      authorityLevel: order.authority_level,
      actions: order.actions?.length || 0,
      active: this.activeMonitors.has(id)
    }));
  }

  /**
   * Get count of active standing orders
   */
  getActiveCount() {
    return Object.keys(this.orders).length;
  }

  /**
   * Check if a trigger should fire a standing order
   */
  checkTrigger(triggerName, context = {}) {
    for (const [orderId, order] of Object.entries(this.orders)) {
      if (order.trigger === triggerName) {
        this.log(orderId, 'triggered', context);
        this.emit('trigger', { 
          id: orderId, 
          name: orderId,
          ...order 
        }, context);
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluate if escalation is needed based on responses
   */
  requiresEscalation(order, responses) {
    if (!order.escalation) return false;
    if (order.escalation.always_notify) return true;
    
    // Check threshold conditions
    if (order.escalation.threshold) {
      // This would be expanded to parse threshold conditions
      // For now, check for keywords in responses
      const responseText = responses.map(r => r.response).join(' ').toLowerCase();
      const thresholdTerms = order.escalation.threshold.toLowerCase().split(' OR ');
      
      for (const term of thresholdTerms) {
        if (responseText.includes(term.trim())) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Escalate a standing order result
   */
  escalate(order, responses) {
    const escalation = {
      orderId: order.id,
      orderName: order.name,
      priority: order.escalation?.priority || 'high',
      reason: order.escalation?.threshold || 'Standing order escalation',
      responses,
      timestamp: new Date().toISOString(),
      requiresAcknowledgment: order.authority_level >= 4
    };

    this.log(order.id, 'escalated', escalation);
    this.emit('escalation', escalation);
    
    return escalation;
  }

  /**
   * Log standing order activity
   */
  log(orderId, action, details = {}) {
    const entry = {
      orderId,
      action,
      details,
      timestamp: new Date().toISOString()
    };
    this.logs.push(entry);
    
    // Keep logs manageable (last 1000 entries)
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }
  }

  /**
   * Get recent logs
   */
  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  /**
   * Start a time-based standing order monitor
   */
  startTimeBasedMonitor(orderId, cronExpression) {
    // Simplified time-based monitoring
    // In production, use a proper cron library
    const order = this.orders[orderId];
    if (!order) return;

    // Parse simple time triggers like "time == 0600"
    const timeMatch = order.trigger.match(/time\s*==\s*(\d{4})/);
    if (timeMatch) {
      const targetTime = timeMatch[1];
      
      const checkInterval = setInterval(() => {
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + 
                          now.getMinutes().toString().padStart(2, '0');
        
        if (currentTime === targetTime) {
          this.checkTrigger(order.trigger, { scheduledTime: targetTime });
        }
      }, 60000); // Check every minute

      this.activeMonitors.set(orderId, checkInterval);
    }
  }

  /**
   * Stop a standing order monitor
   */
  stopMonitor(orderId) {
    const monitor = this.activeMonitors.get(orderId);
    if (monitor) {
      clearInterval(monitor);
      this.activeMonitors.delete(orderId);
    }
  }

  /**
   * Initialize all time-based monitors
   */
  initializeMonitors() {
    for (const [orderId, order] of Object.entries(this.orders)) {
      if (order.trigger.includes('time ==')) {
        this.startTimeBasedMonitor(orderId, order.trigger);
      }
    }
    console.log(`Initialized ${this.activeMonitors.size} time-based standing orders`);
  }
}

module.exports = StandingOrders;
