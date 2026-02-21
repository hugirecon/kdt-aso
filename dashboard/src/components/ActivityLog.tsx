import React from 'react'

interface Activity {
  type: string
  agent: string
  summary: string
  timestamp?: string
}

interface ActivityLogProps {
  activity: Activity[]
}

const ActivityLog: React.FC<ActivityLogProps> = ({ activity }) => {
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="activity-log">
      <div className="panel-header">Activity</div>
      {activity.length === 0 ? (
        <div className="empty-state">Monitoring for activity...</div>
      ) : (
        activity.map((item, index) => (
          <div key={index} className="activity-item">
            <span className="activity-agent">{item.agent}</span>
            <div className="activity-summary">{item.summary}</div>
            {item.timestamp && (
              <div className="activity-time">{formatTime(item.timestamp)}</div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export default ActivityLog
