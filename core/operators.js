/**
 * KDT Aso - Operator Manager
 * Manages operator profiles and authentication
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

class OperatorManager {
  constructor() {
    this.operators = new Map();
    this.loadOperators();
  }

  /**
   * Load operator profiles from config
   */
  loadOperators() {
    const operatorsDir = path.join(__dirname, '..', 'config', 'operators');
    
    if (!fs.existsSync(operatorsDir)) {
      fs.mkdirSync(operatorsDir, { recursive: true });
    }

    // Load all yaml files except template
    const files = fs.readdirSync(operatorsDir)
      .filter(f => f.endsWith('.yaml') && f !== 'template.yaml');

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(operatorsDir, file), 'utf-8');
        const config = yaml.parse(content);
        if (config.operator && config.operator.id) {
          this.operators.set(config.operator.id, config.operator);
        }
      } catch (error) {
        console.error(`Error loading operator profile ${file}:`, error.message);
      }
    }

    console.log(`Loaded ${this.operators.size} operator profiles`);
  }

  /**
   * Get an operator by ID
   */
  getOperator(operatorId) {
    if (!operatorId) {
      return this.getDefaultOperator();
    }
    return this.operators.get(operatorId) || this.getDefaultOperator();
  }

  /**
   * Get default operator profile
   */
  getDefaultOperator() {
    return {
      id: 'default',
      name: '',
      title: '',
      address_as: 'Operator',
      access: {
        level: 'full',
        sections: ['hero', 'operations', 'surveillance', 'geospatial', 
                   'communications', 'logistics', 'admin']
      },
      notifications: {
        preferred_channel: 'text',
        language: 'en',
        overnight_critical_only: true,
        overnight_hours: '2200-0600',
        receive_alerts: {
          critical: true,
          high: true,
          medium: true,
          low: false
        }
      },
      preferences: {
        verbose_briefs: false,
        timezone: 'Africa/Lagos'
      }
    };
  }

  /**
   * Create a new operator profile
   */
  createOperator(profile) {
    const operator = {
      ...this.getDefaultOperator(),
      ...profile
    };

    if (!operator.id) {
      throw new Error('Operator ID is required');
    }

    this.operators.set(operator.id, operator);
    this.saveOperator(operator);
    
    return operator;
  }

  /**
   * Update an operator profile
   */
  updateOperator(operatorId, updates) {
    const operator = this.operators.get(operatorId);
    if (!operator) {
      throw new Error(`Operator ${operatorId} not found`);
    }

    const updated = { ...operator, ...updates };
    this.operators.set(operatorId, updated);
    this.saveOperator(updated);

    return updated;
  }

  /**
   * Save operator profile to disk
   */
  saveOperator(operator) {
    const operatorsDir = path.join(__dirname, '..', 'config', 'operators');
    const filePath = path.join(operatorsDir, `${operator.id}.yaml`);
    
    const content = yaml.stringify({ operator });
    fs.writeFileSync(filePath, content);
  }

  /**
   * Delete an operator profile
   */
  deleteOperator(operatorId) {
    if (operatorId === 'default') {
      throw new Error('Cannot delete default operator');
    }

    this.operators.delete(operatorId);
    
    const filePath = path.join(__dirname, '..', 'config', 'operators', `${operatorId}.yaml`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * List all operators
   */
  listOperators() {
    return Array.from(this.operators.values()).map(op => ({
      id: op.id,
      name: op.name,
      title: op.title,
      access_level: op.access?.level
    }));
  }

  /**
   * Check if operator has access to a section
   */
  hasAccess(operatorId, section) {
    const operator = this.getOperator(operatorId);
    if (operator.access?.level === 'full') return true;
    return operator.access?.sections?.includes(section) || false;
  }

  /**
   * Get operator's preferred language
   */
  getLanguage(operatorId) {
    const operator = this.getOperator(operatorId);
    return operator.notifications?.language || 'en';
  }

  /**
   * Check if operator should be notified based on priority and time
   */
  shouldNotify(operatorId, priority, currentTime = new Date()) {
    const operator = this.getOperator(operatorId);
    const prefs = operator.notifications || {};
    
    // Check if alert priority is enabled
    if (!prefs.receive_alerts?.[priority]) {
      return false;
    }

    // Check overnight rules
    if (prefs.overnight_critical_only) {
      const hours = currentTime.getHours();
      const [startHour, endHour] = (prefs.overnight_hours || '2200-0600')
        .split('-')
        .map(h => parseInt(h.substring(0, 2)));
      
      const isOvernight = hours >= startHour || hours < endHour;
      
      if (isOvernight && priority !== 'critical') {
        return false;
      }
    }

    return true;
  }
}

module.exports = OperatorManager;
