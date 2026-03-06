/**
 * KDT Aso — Automatic Shift Management
 * 
 * No manual check-ins. When a shift starts, the system
 * automatically pushes a shift briefing to the user.
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class ShiftManager {
  constructor(opts = {}) {
    this.dataDir = opts.dataDir || path.join(__dirname, '..', 'data', 'shifts');
    this.schedules = new Map();
    this.activeShifts = new Map();
    this._ensureDir();
    this._loadSchedules();
    this._checkInterval = null;
  }

  _ensureDir() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _loadSchedules() {
    const file = path.join(this.dataDir, 'schedules.json');
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        for (const s of data) this.schedules.set(s.id, s);
      } catch (err) {
        console.error('[SHIFTS] Load error:', err.message);
      }
    }
    console.log(`[SHIFTS] Loaded ${this.schedules.size} shift schedule(s)`);
  }

  _saveSchedules() {
    const file = path.join(this.dataDir, 'schedules.json');
    fs.writeFileSync(file, JSON.stringify(Array.from(this.schedules.values()), null, 2));
  }

  // Create a shift schedule
  createSchedule(opts) {
    const schedule = {
      id: uuidv4(),
      name: opts.name, // e.g., "Day Shift", "Night Watch"
      startTime: opts.startTime, // "0600" (24h format)
      endTime: opts.endTime, // "1800"
      daysOfWeek: opts.daysOfWeek || [0, 1, 2, 3, 4, 5, 6], // 0=Sun
      assignedUsers: opts.assignedUsers || [], // user IDs
      briefingTemplate: opts.briefingTemplate || null,
      active: true,
    };

    this.schedules.set(schedule.id, schedule);
    this._saveSchedules();
    return schedule;
  }

  // Start the automatic shift checker
  startAutoCheck(io, getSystemState) {
    // Check every minute
    this._checkInterval = setInterval(() => {
      this._checkShifts(io, getSystemState);
    }, 60000);
    
    // Also check immediately
    this._checkShifts(io, getSystemState);
    console.log('[SHIFTS] Auto-check started');
  }

  stop() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  }

  _checkShifts(io, getSystemState) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay();

    for (const [id, schedule] of this.schedules) {
      if (!schedule.active) continue;
      if (!schedule.daysOfWeek.includes(currentDay)) continue;
      
      // Check if this shift is starting right now (within 1 minute)
      if (currentTime === schedule.startTime && !this.activeShifts.has(id)) {
        this._startShift(id, schedule, io, getSystemState);
      }
      
      // Check if this shift is ending
      if (currentTime === schedule.endTime && this.activeShifts.has(id)) {
        this._endShift(id, schedule, io);
      }
    }
  }

  _startShift(scheduleId, schedule, io, getSystemState) {
    const state = getSystemState ? getSystemState() : {};
    
    const briefing = {
      id: uuidv4(),
      scheduleId,
      shiftName: schedule.name,
      startedAt: new Date().toISOString(),
      briefing: this._generateBriefing(schedule, state),
    };

    this.activeShifts.set(scheduleId, briefing);

    // Push to all connected clients for assigned users
    if (io) {
      io.emit('shift:start', briefing);
    }
  }

  _endShift(scheduleId, schedule, io) {
    const shift = this.activeShifts.get(scheduleId);
    if (io) {
      io.emit('shift:end', {
        scheduleId,
        shiftName: schedule.name,
        endedAt: new Date().toISOString(),
        duration: shift ? Date.now() - new Date(shift.startedAt).getTime() : 0,
      });
    }
    this.activeShifts.delete(scheduleId);
  }

  _generateBriefing(schedule, state) {
    const sections = [];
    
    sections.push(`## Shift Briefing: ${schedule.name}`);
    sections.push(`**Time:** ${new Date().toLocaleString()}`);
    sections.push('');

    // Active incidents
    if (state.incidents?.length) {
      sections.push('### Active Incidents');
      state.incidents.forEach(i => {
        sections.push(`- **[${i.priority.toUpperCase()}]** ${i.title} — ${i.status}`);
      });
      sections.push('');
    } else {
      sections.push('### Active Incidents\nNo active incidents.\n');
    }

    // Active missions
    if (state.missions?.length) {
      sections.push('### Active Missions');
      state.missions.forEach(m => {
        sections.push(`- **${m.name}** — Status: ${m.status}, TLP Step: ${m.currentTlpStep}/8`);
      });
      sections.push('');
    }

    // Pending tasks
    if (state.pendingTasks?.length) {
      sections.push('### Pending Tasks');
      state.pendingTasks.forEach(t => {
        sections.push(`- ${t.unit}: ${t.tasks.join(', ')} — ${t.status}`);
      });
      sections.push('');
    }

    // Alerts
    if (state.alerts?.length) {
      sections.push('### Recent Alerts');
      state.alerts.slice(0, 5).forEach(a => {
        sections.push(`- ${a.message}`);
      });
    }

    return sections.join('\n');
  }

  // Get active shifts
  getActiveShifts() {
    return Array.from(this.activeShifts.values());
  }

  // List schedules
  listSchedules() {
    return Array.from(this.schedules.values());
  }

  // Delete schedule
  deleteSchedule(id) {
    this.schedules.delete(id);
    this.activeShifts.delete(id);
    this._saveSchedules();
  }
}

module.exports = ShiftManager;
