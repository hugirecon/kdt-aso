import React from 'react'

interface Agent {
  name: string
  section: string
  status: string
}

interface AgentPanelProps {
  agents: Record<string, Agent>
}

const sectionOrder = ['hero', 'operations', 'geospatial', 'surveillance', 'communications', 'logistics', 'admin']
const sectionLabels: Record<string, string> = {
  hero: 'KDT Hero — Intelligence',
  operations: 'Operations',
  geospatial: 'Geospatial',
  surveillance: 'Surveillance',
  communications: 'Communications',
  logistics: 'Logistics',
  admin: 'Admin'
}

const AgentPanel: React.FC<AgentPanelProps> = ({ agents }) => {
  const agentsBySection: Record<string, [string, Agent][]> = {}
  
  Object.entries(agents).forEach(([id, agent]) => {
    const section = agent.section || 'other'
    if (!agentsBySection[section]) {
      agentsBySection[section] = []
    }
    agentsBySection[section].push([id, agent])
  })

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2)
  }

  return (
    <div className="agent-panel">
      <div className="panel-header">Staff</div>
      {sectionOrder.map(section => {
        const sectionAgents = agentsBySection[section]
        if (!sectionAgents || sectionAgents.length === 0) return null
        
        return (
          <div key={section} className="agent-section">
            <div className="agent-section-title">{sectionLabels[section] || section}</div>
            {sectionAgents.map(([id, agent]) => (
              <div key={id} className="agent-item">
                <div className={`agent-avatar ${section === 'hero' ? 'hero' : ''}`}>
                  {getInitials(agent.name)}
                </div>
                <div className="agent-info">
                  <div className="agent-name">{agent.name}</div>
                  <div className="agent-status">{agent.status}</div>
                </div>
                <div className="agent-online-dot"></div>
              </div>
            ))}
          </div>
        )
      })}
      {Object.keys(agents).length === 0 && (
        <div className="empty-state">Loading agents...</div>
      )}
    </div>
  )
}

export default AgentPanel
