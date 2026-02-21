import React, { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'

interface Sensor {
  id: string
  name: string
  type: string
  zone: string | null
  status: 'online' | 'offline' | 'error'
  lastSeen: string
  lastData: any
  stats: {
    dataCount: number
    triggerCount: number
    errorCount: number
  }
}

interface SensorCounts {
  total: number
  byType: Record<string, number>
  byStatus: { online: number; offline: number; error: number }
}

interface SensorTrigger {
  trigger: string
  sensorId: string
  sensorName: string
  sensorType: string
  zone: string | null
  timestamp: string
  data: any
}

interface SensorsPanelProps {
  socket: Socket | null
}

const sensorIcons: Record<string, string> = {
  camera: '📷',
  drone: '🚁',
  gps_tracker: '📍',
  motion_sensor: '👁️',
  environmental: '🌡️',
  access_control: '🚪',
  radio: '📻',
  generic: '📡'
}

const SensorsPanel: React.FC<SensorsPanelProps> = ({ socket }) => {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [counts, setCounts] = useState<SensorCounts | null>(null)
  const [recentTriggers, setRecentTriggers] = useState<SensorTrigger[]>([])
  const [expanded, setExpanded] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('all')

  // Fetch sensors on mount
  useEffect(() => {
    fetchSensors()
    fetchCounts()
  }, [])

  // Listen for sensor events
  useEffect(() => {
    if (!socket) return

    socket.on('sensor:registered', (sensor: Sensor) => {
      setSensors(prev => [...prev, sensor])
      fetchCounts()
    })

    socket.on('sensor:data', (data: any) => {
      setSensors(prev => prev.map(s => 
        s.id === data.sensorId 
          ? { ...s, lastSeen: data.timestamp, lastData: data, status: 'online' as const }
          : s
      ))
    })

    socket.on('sensor:trigger', (trigger: SensorTrigger) => {
      setRecentTriggers(prev => [trigger, ...prev].slice(0, 20))
    })

    socket.on('sensor:offline', (sensor: Sensor) => {
      setSensors(prev => prev.map(s => 
        s.id === sensor.id ? { ...s, status: 'offline' as const } : s
      ))
      fetchCounts()
    })

    return () => {
      socket.off('sensor:registered')
      socket.off('sensor:data')
      socket.off('sensor:trigger')
      socket.off('sensor:offline')
    }
  }, [socket])

  const fetchSensors = async () => {
    try {
      const res = await fetch('/api/sensors', { credentials: 'include' })
      const data = await res.json()
      setSensors(data)
    } catch (err) {
      console.error('Failed to fetch sensors:', err)
    }
  }

  const fetchCounts = async () => {
    try {
      const res = await fetch('/api/sensors/counts', { credentials: 'include' })
      const data = await res.json()
      setCounts(data)
    } catch (err) {
      console.error('Failed to fetch counts:', err)
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = (now.getTime() - date.getTime()) / 1000

    if (diff < 60) return `${Math.floor(diff)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return date.toLocaleDateString()
  }

  const filteredSensors = selectedType === 'all' 
    ? sensors 
    : sensors.filter(s => s.type === selectedType)

  return (
    <div className={`sensors-panel ${expanded ? 'expanded' : ''}`}>
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <h3>📡 SENSORS</h3>
        <div className="sensor-summary">
          <span className="online">{counts?.byStatus.online || 0} online</span>
          {counts?.byStatus.offline ? (
            <span className="offline">{counts.byStatus.offline} offline</span>
          ) : null}
        </div>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="panel-content">
          {/* Type filter */}
          <div className="sensor-filters">
            <button 
              className={selectedType === 'all' ? 'active' : ''} 
              onClick={() => setSelectedType('all')}
            >
              All ({counts?.total || 0})
            </button>
            {counts?.byType && Object.entries(counts.byType).map(([type, count]) => (
              <button 
                key={type}
                className={selectedType === type ? 'active' : ''} 
                onClick={() => setSelectedType(type)}
              >
                {sensorIcons[type] || '📡'} {count}
              </button>
            ))}
          </div>

          {/* Sensor list */}
          <div className="sensor-list">
            {filteredSensors.length === 0 ? (
              <div className="empty-state">No sensors registered</div>
            ) : (
              filteredSensors.map(sensor => (
                <div key={sensor.id} className={`sensor-item ${sensor.status}`}>
                  <span className="sensor-icon">{sensorIcons[sensor.type] || '📡'}</span>
                  <div className="sensor-info">
                    <div className="sensor-name">{sensor.name}</div>
                    <div className="sensor-meta">
                      <span className="sensor-type">{sensor.type}</span>
                      {sensor.zone && <span className="sensor-zone">{sensor.zone}</span>}
                    </div>
                  </div>
                  <div className="sensor-status">
                    <span className={`status-dot ${sensor.status}`}></span>
                    <span className="last-seen">{formatTime(sensor.lastSeen)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Recent triggers */}
          {recentTriggers.length > 0 && (
            <div className="recent-triggers">
              <h4>Recent Triggers</h4>
              <div className="trigger-list">
                {recentTriggers.slice(0, 5).map((trigger, idx) => (
                  <div key={idx} className="trigger-item">
                    <span className="trigger-time">{formatTime(trigger.timestamp)}</span>
                    <span className="trigger-sensor">{trigger.sensorName}</span>
                    <span className="trigger-type">{trigger.trigger.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="sensor-actions">
            <button onClick={fetchSensors}>↻ Refresh</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SensorsPanel
