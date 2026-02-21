/**
 * KDT Aso - Memory Manager
 * Handles persistent memory for agents, sessions, and operations
 */

const fs = require('fs');
const path = require('path');

class MemoryManager {
  constructor() {
    this.memoryDir = path.join(__dirname, '..', 'memory');
    this.sessions = new Map(); // In-memory session store
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = ['agents', 'sessions', 'operational'];
    for (const dir of dirs) {
      const fullPath = path.join(this.memoryDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  // ==================== SESSION MEMORY ====================
  
  /**
   * Get or create a session
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        messages: [],
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Add a message to session history
   */
  addToSession(sessionId, role, agent, content) {
    const session = this.getSession(sessionId);
    session.messages.push({
      role,
      agent,
      content,
      timestamp: new Date().toISOString()
    });
    session.lastActivity = new Date().toISOString();
    
    // Keep last 50 messages per session
    if (session.messages.length > 50) {
      session.messages = session.messages.slice(-50);
    }
    
    return session;
  }

  /**
   * Get conversation history for an agent within a session
   */
  getSessionHistory(sessionId, agentId = null, limit = 20) {
    const session = this.getSession(sessionId);
    let messages = session.messages;
    
    if (agentId) {
      // Filter to only messages involving this agent
      messages = messages.filter(m => 
        m.role === 'operator' || m.agent === agentId
      );
    }
    
    return messages.slice(-limit);
  }

  /**
   * Format session history for Claude context
   */
  formatHistoryForContext(sessionId, agentId = null) {
    const history = this.getSessionHistory(sessionId, agentId);
    if (history.length === 0) return '';
    
    let formatted = '\n\n## Recent Conversation\n';
    for (const msg of history) {
      const role = msg.role === 'operator' ? 'Operator' : msg.agent;
      formatted += `\n${role}: ${msg.content}\n`;
    }
    return formatted;
  }

  // ==================== AGENT MEMORY ====================
  
  /**
   * Get an agent's persistent memory file path
   */
  getAgentMemoryPath(agentId) {
    return path.join(this.memoryDir, 'agents', `${agentId}.md`);
  }

  /**
   * Load an agent's persistent memory
   */
  loadAgentMemory(agentId) {
    const memPath = this.getAgentMemoryPath(agentId);
    if (fs.existsSync(memPath)) {
      return fs.readFileSync(memPath, 'utf-8');
    }
    return '';
  }

  /**
   * Save to an agent's persistent memory
   */
  saveAgentMemory(agentId, content) {
    const memPath = this.getAgentMemoryPath(agentId);
    fs.writeFileSync(memPath, content);
  }

  /**
   * Append to an agent's memory
   */
  appendAgentMemory(agentId, entry) {
    const memPath = this.getAgentMemoryPath(agentId);
    const timestamp = new Date().toISOString();
    const formatted = `\n## ${timestamp}\n${entry}\n`;
    
    fs.appendFileSync(memPath, formatted);
  }

  /**
   * Initialize agent memory file if it doesn't exist
   */
  initAgentMemory(agentId, agentName) {
    const memPath = this.getAgentMemoryPath(agentId);
    if (!fs.existsSync(memPath)) {
      const initial = `# ${agentName} — Memory Log

This file contains persistent memories and notes for the ${agentName}.

---
`;
      fs.writeFileSync(memPath, initial);
    }
  }

  // ==================== OPERATIONAL MEMORY ====================
  
  /**
   * Get today's operational log path
   */
  getOperationalLogPath(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    return path.join(this.memoryDir, 'operational', `${dateStr}.md`);
  }

  /**
   * Log an operational event
   */
  logOperationalEvent(event) {
    const logPath = this.getOperationalLogPath();
    const timestamp = new Date().toISOString();
    
    // Create file with header if it doesn't exist
    if (!fs.existsSync(logPath)) {
      const dateStr = new Date().toISOString().split('T')[0];
      const header = `# Operational Log — ${dateStr}\n\n`;
      fs.writeFileSync(logPath, header);
    }
    
    const entry = `## ${timestamp}
**Type:** ${event.type || 'general'}
**Agent:** ${event.agent || 'system'}
**Summary:** ${event.summary}
${event.details ? `**Details:** ${event.details}` : ''}

---
`;
    
    fs.appendFileSync(logPath, entry);
  }

  /**
   * Load recent operational events
   */
  loadRecentOperations(days = 1) {
    const events = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const logPath = this.getOperationalLogPath(date);
      
      if (fs.existsSync(logPath)) {
        events.push({
          date: date.toISOString().split('T')[0],
          content: fs.readFileSync(logPath, 'utf-8')
        });
      }
    }
    
    return events;
  }

  /**
   * Get operational summary for context
   */
  getOperationalContext(maxChars = 2000) {
    const recent = this.loadRecentOperations(1);
    if (recent.length === 0) return '';
    
    let context = '\n\n## Recent Operational Activity\n';
    let chars = context.length;
    
    for (const day of recent) {
      if (chars + day.content.length > maxChars) {
        // Truncate
        const available = maxChars - chars - 100;
        if (available > 0) {
          context += day.content.substring(0, available) + '\n...[truncated]';
        }
        break;
      }
      context += day.content;
      chars += day.content.length;
    }
    
    return context;
  }

  // ==================== KNOWLEDGE BASE ====================
  
  /**
   * Get knowledge base path
   */
  getKnowledgePath() {
    return path.join(this.memoryDir, 'KNOWLEDGE.md');
  }

  /**
   * Load knowledge base
   */
  loadKnowledge() {
    const kbPath = this.getKnowledgePath();
    if (fs.existsSync(kbPath)) {
      return fs.readFileSync(kbPath, 'utf-8');
    }
    return '';
  }

  /**
   * Save knowledge base
   */
  saveKnowledge(content) {
    const kbPath = this.getKnowledgePath();
    fs.writeFileSync(kbPath, content);
  }

  /**
   * Add fact to knowledge base
   */
  addKnowledge(category, fact) {
    const kbPath = this.getKnowledgePath();
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Create if doesn't exist
    if (!fs.existsSync(kbPath)) {
      const header = `# KDT Aso — Knowledge Base

Persistent facts about the operational environment.

---
`;
      fs.writeFileSync(kbPath, header);
    }
    
    const entry = `\n### ${category} (${timestamp})\n${fact}\n`;
    fs.appendFileSync(kbPath, entry);
  }
}

module.exports = MemoryManager;
