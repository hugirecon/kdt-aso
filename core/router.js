/**
 * KDT Aso - Agent Router
 * Routes messages to appropriate agents based on intent
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const MemoryManager = require('./memory');
const LanguageSupport = require('./languages');

class AgentRouter {
  constructor() {
    this.anthropic = new Anthropic();
    this.agents = this.loadAgents();
    this.systemConfig = this.loadConfig();
    this.memory = new MemoryManager();
    this.language = new LanguageSupport();
    this.initializeAgentMemories();
  }

  initializeAgentMemories() {
    for (const [agentId, agent] of Object.entries(this.agents)) {
      if (agent.type === 'agent') {
        this.memory.initAgentMemory(agentId, agent.name);
      }
    }
  }

  loadAgents() {
    const agentsDir = path.join(__dirname, '..', 'agents');
    const agents = {};

    // Load main Aso identity
    const asoPath = path.join(agentsDir, 'ASO.md');
    if (fs.existsSync(asoPath)) {
      agents['aso'] = {
        name: 'KDT Aso',
        soul: fs.readFileSync(asoPath, 'utf-8'),
        type: 'orchestrator'
      };
    }

    // Agent sections and their personnel
    const sections = {
      hero: ['intelligence_officer', 'intel_analyst', 'collection_manager'],
      operations: ['operations_officer', 'watch_officer'],
      geospatial: ['geospatial_officer'],
      surveillance: ['surveillance_officer'],
      communications: ['comms_officer'],
      logistics: ['logistics_officer'],
      admin: ['admin_officer']
    };

    for (const [section, personnel] of Object.entries(sections)) {
      for (const person of personnel) {
        const soulPath = path.join(agentsDir, section, person, 'SOUL.md');
        if (fs.existsSync(soulPath)) {
          agents[person] = {
            name: this.formatAgentName(person),
            section: section,
            soul: fs.readFileSync(soulPath, 'utf-8'),
            type: 'agent',
            status: 'online'
          };
        }
      }
    }

    console.log(`Loaded ${Object.keys(agents).length} agents`);
    return agents;
  }

  loadConfig() {
    const configPath = path.join(__dirname, '..', 'config', 'system.yaml');
    if (fs.existsSync(configPath)) {
      return yaml.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    return {};
  }

  formatAgentName(agentId) {
    return agentId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getAgentStatus() {
    const status = {};
    for (const [id, agent] of Object.entries(this.agents)) {
      if (agent.type === 'agent') {
        status[id] = {
          name: agent.name,
          section: agent.section,
          status: agent.status || 'online'
        };
      }
    }
    return status;
  }

  /**
   * Determine which agent should handle a message
   */
  async determineAgent(message, operator) {
    // Check for direct address patterns
    const directPatterns = [
      { pattern: /^(intel|intelligence|hero)/i, agent: 'intelligence_officer' },
      { pattern: /^(ops|operations)/i, agent: 'operations_officer' },
      { pattern: /^(watch)/i, agent: 'watch_officer' },
      { pattern: /^(geo|geospatial|map)/i, agent: 'geospatial_officer' },
      { pattern: /^(surv|surveillance|eyes)/i, agent: 'surveillance_officer' },
      { pattern: /^(comms|communications)/i, agent: 'comms_officer' },
      { pattern: /^(log|logistics)/i, agent: 'logistics_officer' },
      { pattern: /^(admin)/i, agent: 'admin_officer' },
      { pattern: /^(analyst)/i, agent: 'intel_analyst' },
      { pattern: /^(collection)/i, agent: 'collection_manager' }
    ];

    for (const { pattern, agent } of directPatterns) {
      if (pattern.test(message)) {
        return agent;
      }
    }

    // Use AI to determine routing for ambiguous messages
    const routingPrompt = `You are the KDT Aso routing system. Based on the message, determine which agent should handle it.

Available agents:
- intelligence_officer: Intel questions, threat assessment, profiles, OSINT, analysis requests
- operations_officer: Task management, scheduling, missions, operational planning
- watch_officer: Real-time status, current situation, what's happening now
- geospatial_officer: Maps, locations, tracking, routes, coordinates
- surveillance_officer: Cameras, drones, monitoring, visual surveillance
- comms_officer: Messages, notifications, sitreps, communications
- logistics_officer: Vehicles, equipment, supplies, assets, maintenance
- admin_officer: Reports, documentation, briefings, records

Message: "${message}"

Respond with ONLY the agent_id (e.g., "intelligence_officer"). No explanation.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [{ role: 'user', content: routingPrompt }]
    });

    const agentId = response.content[0].text.trim().toLowerCase().replace(/[^a-z_]/g, '');
    return this.agents[agentId] ? agentId : 'watch_officer'; // Default to watch
  }

  /**
   * Route a message to the appropriate agent and get response
   */
  async route(message, operator, language = 'auto', sessionId = 'default') {
    // Auto-detect language if not specified
    let detectedLanguage = language;
    if (language === 'auto' || !language) {
      detectedLanguage = this.language.detectLanguage(message);
    }
    
    // Check for emergency keywords (triggers priority handling)
    const isEmergency = this.language.isEmergency(message);
    
    const agentId = await this.determineAgent(message, operator);
    const agent = this.agents[agentId];

    if (!agent) {
      return {
        agent: 'KDT Aso',
        content: 'Unable to route request. Please try again.',
        error: true
      };
    }

    // Add operator message to session memory
    this.memory.addToSession(sessionId, 'operator', null, message);

    // Build context with memory
    const operatorContext = operator ? 
      `The Operator is ${operator.title || 'Operator'} ${operator.name || ''}. Address them as "${operator.address_as || 'Operator'}".` :
      'Address the user as "Operator".';

    // Load agent's persistent memory
    const agentMemory = this.memory.loadAgentMemory(agentId);
    const memoryContext = agentMemory ? `\n\n## Your Memory\n${agentMemory.substring(0, 1500)}` : '';

    // Load conversation history
    const conversationHistory = this.memory.formatHistoryForContext(sessionId, agentId);

    // Load operational context
    const operationalContext = this.memory.getOperationalContext(1000);

    // Get language-specific context
    const languageContext = this.language.getLanguageContext(detectedLanguage);
    const languageInfo = this.language.getLanguageInfo(detectedLanguage);
    
    const systemPrompt = `${agent.soul}

${operatorContext}
${memoryContext}
${conversationHistory}
${operationalContext}

## Language Instructions
Detected language: ${languageInfo.name} (${detectedLanguage})
${languageContext}
${isEmergency ? '\n⚠️ EMERGENCY DETECTED - Prioritize urgent response and escalate if needed.' : ''}

Current time: ${new Date().toISOString()}

IMPORTANT: You have memory of past conversations and operational events. Reference them when relevant. If the Operator asks about something you should remember, check your memory context above.`;

    // Get response from agent
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    const responseContent = response.content[0].text;

    // Add agent response to session memory
    this.memory.addToSession(sessionId, 'agent', agent.name, responseContent);

    // Log operational event
    this.memory.logOperationalEvent({
      type: 'conversation',
      agent: agent.name,
      summary: `Responded to Operator: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
      details: null
    });

    return {
      agent: agent.name,
      agentId: agentId,
      section: agent.section,
      content: responseContent,
      timestamp: new Date().toISOString(),
      language: detectedLanguage,
      languageName: languageInfo.name,
      isEmergency: isEmergency
    };
  }

  /**
   * Save important information to agent memory
   */
  async saveToAgentMemory(agentId, entry) {
    this.memory.appendAgentMemory(agentId, entry);
  }

  /**
   * Add knowledge to the knowledge base
   */
  async addKnowledge(category, fact) {
    this.memory.addKnowledge(category, fact);
  }

  /**
   * Execute a standing order across multiple agents
   */
  async executeStandingOrder(order, context) {
    const responses = [];

    for (const action of order.actions) {
      const agent = this.agents[action.agent];
      if (agent) {
        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: agent.soul,
          messages: [{
            role: 'user',
            content: `STANDING ORDER EXECUTION: ${order.name}
            
Action required: ${action.action}

Context: ${JSON.stringify(context)}

Execute this standing order action. Be concise.`
          }]
        });

        responses.push({
          agent: agent.name,
          agentId: action.agent,
          action: action.action,
          response: response.content[0].text,
          timestamp: new Date().toISOString()
        });
      }
    }

    return responses;
  }
}

module.exports = AgentRouter;
