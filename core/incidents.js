/**
 * KDT Aso — Incident Tracking System
 * 
 * Automated incident creation, tracking, and AAR generation.
 * Rank-filtered visibility. AI-written After Action Reports.
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const INCIDENT_TYPES = [
  'contact', 'ied', 'indirect-fire', 'medevac', 'security-breach',
  'equipment-failure', 'communications-loss', 'civilian-interaction',
  'logistics', 'personnel', 'intelligence', 'other'
];

const PRIORITY_LEVELS = ['routine', 'priority', 'immediate', 'flash'];

const VISIBILITY_BY_RANK = {
  admin: ['routine', 'priority', 'immediate', 'flash'],
  commander: ['routine', 'priority', 'immediate', 'flash'],
  officer: ['priority', 'immediate', 'flash'],
  operator: ['immediate', 'flash'],
  analyst: ['routine', 'priority', 'immediate', 'flash'],
  logistics: ['routine', 'priority'],
};

class IncidentTracker {
  constructor(opts = {}) {
    this.dataDir = opts.dataDir || path.join(__dirname, '..', 'data', 'incidents');
    this.incidents = new Map();
    this._ensureDir();
    this._loadIncidents();
  }

  _ensureDir() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _loadIncidents() {
    try {
      const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
        this.incidents.set(data.id, data);
      }
      console.log(`[INCIDENTS] Loaded ${this.incidents.size} incident(s)`);
    } catch (err) {
      console.error('[INCIDENTS] Load error:', err.message);
    }
  }

  _save(incident) {
    fs.writeFileSync(path.join(this.dataDir, `${incident.id}.json`), JSON.stringify(incident, null, 2));
  }

  // Create a new incident
  create(opts) {
    const incident = {
      id: uuidv4(),
      type: opts.type || 'other',
      priority: opts.priority || 'routine',
      title: opts.title || 'Untitled Incident',
      description: opts.description || '',
      location: opts.location || null, // { lat, lng, name }
      reportedBy: opts.reportedBy || 'system',
      assignedTo: opts.assignedTo || null,
      missionId: opts.missionId || null, // Link to mission
      status: 'open', // open | investigating | resolved | closed
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [{
        timestamp: new Date().toISOString(),
        event: 'Incident created',
        by: opts.reportedBy || 'system',
      }],
      evidence: [], // logs, files, screenshots
      casualties: opts.casualties || null,
      aar: null, // AI-generated after action report
    };

    this.incidents.set(incident.id, incident);
    this._save(incident);
    return incident;
  }

  // Get incident
  get(id) { return this.incidents.get(id); }

  // List incidents filtered by role visibility
  list(opts = {}) {
    let incidents = Array.from(this.incidents.values());
    
    // Filter by rank visibility
    if (opts.role) {
      const visible = VISIBILITY_BY_RANK[opts.role] || VISIBILITY_BY_RANK.operator;
      incidents = incidents.filter(i => visible.includes(i.priority));
    }
    if (opts.status) incidents = incidents.filter(i => i.status === opts.status);
    if (opts.type) incidents = incidents.filter(i => i.type === opts.type);
    if (opts.missionId) incidents = incidents.filter(i => i.missionId === opts.missionId);
    
    return incidents.sort((a, b) => {
      const priOrder = { flash: 0, immediate: 1, priority: 2, routine: 3 };
      if (priOrder[a.priority] !== priOrder[b.priority]) return priOrder[a.priority] - priOrder[b.priority];
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // Update incident
  update(id, updates) {
    const incident = this.incidents.get(id);
    if (!incident) throw new Error('Incident not found');

    Object.assign(incident, updates, { updatedAt: new Date().toISOString() });
    
    incident.timeline.push({
      timestamp: new Date().toISOString(),
      event: `Incident updated: ${Object.keys(updates).join(', ')}`,
      by: updates.updatedBy || 'system',
    });

    this._save(incident);
    return incident;
  }

  // Add timeline event
  addEvent(id, event) {
    const incident = this.incidents.get(id);
    if (!incident) throw new Error('Incident not found');

    incident.timeline.push({
      timestamp: new Date().toISOString(),
      event: event.description,
      by: event.by || 'system',
      data: event.data || null,
    });

    incident.updatedAt = new Date().toISOString();
    this._save(incident);
    return incident;
  }

  // Generate AI After Action Report
  // Returns the data structure for the AI to fill
  generateAarTemplate(id) {
    const incident = this.incidents.get(id);
    if (!incident) throw new Error('Incident not found');

    return {
      incidentId: id,
      title: `After Action Report: ${incident.title}`,
      incident_summary: incident,
      aar_structure: {
        executive_summary: '', // AI fills: brief overview
        timeline_of_events: incident.timeline, // Factual timeline from system
        what_was_planned: '', // From linked mission OPORD if available
        what_happened: '', // AI synthesizes from timeline + data
        what_went_right: [], // AI analysis
        what_went_wrong: [], // AI analysis
        root_causes: [], // AI analysis
        lessons_learned: [], // AI generates
        recommendations: [], // AI generates
        action_items: [], // AI generates with assignees
      }
    };
  }

  // Store completed AAR
  storeAar(id, aar) {
    const incident = this.incidents.get(id);
    if (!incident) throw new Error('Incident not found');
    incident.aar = {
      ...aar,
      generatedAt: new Date().toISOString(),
      generatedBy: 'kdt-aso-ai',
    };
    incident.updatedAt = new Date().toISOString();
    this._save(incident);
    return incident;
  }

  // Get incident types
  getTypes() { return INCIDENT_TYPES; }
  getPriorityLevels() { return PRIORITY_LEVELS; }
  getVisibilityRules() { return VISIBILITY_BY_RANK; }
}

module.exports = IncidentTracker;
