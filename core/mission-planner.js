/**
 * KDT Aso — Mission Planner
 * 
 * AI-assisted mission planning following US Army doctrine:
 * - Troop Leading Procedures (TLP) 8-step process
 * - METT-TC analysis framework
 * - 5-paragraph OPORD generation
 * 
 * References: FM 6-0, FM 5-0, ATP 5-0.1
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ========== TLP Steps ==========
const TLP_STEPS = [
  {
    step: 1,
    name: 'Receive the Mission',
    description: 'Receive and analyze the higher headquarters order or mission directive.',
    prompts: [
      'What is the higher headquarters mission?',
      'What is the commander\'s intent (two levels up)?',
      'What are the specified, implied, and essential tasks?',
      'What are the constraints and limitations?',
      'What is the timeline / time available?'
    ],
    aiActions: ['Extract tasks from higher HQ order', 'Identify timeline constraints', 'Begin initial time analysis']
  },
  {
    step: 2,
    name: 'Issue a Warning Order',
    description: 'Alert subordinates to the upcoming mission to begin preparations.',
    prompts: [
      'Who are the subordinate elements that need to be notified?',
      'What is the earliest time of movement?',
      'What special equipment or preparations are needed?'
    ],
    aiActions: ['Draft warning order', 'Identify units to notify', 'Calculate preparation timeline']
  },
  {
    step: 3,
    name: 'Make a Tentative Plan',
    description: 'Develop a plan using METT-TC analysis. This is where the bulk of planning occurs.',
    prompts: [
      'Review the METT-TC analysis.',
      'What courses of action (COAs) should be considered?',
      'What is the recommended COA and why?'
    ],
    aiActions: ['Conduct METT-TC analysis', 'Develop COAs', 'Recommend optimal COA', 'Draft initial OPORD']
  },
  {
    step: 4,
    name: 'Initiate Movement',
    description: 'Begin necessary movement to position forces for the mission.',
    prompts: [
      'What movement is required before the operation?',
      'What routes will be used?',
      'What security measures are needed during movement?'
    ],
    aiActions: ['Calculate movement times', 'Identify routes on map', 'Recommend security posture']
  },
  {
    step: 5,
    name: 'Conduct Reconnaissance',
    description: 'Gather information about the terrain, enemy, and conditions.',
    prompts: [
      'What information gaps remain?',
      'What reconnaissance assets are available?',
      'What are the named areas of interest (NAIs)?'
    ],
    aiActions: ['Identify intelligence gaps', 'Recommend NAIs on map', 'Suggest recon plan']
  },
  {
    step: 6,
    name: 'Complete the Plan',
    description: 'Finalize the OPORD based on recon and updated information.',
    prompts: [
      'What changes are needed based on new information?',
      'Is the OPORD complete and ready for review?',
      'Are all annexes and overlays prepared?'
    ],
    aiActions: ['Update OPORD with recon data', 'Generate tactical overlays', 'Finalize timeline']
  },
  {
    step: 7,
    name: 'Issue the Order',
    description: 'Brief the OPORD to subordinate leaders.',
    prompts: [
      'When and where will the order be issued?',
      'Will a terrain model / sand table be used?',
      'Who needs to receive the order?'
    ],
    aiActions: ['Format OPORD for briefing', 'Push order to subordinate dashboards', 'Generate map overlay for briefing']
  },
  {
    step: 8,
    name: 'Supervise and Refine',
    description: 'Supervise preparations and refine the plan as needed.',
    prompts: [
      'What inspections or rehearsals are needed?',
      'What contingencies should be prepared?',
      'What triggers will initiate branch plans?'
    ],
    aiActions: ['Track preparation status', 'Monitor for plan changes', 'Update map in real-time']
  }
];

// ========== METT-TC Framework ==========
const METT_TC = {
  M: {
    name: 'Mission',
    description: 'What is the mission? What effect must be achieved?',
    fields: [
      { key: 'higher_mission', label: 'Higher HQ Mission', type: 'text' },
      { key: 'commander_intent', label: 'Commander\'s Intent', type: 'text' },
      { key: 'specified_tasks', label: 'Specified Tasks', type: 'list' },
      { key: 'implied_tasks', label: 'Implied Tasks', type: 'list' },
      { key: 'essential_tasks', label: 'Essential Tasks', type: 'list' },
      { key: 'constraints', label: 'Constraints', type: 'list' },
      { key: 'end_state', label: 'Desired End State', type: 'text' },
    ]
  },
  E: {
    name: 'Enemy',
    description: 'What is the enemy situation? Composition, disposition, strength, capabilities.',
    fields: [
      { key: 'composition', label: 'Enemy Composition', type: 'text' },
      { key: 'disposition', label: 'Enemy Disposition/Location', type: 'text' },
      { key: 'strength', label: 'Enemy Strength', type: 'text' },
      { key: 'capabilities', label: 'Enemy Capabilities', type: 'list' },
      { key: 'probable_coa', label: 'Enemy Most Probable COA', type: 'text' },
      { key: 'dangerous_coa', label: 'Enemy Most Dangerous COA', type: 'text' },
      { key: 'vulnerabilities', label: 'Enemy Vulnerabilities', type: 'list' },
    ]
  },
  T_terrain: {
    name: 'Terrain & Weather',
    description: 'OAKOC analysis: Observation, Avenues of Approach, Key Terrain, Obstacles, Cover & Concealment.',
    fields: [
      { key: 'observation', label: 'Observation & Fields of Fire', type: 'text' },
      { key: 'avenues', label: 'Avenues of Approach', type: 'text' },
      { key: 'key_terrain', label: 'Key Terrain', type: 'list' },
      { key: 'obstacles', label: 'Obstacles', type: 'list' },
      { key: 'cover_concealment', label: 'Cover & Concealment', type: 'text' },
      { key: 'weather', label: 'Weather Conditions', type: 'text' },
      { key: 'visibility', label: 'Visibility / Light Data', type: 'text' },
    ]
  },
  T_troops: {
    name: 'Troops Available',
    description: 'What forces and assets are available for the mission?',
    fields: [
      { key: 'organic', label: 'Organic Forces', type: 'list' },
      { key: 'attached', label: 'Attached Units', type: 'list' },
      { key: 'supporting', label: 'Supporting Assets', type: 'list' },
      { key: 'combat_power', label: 'Combat Power Assessment', type: 'text' },
      { key: 'personnel_status', label: 'Personnel Status', type: 'text' },
      { key: 'equipment_status', label: 'Equipment Status', type: 'text' },
    ]
  },
  T_time: {
    name: 'Time Available',
    description: 'How much time is available for planning, preparation, and execution?',
    fields: [
      { key: 'mission_start', label: 'Mission Start (H-Hour)', type: 'datetime' },
      { key: 'planning_time', label: 'Planning Time Available', type: 'text' },
      { key: 'prep_time', label: 'Preparation Time', type: 'text' },
      { key: 'movement_time', label: 'Movement Time Required', type: 'text' },
      { key: 'timeline', label: 'Key Timeline Events', type: 'list' },
    ]
  },
  C: {
    name: 'Civil Considerations',
    description: 'ASCOPE: Areas, Structures, Capabilities, Organizations, People, Events.',
    fields: [
      { key: 'population', label: 'Local Population', type: 'text' },
      { key: 'infrastructure', label: 'Key Infrastructure', type: 'list' },
      { key: 'organizations', label: 'Local Organizations', type: 'list' },
      { key: 'cultural', label: 'Cultural Considerations', type: 'text' },
      { key: 'media', label: 'Media / Information Environment', type: 'text' },
      { key: 'legal', label: 'Legal Considerations', type: 'text' },
    ]
  }
};

// ========== OPORD Template ==========
const OPORD_TEMPLATE = {
  classification: '',
  dtg: '',
  unit: '',
  opord_number: '',
  references: [],
  timezone: '',
  
  paragraph_1_situation: {
    area_of_operations: {
      terrain: '',
      weather: '',
    },
    enemy_forces: {
      composition: '',
      disposition: '',
      strength: '',
      capabilities: '',
      enemy_coa: '',
    },
    friendly_forces: {
      higher_mission: '',
      higher_intent: '',
      adjacent_units: '',
      supporting_units: '',
    },
    civil_considerations: '',
    attachments_detachments: [],
    assumptions: [],
  },

  paragraph_2_mission: {
    who: '',
    what: '',
    when: '',
    where: '',
    why: '',
    mission_statement: '', // Full mission statement
  },

  paragraph_3_execution: {
    commander_intent: {
      purpose: '',
      key_tasks: [],
      end_state: '',
    },
    concept_of_operations: {
      scheme_of_maneuver: '',
      fires: '',
      phases: [],
    },
    tasks_to_subordinate_units: [], // { unit, tasks[], purpose }
    coordinating_instructions: {
      timeline: [],
      rules_of_engagement: '',
      risk_mitigation: [],
      phase_lines: [], // { name, description, coordinates[] }
      objectives: [], // { name, description, coordinates }
      rally_points: [],
      actions_on_contact: '',
      actions_on_objective: '',
      consolidation_reorganization: '',
    },
  },

  paragraph_4_sustainment: {
    logistics: {
      supply: '',
      transportation: '',
      maintenance: '',
    },
    personnel: {
      medical: '',
      casualty_evacuation: '',
      personnel_replacement: '',
    },
  },

  paragraph_5_command_signal: {
    command: {
      location_commander: '',
      location_cp: '',
      succession_of_command: [],
    },
    signal: {
      primary_frequency: '',
      alternate_frequency: '',
      signals: [],
      passwords: '',
      code_words: [],
    },
  },

  annexes: [],
  overlays: [], // References to tactical map overlays
};

class MissionPlanner {
  constructor(opts = {}) {
    this.dataDir = opts.dataDir || path.join(__dirname, '..', 'data', 'missions');
    this.missions = new Map();
    this._ensureDir();
    this._loadMissions();
  }

  _ensureDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadMissions() {
    try {
      const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
        this.missions.set(data.id, data);
      }
      console.log(`[MISSION PLANNER] Loaded ${this.missions.size} mission(s)`);
    } catch (err) {
      console.error('[MISSION PLANNER] Load error:', err.message);
    }
  }

  _saveMission(mission) {
    const filePath = path.join(this.dataDir, `${mission.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(mission, null, 2));
  }

  // Create a new mission planning session
  createMission(opts = {}) {
    const mission = {
      id: uuidv4(),
      name: opts.name || 'Unnamed Mission',
      createdBy: opts.createdBy || 'unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'planning', // planning | warning-order | tentative-plan | executing | complete | aborted
      currentTlpStep: 1,
      mettTc: {},
      opord: JSON.parse(JSON.stringify(OPORD_TEMPLATE)),
      mapOverlays: [], // Tactical graphics for the map
      timeline: [],
      notes: [],
      aiRecommendations: [],
      taskings: [], // Tasks pushed to subordinates
      incidents: [], // Linked incidents
    };

    this.missions.set(mission.id, mission);
    this._saveMission(mission);
    return mission;
  }

  // Get mission by ID
  getMission(id) {
    return this.missions.get(id);
  }

  // List all missions
  listMissions(filter = {}) {
    let missions = Array.from(this.missions.values());
    if (filter.status) missions = missions.filter(m => m.status === filter.status);
    if (filter.createdBy) missions = missions.filter(m => m.createdBy === filter.createdBy);
    return missions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  // Update METT-TC analysis
  updateMettTc(missionId, category, data) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');
    
    if (!METT_TC[category]) throw new Error(`Invalid METT-TC category: ${category}`);
    
    mission.mettTc[category] = { ...mission.mettTc[category], ...data };
    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return mission;
  }

  // Update OPORD section
  updateOpord(missionId, paragraph, section, data) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');

    const paraKey = `paragraph_${paragraph}`;
    if (!mission.opord[paraKey] && paragraph <= 5) {
      // Handle top-level OPORD fields
      if (typeof data === 'object') {
        Object.assign(mission.opord, data);
      }
    } else if (section) {
      if (!mission.opord[paraKey]) mission.opord[paraKey] = {};
      mission.opord[paraKey][section] = data;
    } else {
      mission.opord[paraKey] = data;
    }

    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return mission;
  }

  // Advance TLP step
  advanceTlp(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.currentTlpStep < 8) {
      mission.currentTlpStep++;
      mission.updatedAt = new Date().toISOString();
      
      // Update status based on TLP step
      if (mission.currentTlpStep === 2) mission.status = 'warning-order';
      if (mission.currentTlpStep === 3) mission.status = 'tentative-plan';
      if (mission.currentTlpStep >= 7) mission.status = 'executing';
      
      this._saveMission(mission);
    }
    return mission;
  }

  // Add map overlay (tactical graphic)
  addOverlay(missionId, overlay) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');

    const mapOverlay = {
      id: uuidv4(),
      type: overlay.type, // 'phase-line' | 'objective' | 'boundary' | 'route' | 'friendly' | 'enemy' | 'obstacle' | 'nai' | 'rally-point' | 'assembly-area'
      name: overlay.name,
      description: overlay.description || '',
      coordinates: overlay.coordinates, // Array of [lat, lng] or single [lat, lng]
      properties: overlay.properties || {},
      createdAt: new Date().toISOString(),
      createdBy: overlay.createdBy || 'ai',
      visible: true,
    };

    mission.mapOverlays.push(mapOverlay);
    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return mapOverlay;
  }

  // Remove overlay
  removeOverlay(missionId, overlayId) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');
    mission.mapOverlays = mission.mapOverlays.filter(o => o.id !== overlayId);
    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return mission;
  }

  // Add tasking for subordinate unit
  addTasking(missionId, tasking) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');

    const task = {
      id: uuidv4(),
      unit: tasking.unit,
      tasks: tasking.tasks || [],
      purpose: tasking.purpose || '',
      priority: tasking.priority || 'routine',
      status: 'pending', // pending | acknowledged | in-progress | complete
      assignedAt: new Date().toISOString(),
      assignedBy: tasking.assignedBy || 'ai',
      dueAt: tasking.dueAt || null,
    };

    mission.taskings.push(task);
    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return task;
  }

  // Update tasking status
  updateTaskingStatus(missionId, taskId, status) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');
    const task = mission.taskings.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');
    task.status = status;
    task.updatedAt = new Date().toISOString();
    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return task;
  }

  // Add AI recommendation
  addRecommendation(missionId, recommendation) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');

    mission.aiRecommendations.push({
      id: uuidv4(),
      type: recommendation.type, // 'coa' | 'phase-line' | 'objective' | 'route' | 'warning' | 'general'
      content: recommendation.content,
      reasoning: recommendation.reasoning || '',
      confidence: recommendation.confidence || 'medium',
      createdAt: new Date().toISOString(),
      accepted: null, // null = pending, true = accepted, false = rejected
    });

    mission.updatedAt = new Date().toISOString();
    this._saveMission(mission);
    return mission;
  }

  // Generate OPORD text from structured data
  generateOpordText(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error('Mission not found');
    const o = mission.opord;

    let text = '';
    text += `${'='.repeat(60)}\n`;
    text += `OPERATIONS ORDER ${o.opord_number || '___'}\n`;
    text += `Unit: ${o.unit || '___'}\n`;
    text += `DTG: ${o.dtg || new Date().toISOString()}\n`;
    text += `${'='.repeat(60)}\n\n`;

    // Paragraph 1: Situation
    const p1 = o.paragraph_1_situation;
    text += `1. SITUATION\n\n`;
    text += `   a. Area of Operations\n`;
    text += `      (1) Terrain: ${p1.area_of_operations?.terrain || 'TBD'}\n`;
    text += `      (2) Weather: ${p1.area_of_operations?.weather || 'TBD'}\n\n`;
    text += `   b. Enemy Forces\n`;
    text += `      (1) Composition: ${p1.enemy_forces?.composition || 'TBD'}\n`;
    text += `      (2) Disposition: ${p1.enemy_forces?.disposition || 'TBD'}\n`;
    text += `      (3) Strength: ${p1.enemy_forces?.strength || 'TBD'}\n`;
    text += `      (4) Capabilities: ${p1.enemy_forces?.capabilities || 'TBD'}\n`;
    text += `      (5) Enemy COA: ${p1.enemy_forces?.enemy_coa || 'TBD'}\n\n`;
    text += `   c. Friendly Forces\n`;
    text += `      (1) Higher Mission: ${p1.friendly_forces?.higher_mission || 'TBD'}\n`;
    text += `      (2) Higher Intent: ${p1.friendly_forces?.higher_intent || 'TBD'}\n`;
    text += `      (3) Adjacent Units: ${p1.friendly_forces?.adjacent_units || 'TBD'}\n\n`;
    text += `   d. Civil Considerations: ${p1.civil_considerations || 'TBD'}\n\n`;
    if (p1.attachments_detachments?.length) {
      text += `   e. Attachments/Detachments:\n`;
      p1.attachments_detachments.forEach(a => { text += `      - ${a}\n`; });
    }
    text += `\n`;

    // Paragraph 2: Mission
    const p2 = o.paragraph_2_mission;
    text += `2. MISSION\n\n`;
    text += `   ${p2.mission_statement || `${p2.who || '___'} ${p2.what || '___'} ${p2.when || '___'} ${p2.where || '___'} ${p2.why || '___'}`}\n\n`;

    // Paragraph 3: Execution
    const p3 = o.paragraph_3_execution;
    text += `3. EXECUTION\n\n`;
    text += `   a. Commander's Intent\n`;
    text += `      Purpose: ${p3.commander_intent?.purpose || 'TBD'}\n`;
    if (p3.commander_intent?.key_tasks?.length) {
      text += `      Key Tasks:\n`;
      p3.commander_intent.key_tasks.forEach(t => { text += `         - ${t}\n`; });
    }
    text += `      End State: ${p3.commander_intent?.end_state || 'TBD'}\n\n`;
    text += `   b. Concept of Operations\n`;
    text += `      Scheme of Maneuver: ${p3.concept_of_operations?.scheme_of_maneuver || 'TBD'}\n`;
    if (p3.concept_of_operations?.phases?.length) {
      text += `      Phases:\n`;
      p3.concept_of_operations.phases.forEach((ph, i) => {
        text += `         Phase ${i + 1}: ${ph.name} — ${ph.description}\n`;
      });
    }
    text += `\n`;
    if (p3.tasks_to_subordinate_units?.length) {
      text += `   c. Tasks to Subordinate Units\n`;
      p3.tasks_to_subordinate_units.forEach(t => {
        text += `      ${t.unit}:\n`;
        t.tasks.forEach(task => { text += `         - ${task}\n`; });
        if (t.purpose) text += `         Purpose: ${t.purpose}\n`;
      });
      text += `\n`;
    }
    text += `   d. Coordinating Instructions\n`;
    const ci = p3.coordinating_instructions;
    if (ci?.timeline?.length) {
      text += `      Timeline:\n`;
      ci.timeline.forEach(t => { text += `         ${t.time}: ${t.event}\n`; });
    }
    if (ci?.rules_of_engagement) text += `      ROE: ${ci.rules_of_engagement}\n`;
    if (ci?.phase_lines?.length) {
      text += `      Phase Lines:\n`;
      ci.phase_lines.forEach(pl => { text += `         PL ${pl.name}: ${pl.description}\n`; });
    }
    if (ci?.objectives?.length) {
      text += `      Objectives:\n`;
      ci.objectives.forEach(obj => { text += `         OBJ ${obj.name}: ${obj.description}\n`; });
    }
    text += `\n`;

    // Paragraph 4: Sustainment
    const p4 = o.paragraph_4_sustainment;
    text += `4. SUSTAINMENT\n\n`;
    text += `   a. Logistics\n`;
    text += `      Supply: ${p4.logistics?.supply || 'TBD'}\n`;
    text += `      Transportation: ${p4.logistics?.transportation || 'TBD'}\n`;
    text += `      Maintenance: ${p4.logistics?.maintenance || 'TBD'}\n\n`;
    text += `   b. Personnel\n`;
    text += `      Medical: ${p4.personnel?.medical || 'TBD'}\n`;
    text += `      CASEVAC: ${p4.personnel?.casualty_evacuation || 'TBD'}\n\n`;

    // Paragraph 5: Command and Signal
    const p5 = o.paragraph_5_command_signal;
    text += `5. COMMAND AND SIGNAL\n\n`;
    text += `   a. Command\n`;
    text += `      Commander Location: ${p5.command?.location_commander || 'TBD'}\n`;
    text += `      CP Location: ${p5.command?.location_cp || 'TBD'}\n`;
    if (p5.command?.succession_of_command?.length) {
      text += `      Succession: ${p5.command.succession_of_command.join(' → ')}\n`;
    }
    text += `\n`;
    text += `   b. Signal\n`;
    text += `      Primary: ${p5.signal?.primary_frequency || 'TBD'}\n`;
    text += `      Alternate: ${p5.signal?.alternate_frequency || 'TBD'}\n`;
    if (p5.signal?.code_words?.length) {
      text += `      Code Words:\n`;
      p5.signal.code_words.forEach(cw => { text += `         ${cw.word}: ${cw.meaning}\n`; });
    }
    text += `\n${'='.repeat(60)}\n`;

    return text;
  }

  // Delete mission
  deleteMission(id) {
    const filePath = path.join(this.dataDir, `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    this.missions.delete(id);
  }

  // Get TLP steps reference
  getTlpSteps() { return TLP_STEPS; }

  // Get METT-TC framework reference
  getMettTcFramework() { return METT_TC; }

  // Get OPORD template
  getOpordTemplate() { return JSON.parse(JSON.stringify(OPORD_TEMPLATE)); }
}

module.exports = MissionPlanner;
