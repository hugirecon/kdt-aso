import React, { useState, useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
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

  // Voice handling - when speech is transcribed, send it as a message
  const handleVoiceTranscription = useCallback((text: string) => {
    if (!socket || !text.trim()) return
    
    // Add transcribed message to chat
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      from: user?.title || 'Operator',
      content: text,
      timestamp: new Date().toISOString(),
      isOperator: true
    }])
    
    // Send to server (with voice response if enabled)
    socket.emit('message', { 
      message: text, 
      language: 'en',
      voiceEnabled: true  // Always request voice for voice input
    })
  }, [user, socket])

  const handleVoiceError = useCallback((error: string) => {
    console.error('Voice error:', error)
  }, [])

  const {
    isRecording,
    isPlaying,
    voiceEnabled,
    voiceAvailable,
    sttAvailable,
    startRecording,
    stopRecording,
    playAudio,
    toggleVoice
  } = useVoice({
    socket,
    onTranscription: handleVoiceTranscription,
    onError: handleVoiceError
  })

  // Check if already authenticated on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          setAuthenticated(true)
        }
      } catch (err) {
        // Not authenticated
      } finally {
        setCheckingAuth(false)
      }
    }
    checkAuth()
  }, [])

  // Connect socket and fetch data when authenticated
  useEffect(() => {
    if (!authenticated) return

    const newSocket = io('http://localhost:3001', {
      withCredentials: true
    })
    
    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('operator:identify', user?.id || 'default')
    })

    newSocket.on('disconnect', () => {
      setConnected(false)
    })

    newSocket.on('response', (data) => {
      const newMessage = {
        id: Date.now().toString(),
        from: data.agent,
        content: data.content,
        timestamp: data.timestamp,
        audioUrl: data.audioUrl
      }
      setMessages(prev => [...prev, newMessage])
      
      // Auto-play audio if voice is enabled
      if (data.audioUrl && voiceEnabled) {
        playAudio(data.audioUrl)
      }
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

    // Fetch initial agents
    fetch('/api/agents', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setAgents(data))
      .catch(err => console.error('Failed to fetch agents:', err))

    return () => {
      newSocket.close()
    }
  }, [authenticated])

  const handleLogin = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    setAuthenticated(true)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { 
      method: 'POST',
      credentials: 'include'
    })
    setAuthenticated(false)
    setUser(null)
    setToken(null)
    setMessages([])
    socket?.close()
  }

  const sendMessage = (message: string, withVoice?: boolean) => {
    if (!socket || !message.trim()) return

    // Add operator message to chat
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      from: user?.title || 'Operator',
      content: message,
      timestamp: new Date().toISOString(),
      isOperator: true
    }])

    // Send to server (request voice response if enabled)
    socket.emit('message', { 
      message, 
      language: 'en',
      voiceEnabled: withVoice ?? voiceEnabled
    })
  }

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="app loading">
        <div className="loading-spinner">Initializing KDT Aso...</div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!authenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app">
      <Header connected={connected} user={user} onLogout={handleLogout} />
      
      {/* View Toggle */}
      <div className="view-toggle">
        <button 
          className={activeView === 'chat' ? 'active' : ''} 
          onClick={() => setActiveView('chat')}
        >
          💬 Chat
        </button>
        <button 
          className={activeView === 'split' ? 'active' : ''} 
          onClick={() => setActiveView('split')}
        >
          ⊞ Split
        </button>
        <button 
          className={activeView === 'map' ? 'active' : ''} 
          onClick={() => setActiveView('map')}
        >
          🗺️ Map
        </button>
        {user?.role === 'admin' && (
          <button 
            className="admin-btn"
            onClick={() => setShowAdmin(true)}
          >
            ⚙️ Admin
          </button>
        )}
      </div>
      
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      
      <main className={`main-content view-${activeView}`}>
        <aside className="left-panel">
          <AgentPanel agents={agents} />
          <AlertsPanel socket={socket} />
          <StandingOrdersPanel socket={socket} />
          <SensorsPanel socket={socket} />
        </aside>
        
        {(activeView === 'chat' || activeView === 'split') && (
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
            />
          </section>
        )}
        
        {(activeView === 'map' || activeView === 'split') && (
          <section className={`map-section ${activeView === 'map' ? 'full' : ''}`}>
            <MapPanel 
              socket={socket}
              expanded={mapExpanded}
              onToggleExpand={() => setMapExpanded(!mapExpanded)}
            />
          </section>
        )}
        
        {activeView !== 'map' && (
          <aside className="right-panel">
            <ActivityLog activity={activity} />
          </aside>
        )}
      </main>
    </div>
  )
}

export default App
