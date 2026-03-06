import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api'

interface Mission {
  id: string
  name: string
  status: string
  currentTlpStep: number
  createdAt: string
}

interface MissionPlannerProps {
  socket: any
  onMissionSelect: (missionId: string | null, missionName: string | null) => void
  activeMissionId: string | null
}

const MissionPlanner: React.FC<MissionPlannerProps> = ({ socket, onMissionSelect, activeMissionId }) => {
  const [missions, setMissions] = useState<Mission[]>([])
  const [newMissionName, setNewMissionName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadMissions() }, [])

  const loadMissions = async () => {
    try {
      const res = await apiFetch('/api/missions')
      setMissions(await res.json())
    } catch {}
  }

  const createMission = async () => {
    if (!newMissionName.trim()) return
    try {
      const res = await apiFetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMissionName })
      })
      const mission = await res.json()
      setMissions(prev => [mission, ...prev])
      onMissionSelect(mission.id, mission.name)
      setNewMissionName('')
      setCreating(false)
    } catch {}
  }

  return (
    <div className="mission-planner">
      <div className="mission-planner-header">
        <h2>🎯 Missions</h2>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ New</button>
      </div>

      {creating && (
        <div className="mission-create-form">
          <input
            type="text"
            value={newMissionName}
            onChange={e => setNewMissionName(e.target.value)}
            placeholder="Mission name..."
            onKeyDown={e => e.key === 'Enter' && createMission()}
            autoFocus
          />
          <button onClick={createMission}>Create</button>
          <button onClick={() => setCreating(false)} className="btn-cancel">Cancel</button>
        </div>
      )}

      <div className="mission-list">
        {missions.length === 0 && <div className="empty-state">No missions yet.</div>}
        {missions.map(m => (
          <div
            key={m.id}
            className={`mission-card ${activeMissionId === m.id ? 'active' : ''}`}
            onClick={() => onMissionSelect(
              activeMissionId === m.id ? null : m.id,
              activeMissionId === m.id ? null : m.name
            )}
          >
            <div className="mission-card-header">
              <span className="mission-name">{m.name}</span>
              <span className={`mission-status badge-${m.status}`}>{m.status}</span>
            </div>
            <div className="mission-card-meta">
              <span>{new Date(m.createdAt).toLocaleDateString()}</span>
              {activeMissionId === m.id && <span className="mission-active-badge">ACTIVE</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MissionPlanner
