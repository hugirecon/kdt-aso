import React from 'react'

export type DashboardRole = 'admin' | 'commander' | 'officer' | 'operator' | 'analyst' | 'logistics'

interface RolePreviewProps {
  currentRole: string
  previewRole: DashboardRole | null
  onPreview: (role: DashboardRole | null) => void
}

export const ROLE_CONFIG: Record<DashboardRole, {
  label: string
  icon: string
  description: string
  panels: string[]
}> = {
  admin: {
    label: 'Administrator',
    icon: '⚙️',
    description: 'Full system access — all panels, settings, user management',
    panels: ['chat', 'map', 'alerts', 'standing-orders', 'activity', 'staff', 'sensors', 'admin', 'missions', 'incidents'],
  },
  commander: {
    label: 'Commander',
    icon: '🎖️',
    description: 'Strategic overview — map, missions, alerts, standing orders, activity',
    panels: ['chat', 'map', 'alerts', 'standing-orders', 'activity', 'missions', 'incidents'],
  },
  officer: {
    label: 'Officer',
    icon: '🔰',
    description: 'Tactical view — map, chat, alerts, standing orders, missions',
    panels: ['chat', 'map', 'alerts', 'standing-orders', 'missions', 'incidents'],
  },
  operator: {
    label: 'Operator',
    icon: '👤',
    description: 'Field view — chat with AI, map, alerts',
    panels: ['chat', 'map', 'alerts'],
  },
  analyst: {
    label: 'Analyst',
    icon: '📊',
    description: 'Intelligence view — map, activity log, alerts',
    panels: ['map', 'alerts', 'activity'],
  },
  logistics: {
    label: 'Logistics',
    icon: '📦',
    description: 'Support view — chat, alerts, activity',
    panels: ['chat', 'alerts', 'activity'],
  },
}

const RolePreview: React.FC<RolePreviewProps> = ({ currentRole, previewRole, onPreview }) => {
  const [open, setOpen] = React.useState(false)
  const roles = Object.keys(ROLE_CONFIG) as DashboardRole[]

  return (
    <div className="role-preview-container">
      <button
        className={`role-preview-btn ${previewRole ? 'previewing' : ''}`}
        onClick={() => setOpen(!open)}
        title="Preview role dashboards"
      >
        👁️ {previewRole ? `Previewing: ${ROLE_CONFIG[previewRole].label}` : 'Preview'}
      </button>

      {open && (
        <div className="role-preview-dropdown">
          <div className="role-preview-header">
            <span>Dashboard Preview</span>
            {previewRole && (
              <button className="role-preview-exit" onClick={() => { onPreview(null); setOpen(false) }}>
                ✕ Exit Preview
              </button>
            )}
          </div>
          {roles.map(role => (
            <button
              key={role}
              className={`role-preview-option ${previewRole === role ? 'active' : ''} ${currentRole === role ? 'current' : ''}`}
              onClick={() => { onPreview(role === previewRole ? null : role); setOpen(false) }}
            >
              <span className="role-icon">{ROLE_CONFIG[role].icon}</span>
              <div className="role-info">
                <span className="role-name">{ROLE_CONFIG[role].label}</span>
                <span className="role-desc">{ROLE_CONFIG[role].description}</span>
              </div>
              {currentRole === role && <span className="role-badge">You</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default RolePreview
