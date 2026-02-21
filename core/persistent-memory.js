/**
 * KDT Aso - Persistent Memory System
 * Stores and retrieves long-term memory for agents and operations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class PersistentMemory {
  constructor(memoryDir = './memory') {
    this.memoryDir = memoryDir;
    this.agentMemoryDir = path.join(memoryDir, 'agents');
    this.operationalMemoryDir = path.join(memoryDir, 'operational');
    this.conversationMemoryDir = path.join(memoryDir, 'conversations');
    this.knowledgeBaseDir = path.join(memoryDir, 'knowledge');
    
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    this.init();
  }

  async init() {
    // Create memory directories
    const dirs = [
      this.memoryDir,
      this.agentMemoryDir,
      this.operationalMemoryDir,
      this.conversationMemoryDir,
      this.knowledgeBaseDir
    ];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') {
          console.error(`Failed to create directory ${dir}:`, err);
        }
      }
    }
    
    console.log('Persistent memory system initialized');
  }

  // ==================== AGENT MEMORY ====================

  /**
   * Save agent memory
   */
  async saveAgentMemory(agentId, memory) {
    const filePath = path.join(this.agentMemoryDir, `${agentId}.json`);
    const data = {
      agentId,
      updatedAt: new Date().toISOString(),
      ...memory
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    this.cache.set(`agent:${agentId}`, { data, timestamp: Date.now() });
    
    return data;
  }

  /**
   * Load agent memory
   */
  async loadAgentMemory(agentId) {
    // Check cache
    const cached = this.cache.get(`agent:${agentId}`);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    const filePath = path.join(this.agentMemoryDir, `${agentId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const memory = JSON.parse(data);
      this.cache.set(`agent:${agentId}`, { data: memory, timestamp: Date.now() });
      return memory;
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Initialize empty memory
        const emptyMemory = {
          agentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          facts: [],
          relationships: [],
          preferences: {},
          notes: []
        };
        await this.saveAgentMemory(agentId, emptyMemory);
        return emptyMemory;
      }
      throw err;
    }
  }

  /**
   * Add fact to agent memory
   */
  async addAgentFact(agentId, fact, category = 'general') {
    const memory = await this.loadAgentMemory(agentId);
    memory.facts = memory.facts || [];
    memory.facts.push({
      id: crypto.randomUUID(),
      fact,
      category,
      addedAt: new Date().toISOString()
    });
    return this.saveAgentMemory(agentId, memory);
  }

  /**
   * Add note to agent memory
   */
  async addAgentNote(agentId, note, context = null) {
    const memory = await this.loadAgentMemory(agentId);
    memory.notes = memory.notes || [];
    memory.notes.push({
      id: crypto.randomUUID(),
      note,
      context,
      addedAt: new Date().toISOString()
    });
    return this.saveAgentMemory(agentId, memory);
  }

  // ==================== CONVERSATION MEMORY ====================

  /**
   * Save conversation
   */
  async saveConversation(sessionId, messages) {
    const filePath = path.join(this.conversationMemoryDir, `${sessionId}.json`);
    const data = {
      sessionId,
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return data;
  }

  /**
   * Load conversation
   */
  async loadConversation(sessionId) {
    const filePath = path.join(this.conversationMemoryDir, `${sessionId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { sessionId, messages: [] };
      }
      throw err;
    }
  }

  /**
   * Append message to conversation
   */
  async appendMessage(sessionId, role, agentId, content) {
    const conversation = await this.loadConversation(sessionId);
    conversation.messages = conversation.messages || [];
    conversation.messages.push({
      id: crypto.randomUUID(),
      role,
      agentId,
      content,
      timestamp: new Date().toISOString()
    });
    
    // Keep last 100 messages
    if (conversation.messages.length > 100) {
      conversation.messages = conversation.messages.slice(-100);
    }
    
    return this.saveConversation(sessionId, conversation.messages);
  }

  /**
   * Get conversation summary for context
   */
  async getConversationContext(sessionId, maxMessages = 20) {
    const conversation = await this.loadConversation(sessionId);
    const recentMessages = conversation.messages?.slice(-maxMessages) || [];
    
    return recentMessages.map(m => 
      `[${m.role}${m.agentId ? ` - ${m.agentId}` : ''}]: ${m.content}`
    ).join('\n');
  }

  // ==================== OPERATIONAL MEMORY ====================

  /**
   * Log operational event
   */
  async logOperationalEvent(event) {
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(this.operationalMemoryDir, `${date}.jsonl`);
    
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    };
    
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n');
    return entry;
  }

  /**
   * Get operational events for date range
   */
  async getOperationalEvents(startDate, endDate = null) {
    const events = [];
    endDate = endDate || startDate;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const filePath = path.join(this.operationalMemoryDir, `${dateStr}.jsonl`);
      
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const lines = data.trim().split('\n').filter(l => l);
        for (const line of lines) {
          events.push(JSON.parse(line));
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    
    return events;
  }

  /**
   * Get recent operational context
   */
  async getRecentOperationalContext(hours = 24, maxEvents = 50) {
    const now = new Date();
    const cutoff = new Date(now - hours * 60 * 60 * 1000);
    
    // Get today and yesterday's events
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const events = await this.getOperationalEvents(yesterday, today);
    
    // Filter by time and limit
    const recent = events
      .filter(e => new Date(e.timestamp) >= cutoff)
      .slice(-maxEvents);
    
    return recent;
  }

  // ==================== KNOWLEDGE BASE ====================

  /**
   * Add knowledge entry
   */
  async addKnowledge(category, entry) {
    const filePath = path.join(this.knowledgeBaseDir, `${category}.json`);
    
    let knowledge = { category, entries: [] };
    try {
      const data = await fs.readFile(filePath, 'utf8');
      knowledge = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    knowledge.entries.push({
      id: crypto.randomUUID(),
      ...entry,
      addedAt: new Date().toISOString()
    });
    
    knowledge.updatedAt = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(knowledge, null, 2));
    
    return knowledge;
  }

  /**
   * Get knowledge by category
   */
  async getKnowledge(category) {
    const filePath = path.join(this.knowledgeBaseDir, `${category}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { category, entries: [] };
      }
      throw err;
    }
  }

  /**
   * Search knowledge base
   */
  async searchKnowledge(query, categories = null) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Get all category files or specified ones
    let files;
    if (categories) {
      files = categories.map(c => `${c}.json`);
    } else {
      try {
        files = await fs.readdir(this.knowledgeBaseDir);
        files = files.filter(f => f.endsWith('.json'));
      } catch (err) {
        return [];
      }
    }
    
    for (const file of files) {
      const filePath = path.join(this.knowledgeBaseDir, file);
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const knowledge = JSON.parse(data);
        
        for (const entry of knowledge.entries || []) {
          const content = JSON.stringify(entry).toLowerCase();
          if (content.includes(queryLower)) {
            results.push({
              category: knowledge.category,
              ...entry
            });
          }
        }
      } catch (err) {
        continue;
      }
    }
    
    return results;
  }

  // ==================== MEMORY SUMMARY ====================

  /**
   * Generate memory summary for agent context
   */
  async generateContextSummary(agentId, sessionId, options = {}) {
    const { includeConversation = true, includeOperational = true, maxLength = 2000 } = options;
    
    let summary = [];
    
    // Agent memory
    const agentMemory = await this.loadAgentMemory(agentId);
    if (agentMemory.facts?.length > 0) {
      const recentFacts = agentMemory.facts.slice(-10);
      summary.push('## Known Facts');
      summary.push(recentFacts.map(f => `- ${f.fact}`).join('\n'));
    }
    
    if (agentMemory.notes?.length > 0) {
      const recentNotes = agentMemory.notes.slice(-5);
      summary.push('\n## Notes');
      summary.push(recentNotes.map(n => `- ${n.note}`).join('\n'));
    }
    
    // Conversation context
    if (includeConversation && sessionId) {
      const convContext = await this.getConversationContext(sessionId, 10);
      if (convContext) {
        summary.push('\n## Recent Conversation');
        summary.push(convContext);
      }
    }
    
    // Operational context
    if (includeOperational) {
      const opEvents = await this.getRecentOperationalContext(12, 10);
      if (opEvents.length > 0) {
        summary.push('\n## Recent Operations');
        summary.push(opEvents.map(e => `- [${e.type}] ${e.summary || e.description || JSON.stringify(e)}`).join('\n'));
      }
    }
    
    let result = summary.join('\n');
    
    // Truncate if too long
    if (result.length > maxLength) {
      result = result.substring(0, maxLength) + '\n...(truncated)';
    }
    
    return result;
  }

  // ==================== CLEANUP ====================

  /**
   * Clean old memory files
   */
  async cleanOldMemory(daysToKeep = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    
    let cleaned = 0;
    
    // Clean operational logs
    try {
      const files = await fs.readdir(this.operationalMemoryDir);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const dateStr = file.replace('.jsonl', '');
          if (new Date(dateStr) < cutoff) {
            await fs.unlink(path.join(this.operationalMemoryDir, file));
            cleaned++;
          }
        }
      }
    } catch (err) {
      console.error('Error cleaning operational memory:', err);
    }
    
    // Clean old conversations
    try {
      const files = await fs.readdir(this.conversationMemoryDir);
      for (const file of files) {
        const filePath = path.join(this.conversationMemoryDir, file);
        const stat = await fs.stat(filePath);
        if (stat.mtime < cutoff) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }
    } catch (err) {
      console.error('Error cleaning conversation memory:', err);
    }
    
    return { cleaned };
  }

  /**
   * Get memory statistics
   */
  async getStats() {
    const stats = {
      agents: 0,
      conversations: 0,
      operationalLogs: 0,
      knowledgeCategories: 0
    };
    
    try {
      const agentFiles = await fs.readdir(this.agentMemoryDir);
      stats.agents = agentFiles.filter(f => f.endsWith('.json')).length;
    } catch (err) {}
    
    try {
      const convFiles = await fs.readdir(this.conversationMemoryDir);
      stats.conversations = convFiles.filter(f => f.endsWith('.json')).length;
    } catch (err) {}
    
    try {
      const opFiles = await fs.readdir(this.operationalMemoryDir);
      stats.operationalLogs = opFiles.filter(f => f.endsWith('.jsonl')).length;
    } catch (err) {}
    
    try {
      const kbFiles = await fs.readdir(this.knowledgeBaseDir);
      stats.knowledgeCategories = kbFiles.filter(f => f.endsWith('.json')).length;
    } catch (err) {}
    
    return stats;
  }
}

module.exports = PersistentMemory;
