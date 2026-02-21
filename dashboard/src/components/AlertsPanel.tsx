import React, { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'

interface Alert {
  id: string
  priority: string
  priorityLevel: number
  category: string
  title: string
  message: string
  source: string
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: string
  resolved: boolean
  createdAt: string
  updatedAt: string
  escalationLevel: number
  notes: Array<{
    type: string
    user: string
    text: string
    timestamp: string
  }>
}

interface AlertCounts {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
  unacknowledged: number
}

interface AlertsPanelProps {
  socket: Socket | null
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({ socket }) => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [counts, setCounts] = useState<AlertCounts | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [filter, setFilter] = useState<string>('all')

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts()
    fetchCounts()
  }, [])

  // Listen for alert events
  useEffect(() => {
    if (!socket) return

    socket.on('alert:new', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].sort((a, b) => {
        if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }))
      fetchCounts()
    })

    socket.on('alert:updated', (alert: Alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a))
      if (selectedAlert?.id === alert.id) setSelectedAlert(alert)
      fetchCounts()
    })

    socket.on('alert:resolved', (alert: Alert) => {
      setAlerts(prev => prev.filter(a => a.id !== alert.id))
      if (selectedAlert?.id === alert.id) setSelectedAlert(null)
      fetchCounts()
    })

    socket.on('alert:escalated', (alert: Alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a).sort((a, b) => {
        if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }))
      fetchCounts()
    })

    return () => {
      socket.off('alert:new')
      socket.off('alert:updated')
      socket.off('alert:resolved')
      socket.off('alert:escalated')
    }
  }, [socket, selectedAlert])

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts', { credentials: 'include' })
      const data = await res.json()
      setAlerts(data)
    } catch (err) {
      console.error('Failed to fetch alerts:', err)
    }
  }

  const fetchCounts = async () => {
    try {
      const res = await fetch('/api/alerts/counts', { credentials: 'include' })
      const data = await res.json()
      setCounts(data)
    } catch (err) {
      console.error('Failed to fetch counts:', err)
    }
  }

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      })
    } catch (err) {
      console.error('Failed to acknowledge:', err)
    }
  }

  const handleResolve = async (alertId: string) => {
    try {
      await fetch(`/api/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resolution: 'Resolved by operator' })
      })
    } catch (err) {
      console.error('Failed to resolve:', err)
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter(a => a.priority === filter)

  const priorityColors: Record<string, string> = {
    critical: '#dc3545',
    high: '#fd7e14',
    medium: '#ffc107',
    low: '#17a2b8',
    info: '#6c757d'
  }

  return (
    <div className="alerts-panel">
      <div className="panel-header">
        <span>ACTIVE ALERTS</span>
        {counts && counts.unacknowledged > 0 && (
          <span className="unack-badge">{counts.unacknowledged}</span>
        )}
      </div>

      {/* Priority filter */}
      <div className="alert-filters">
        <button 
          className={filter === 'all' ? 'active' : ''} 
          onClick={() => setFilter('all')}
        >
          All {counts?.total || 0}
        </button>
        {counts?.critical ? (
          <button 
            className={filter === 'critical' ? 'active critical' : 'critical'} 
            onClick={() => setFilter('critical')}
          >
            {counts.critical}
          </button>
        ) : null}
        {counts?.high ? (
          <button 
            className={filter === 'high' ? 'active high' : 'high'} 
            onClick={() => setFilter('high')}
          >
            {counts.high}
          </button>
        ) : null}
      </div>

      {/* Alert list */}
      <div className="alert-list">
        {filteredAlerts.length === 0 ? (
          <div className="empty-state">No active alerts</div>
        ) : (
          filteredAlerts.map(alert => (
            <div 
              key={alert.id} 
              className={`alert-item ${alert.priority} ${!alert.acknowledged ? 'unack' : ''} ${selectedAlert?.id === alert.id ? 'selected' : ''}`}
              onClick={() => setSelectedAlert(alert)}
            >
              <div 
                className="alert-priority-bar" 
                style={{ backgroundColor: priorityColors[alert.priority] }}
              />
              <div className="alert-content">
                <div className="alert-header">
                  <span className="alert-title">{alert.title}</span>
                  <span className="alert-time">{formatTime(alert.createdAt)}</span>
                </div>
                <div className="alert-message">{alert.message}</div>
                <div className="alert-meta">
                  <span className={`priority-tag ${alert.priority}`}>
                    {alert.priority.toUpperCase()}
                  </span>
                  <span className="category-tag">{alert.category}</span>
                  {alert.escalationLevel > 0 && (
                    <span className="escalation-tag">↑{alert.escalationLevel}</span>
                  )}
                </div>
              </div>
              <div className="alert-actions">
                {!alert.acknowledged && (
                  <button 
                    className="ack-btn" 
                    onClick={(e) => { e.stopPropagation(); handleAcknowledge(alert.id); }}
                    title="Acknowledge"
                  >
                    ✓
                  </button>
                )}
                <button 
                  className="resolve-btn" 
                  onClick={(e) => { e.stopPropagation(); handleResolve(alert.id); }}
                  title="Resolve"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alert detail modal */}
      {selectedAlert && (
        <div className="alert-detail-overlay" onClick={() => setSelectedAlert(null)}>
          <div className="alert-detail" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <span className={`priority-badge ${selectedAlert.priority}`}>
                {selectedAlert.priority.toUpperCase()}
              </span>
              <button className="close-btn" onClick={() => setSelectedAlert(null)}>×</button>
            </div>
            <h3>{selectedAlert.title}</h3>
            <p className="detail-message">{selectedAlert.message}</p>
            <div className="detail-meta">
              <div><strong>Category:</strong> {selectedAlert.category}</div>
              <div><strong>Source:</strong> {selectedAlert.source}</div>
              <div><strong>Created:</strong> {formatDate(selectedAlert.createdAt)}</div>
              {selectedAlert.acknowledged && (
                <div><strong>Acknowledged:</strong> {formatDate(selectedAlert.acknowledgedAt!)}</div>
              )}
            </div>
            {selectedAlert.notes.length > 0 && (
              <div className="detail-notes">
                <h4>Activity</h4>
                {selectedAlert.notes.map((note, idx) => (
                  <div key={idx} className={`note-item ${note.type}`}>
                    <span className="note-time">{formatTime(note.timestamp)}</span>
                    <span className="note-type">{note.type}</span>
                    <span className="note-text">{note.text}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="detail-actions">
              {!selectedAlert.acknowledged && (
                <button onClick={() => handleAcknowledge(selectedAlert.id)}>
                  Acknowledge
                </button>
              )}
              <button onClick={() => handleResolve(selectedAlert.id)} className="resolve">
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AlertsPanel
