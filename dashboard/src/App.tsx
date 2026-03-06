import React, { useState, useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { apiFetch, API_URL } from './utils/api'
import Login from './components/Login'
import Header from './components/Header'
import AgentPanel from './components/AgentPanel'
import ChatInterface from './components/ChatInterface'
import AlertsPanel from './components/AlertsPanel'
import ActivityLog from './components/ActivityLog'
import MapPanel from './components/MapPanel'
import StandingOrdersPanel from './components/StandingOrdersPanel'
import SensorsPanel from './components/SensorsPanel'
import AdminPanel from './components/AdminPanel'
import RolePreview, { ROLE_CONFIG, DashboardRole } from './components/RolePreview'
import MissionPlanner from './components/MissionPlanner'
// MissionChat removed — unified into main chat
import { useVoice } from './hooks/useVoice'

interface Message {
  id: string
  from: string
  content: string
  timestamp: string
  isOperator?: boolean
}

interface Agent {
  name: string
  section: string
  status: string
}

interface Alert {
  id: string
  priority: string
  message: string
  timestamp: string
}

interface User {
  id: string
  username: string
  name: string
  title: string
  role: string
  access: string[]
}

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [agents, setAgents] = useState<Record<string, Agent>>({})
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [mapExpanded, setMapExpanded] = useState(false)
  const [activeView, setActiveView] = useState<'chat' | 'map' | 'split'>('split')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showMissionPlanner, setShowMissionPlanner] = useState(false)
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [activeMissionName, setActiveMissionName] = useState<string | null>(null)
  const [previewRole, setPreviewRole] = useState<DashboardRole | null>(null)

  // Determine effective role (actual or previewed)
  const effectiveRole: DashboardRole = previewRole || (user?.role as DashboardRole) || 'operator'
  const visiblePanels = ROLE_CONFIG[effectiveRole]?.panels || ROLE_CONFIG.operator.panels

  const hasPanel = (panel: string) => visiblePanels.includes(panel)

  // Voice handling
  const handleVoiceTranscription = useCallback((text: string) => {
    if (!socket || !text.trim()) return
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      from: user?.title || 'Operator',
      content: text,
      timestamp: new Date().toISOString(),
      isOperator: true
    }])
    socket.emit('message', { message: text, language: 'en', voiceEnabled: true })
  }, [user, socket])

  const handleVoiceError = useCallback((error: string) => {
    console.error('Voice error:', error)
  }, [])

  const {
    isRecording, isPlaying, voiceEnabled, voiceAvailable, sttAvailable,
    startRecording, stopRecording, playAudio, toggleVoice
  } = useVoice({
    socket,
    onTranscription: handleVoiceTranscription,
    onError: handleVoiceError
  })

  // Check if already authenticated on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiFetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          setAuthenticated(true)
        }
      } catch (err) { /* Not authenticated */ }
      finally { setCheckingAuth(false) }
    }
    checkAuth()
  }, [])

  // Connect socket and fetch data when authenticated
  useEffect(() => {
    if (!authenticated) return

    const newSocket = io(API_URL, { withCredentials: true })
    
    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('operator:identify', user?.id || 'default')
    })
    newSocket.on('disconnect', () => setConnected(false))

    newSocket.on('response', (data) => {
      const newMessage = {
        id: Date.now().toString(),
        from: data.agent,
        content: data.content,
        timestamp: data.timestamp,
        audioUrl: data.audioUrl
      }
      setMessages(prev => [...prev, newMessage])
      if (data.audioUrl && voiceEnabled) playAudio(data.audioUrl)
    })

    newSocket.on('activity', (data) => {
      setActivity(prev => [data, ...prev].slice(0, 50))
    })

    newSocket.on('escalation', (data) => {
      setAlerts(prev => [{
        id: Date.now().toString(),
        priority: data.priority,
        message: data.reason,
        timestamp: data.timestamp
      }, ...prev])
    })

    setSocket(newSocket)

    apiFetch('/api/agents')
      .then(res => res.json())
      .then(data => setAgents(data))
      .catch(err => console.error('Failed to fetch agents:', err))

    return () => { newSocket.close() }
  }, [authenticated])

  const handleLogin = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    setAuthenticated(true)
  }

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setAuthenticated(false)
    setUser(null)
    setToken(null)
    setMessages([])
    socket?.close()
  }

  const sendMessage = (message: string, withVoice?: boolean) => {
    if (!socket || !message.trim()) return

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      from: user?.title || 'Operator',
      content: message,
      timestamp: new Date().toISOString(),
      isOperator: true
    }])

    // Single path — socket handles everything, mission context included
    socket.emit('message', { 
      message, 
      language: 'en', 
      voiceEnabled: withVoice ?? voiceEnabled,
      missionId: activeMissionId || undefined,
    })
  }

  if (checkingAuth) {
    return (
      <div className="app loading">
        <div className="loading-spinner">Initializing KDT Aso...</div>
      </div>
    )
  }

  if (!authenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className={`app ${previewRole ? 'preview-mode' : ''}`}>
      <Header connected={connected} user={user} onLogout={handleLogout}>
        {/* Admin preview button — right side of header */}
        {user?.role === 'admin' && (
          <RolePreview
            currentRole={user.role}
            previewRole={previewRole}
            onPreview={setPreviewRole}
          />
        )}
      </Header>

      {/* Preview banner */}
      {previewRole && (
        <div className="preview-banner">
          <span>👁️ Previewing: <strong>{ROLE_CONFIG[previewRole].label}</strong> dashboard</span>
          <button onClick={() => setPreviewRole(null)}>Exit Preview</button>
        </div>
      )}
      
      {/* View Toggle — only show views available to this role */}
      <div className="view-toggle">
        {(hasPanel('staff') || hasPanel('sensors')) && (
          <button 
            className={showSidebar ? 'active' : ''}
            onClick={() => setShowSidebar(!showSidebar)}
            title="Staff & Sensors"
          >
            👥 Staff
          </button>
        )}
        {hasPanel('chat') && (
          <button 
            className={activeView === 'chat' ? 'active' : ''} 
            onClick={() => setActiveView('chat')}
          >
            💬 Chat
          </button>
        )}
        {hasPanel('chat') && hasPanel('map') && (
          <button 
            className={activeView === 'split' ? 'active' : ''} 
            onClick={() => setActiveView('split')}
          >
            ⊞ Split
          </button>
        )}
        {hasPanel('map') && (
          <button 
            className={activeView === 'map' ? 'active' : ''} 
            onClick={() => setActiveView('map')}
          >
            🗺️ Map
          </button>
        )}
        {hasPanel('missions') && (
          <button 
            className={showMissionPlanner ? 'active' : ''}
            onClick={() => {
              const next = !showMissionPlanner
              setShowMissionPlanner(next)
              if (!next) { setActiveMissionId(null); setActiveMissionName(null) }
            }}
          >
            🎯 Missions
          </button>
        )}
        {hasPanel('admin') && (
          <button 
            className="admin-btn"
            onClick={() => setShowAdmin(true)}
          >
            ⚙️ Admin
          </button>
        )}
      </div>
      
      {showAdmin && hasPanel('admin') && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {/* Sidebar for Staff & Sensors */}
      {showSidebar && (hasPanel('staff') || hasPanel('sensors')) && (
        <div className="sidebar-overlay" onClick={() => setShowSidebar(false)}>
          <aside className="sidebar-drawer" onClick={e => e.stopPropagation()}>
            <div className="sidebar-drawer-header">
              <h3>Staff &amp; Sensors</h3>
              <button className="sidebar-close-btn" onClick={() => setShowSidebar(false)}>✕</button>
            </div>
            <div className="sidebar-drawer-content">
              {hasPanel('staff') && <AgentPanel agents={agents} />}
              {hasPanel('sensors') && <SensorsPanel socket={socket} />}
            </div>
          </aside>
        </div>
      )}
      
      {showMissionPlanner ? (
        <main className="main-content mission-layout">
          <aside className="mission-list-panel">
            <MissionPlanner
              socket={socket}
              onMissionSelect={(id, name) => { setActiveMissionId(id); setActiveMissionName(name) }}
              activeMissionId={activeMissionId}
            />
          </aside>
          <section className="center-panel">
            <ChatInterface 
              messages={messages} 
              onSendMessage={sendMessage}
              connected={connected}
              userTitle={user?.title}
              voiceEnabled={voiceEnabled}
              voiceAvailable={voiceAvailable}
              sttAvailable={sttAvailable}
              isRecording={isRecording}
              isPlaying={isPlaying}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onToggleVoice={toggleVoice}
              onPlayAudio={playAudio}
              activeMissionId={activeMissionId}
              activeMissionName={activeMissionName}
            />
          </section>
          <section className="mission-map-section">
            <MapPanel 
              socket={socket}
              expanded={false}
              onToggleExpand={() => {}}
              activeMissionId={activeMissionId || undefined}
            />
          </section>
        </main>
      ) : (
        <main className={`main-content view-${activeView}`}>
          <aside className="left-panel">
            {hasPanel('alerts') && <AlertsPanel socket={socket} />}
            {hasPanel('standing-orders') && <StandingOrdersPanel socket={socket} />}
          </aside>
          
          {hasPanel('chat') && (activeView === 'chat' || activeView === 'split') && (
            <section className="center-panel">
              <ChatInterface 
                messages={messages} 
                onSendMessage={sendMessage}
                connected={connected}
                userTitle={user?.title}
                voiceEnabled={voiceEnabled}
                voiceAvailable={voiceAvailable}
                sttAvailable={sttAvailable}
                isRecording={isRecording}
                isPlaying={isPlaying}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
                onToggleVoice={toggleVoice}
                onPlayAudio={playAudio}
                activeMissionId={activeMissionId}
                activeMissionName={activeMissionName}
              />
            </section>
          )}
          
          {hasPanel('map') && (activeView === 'map' || activeView === 'split') && (
            <section className={`map-section ${activeView === 'map' ? 'full' : ''}`}>
              <MapPanel 
                socket={socket}
                expanded={mapExpanded}
                onToggleExpand={() => setMapExpanded(!mapExpanded)}
                activeMissionId={activeMissionId || undefined}
              />
            </section>
          )}
          
          {hasPanel('activity') && activeView !== 'map' && (
            <aside className="right-panel">
              <ActivityLog activity={activity} />
            </aside>
          )}
        </main>
      )}
    </div>
  )
}

export default App
