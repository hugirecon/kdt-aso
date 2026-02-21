import React, { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { apiFetch } from '../utils/api'

interface StandingOrder {
  id: string
  trigger: string
  authorityLevel: number
  actions: number
  active: boolean
}

interface OrderLog {
  orderId: string
  action: string
  details: any
  timestamp: string
}

interface StandingOrdersPanelProps {
  socket: Socket | null
}

const StandingOrdersPanel: React.FC<StandingOrdersPanelProps> = ({ socket }) => {
  const [orders, setOrders] = useState<StandingOrder[]>([])
  const [logs, setLogs] = useState<OrderLog[]>([])
  const [expanded, setExpanded] = useState(false)
  const [testTrigger, setTestTrigger] = useState('')
  const [executing, setExecuting] = useState<string | null>(null)

  // Fetch orders on mount
  useEffect(() => {
    apiFetch('/api/standing-orders')
      .then(res => res.json())
      .then(data => setOrders(data))
      .catch(err => console.error('Failed to fetch standing orders:', err))

    apiFetch('/api/standing-orders/logs?limit=20')
      .then(res => res.json())
      .then(data => setLogs(data))
      .catch(err => console.error('Failed to fetch logs:', err))
  }, [])

  // Listen for standing order events
  useEffect(() => {
    if (!socket) return

    socket.on('standing-order:executed', (data) => {
      setLogs(prev => [{
        orderId: data.orderId,
        action: 'executed',
        details: { responses: data.responses.length },
        timestamp: data.timestamp
      }, ...prev].slice(0, 50))
      setExecuting(null)
    })

    socket.on('standing-order:error', (data) => {
      setLogs(prev => [{
        orderId: data.orderId,
        action: 'error',
        details: { error: data.error },
        timestamp: data.timestamp
      }, ...prev].slice(0, 50))
      setExecuting(null)
    })

    return () => {
      socket.off('standing-order:executed')
      socket.off('standing-order:error')
    }
  }, [socket])

  const handleTrigger = async (trigger: string) => {
    setExecuting(trigger)
    try {
      await apiFetch('/api/standing-orders/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger, context: { manual: true } })
      })
    } catch (err) {
      console.error('Failed to trigger:', err)
      setExecuting(null)
    }
  }

  const handleTestTrigger = () => {
    if (testTrigger.trim()) {
      handleTrigger(testTrigger.trim())
      setTestTrigger('')
    }
  }

  const getAuthorityLabel = (level: number) => {
    const labels: Record<number, string> = {
      1: 'Auto',
      2: 'Auto+Log',
      3: 'Auto+Notify',
      4: 'Requires Approval',
      5: 'Commander Only'
    }
    return labels[level] || `Level ${level}`
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className={`standing-orders-panel ${expanded ? 'expanded' : ''}`}>
      <div className="panel-header" onClick={() => setExpanded(!expanded)}>
        <h3>⚡ Standing Orders</h3>
        <span className="order-count">{orders.length} configured</span>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="panel-content">
          {/* Test Trigger */}
          <div className="test-trigger">
            <input
              type="text"
              placeholder="Test trigger (e.g., watchlist_entity_detected)"
              value={testTrigger}
              onChange={(e) => setTestTrigger(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTestTrigger()}
            />
            <button onClick={handleTestTrigger} disabled={!testTrigger.trim()}>
              Fire
            </button>
          </div>

          {/* Orders List */}
          <div className="orders-list">
            {orders.map(order => (
              <div key={order.id} className={`order-item ${executing === order.trigger ? 'executing' : ''}`}>
                <div className="order-header">
                  <span className="order-name">{order.id.replace(/_/g, ' ')}</span>
                  <span className={`authority-badge level-${order.authorityLevel}`}>
                    {getAuthorityLabel(order.authorityLevel)}
                  </span>
                </div>
                <div className="order-details">
                  <span className="trigger-name">{order.trigger}</span>
                  <span className="action-count">{order.actions} actions</span>
                  <button 
                    className="trigger-btn"
                    onClick={() => handleTrigger(order.trigger)}
                    disabled={executing === order.trigger}
                  >
                    {executing === order.trigger ? '...' : '▶'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="recent-activity">
            <h4>Recent Activity</h4>
            {logs.length === 0 ? (
              <p className="no-activity">No recent activity</p>
            ) : (
              <div className="activity-list">
                {logs.slice(0, 10).map((log, idx) => (
                  <div key={idx} className={`activity-item ${log.action}`}>
                    <span className="activity-time">{formatTime(log.timestamp)}</span>
                    <span className="activity-order">{log.orderId}</span>
                    <span className={`activity-action ${log.action}`}>{log.action}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StandingOrdersPanel
