import React, { useState, useRef, useEffect, useMemo } from 'react'

/** Sanitize HTML to prevent XSS — only allow safe tags and attributes */
function sanitizeHtml(html: string): string {
  const allowedTags = new Set(['p', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'hr', 'li', 'ul', 'ol', 'blockquote', 'br', 'a'])
  const allowedAttrs: Record<string, Set<string>> = { a: new Set(['href', 'title']) }
  
  // Strip all tags except allowed ones, remove all event handlers and dangerous attrs
  return html
    // Remove script/style/iframe tags and their content entirely
    .replace(/<(script|style|iframe|object|embed|form|input|textarea|button|select|svg|math)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|textarea|button|select|svg|math)[^>]*\/?>/gi, '')
    // Remove event handlers (onclick, onerror, onload, etc.)
    .replace(/\s+on\w+\s*=\s*(['"]?)[\s\S]*?\1/gi, '')
    // Remove javascript: and data: URLs
    .replace(/href\s*=\s*(['"]?)\s*javascript:/gi, 'href=$1#blocked:')
    .replace(/href\s*=\s*(['"]?)\s*data:/gi, 'href=$1#blocked:')
    // Remove any remaining tags not in allowlist
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tag) => {
      const lower = tag.toLowerCase()
      if (allowedTags.has(lower)) {
        // For allowed tags, strip non-allowed attributes
        if (match.startsWith('</')) return `</${lower}>`
        const allowed = allowedAttrs[lower]
        if (!allowed) return match.replace(/\s+[a-zA-Z-]+=(['"]?)[\s\S]*?\1/g, '')
        return match
      }
      return '' // Strip non-allowed tags
    })
}

/** Lightweight markdown → HTML for chat messages */
function renderMarkdown(text: string): string {
  // First escape HTML entities to prevent injection
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  
  let html = escaped
    // Code blocks first (preserve content)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr/>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists  
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs — wrap remaining lines that aren't already wrapped in tags
    .replace(/^(?!<[a-z])((?!\s*$).+)$/gm, '<p>$1</p>')
    // Clean up empty paragraphs
    .replace(/<p>\s*<\/p>/g, '')

  return sanitizeHtml(html)
}

interface Message {
  id: string
  from: string
  content: string
  timestamp: string
  isOperator?: boolean
  audioUrl?: string
}

interface MissionSuggestion {
  label: string
  message: string
}

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (message: string, voiceEnabled?: boolean) => void
  connected: boolean
  userTitle?: string
  voiceEnabled?: boolean
  voiceAvailable?: boolean
  sttAvailable?: boolean
  isRecording?: boolean
  isPlaying?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
  onToggleVoice?: () => void
  onPlayAudio?: (url: string) => void
  // Mission context
  activeMissionId?: string | null
  activeMissionName?: string | null
}

const MISSION_SUGGESTIONS: MissionSuggestion[] = [
  { label: 'Generate my platoon OPORD', message: "I'm the platoon leader of 3rd Platoon. Generate a platoon-level OPORD for my element based on our role in this operation." },
  { label: 'Analyze risks for Phase 2', message: 'What are the key risks for the search force during Phase 2?' },
  { label: 'Recommend positions for 1st PLT', message: "Recommend phase lines and checkpoints for 1st Platoon's cordon position." },
  { label: 'Enemy COA analysis', message: "What are the enemy's most likely actions when they detect our cordon?" },
]

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  connected,
  voiceEnabled = false,
  voiceAvailable = false,
  sttAvailable = false,
  isRecording = false,
  isPlaying = false,
  onStartRecording,
  onStopRecording,
  onToggleVoice,
  onPlayAudio,
  activeMissionId,
  activeMissionName,
}) => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && connected) {
      onSendMessage(input, voiceEnabled)
      setInput('')
    }
  }

  const handleSuggestion = (msg: string) => {
    onSendMessage(msg, voiceEnabled)
  }

  const handleVoiceClick = () => {
    if (isRecording) {
      onStopRecording?.()
    } else {
      onStartRecording?.()
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="chat-interface">
      {/* Mission context banner */}
      {activeMissionId && (
        <div className="chat-mission-banner">
          🎯 Mission context active: <strong>{activeMissionName}</strong>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            {activeMissionId ? (
              <>
                <p>Mission: <strong>{activeMissionName}</strong></p>
                <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>Ask Aso anything about this operation.</p>
                <div className="chat-suggestions">
                  {MISSION_SUGGESTIONS.map((s, i) => (
                    <button key={i} className="chat-suggestion-btn" onClick={() => handleSuggestion(s.message)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p>KDT Aso ready.</p>
                <p style={{ marginTop: '8px' }}>Speak to your staff. They're waiting.</p>
              </>
            )}
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`message ${msg.isOperator ? 'operator' : ''}`}>
              <div className="message-header">
                <span className="message-from">{msg.from}</span>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
                {msg.audioUrl && (
                  <button 
                    className="audio-play-btn"
                    onClick={() => onPlayAudio?.(msg.audioUrl!)}
                    title="Play voice"
                  >
                    🔊
                  </button>
                )}
              </div>
              <div className="message-content"
                dangerouslySetInnerHTML={msg.isOperator ? undefined : { __html: renderMarkdown(msg.content) }}
              >
                {msg.isOperator ? msg.content : undefined}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="chat-input-wrapper">
          {voiceAvailable && (
            <button
              type="button"
              className={`voice-toggle-btn ${voiceEnabled ? 'active' : ''}`}
              onClick={onToggleVoice}
              title={voiceEnabled ? 'Voice responses ON' : 'Voice responses OFF'}
            >
              {voiceEnabled ? '🔊' : '🔇'}
            </button>
          )}
          
          <input
            type="text"
            className="chat-input"
            placeholder={activeMissionId ? `Ask about ${activeMissionName}...` : isRecording ? 'Listening...' : 'Speak to your staff...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!connected || isRecording}
          />
          
          {sttAvailable && (
            <button
              type="button"
              className={`voice-btn ${isRecording ? 'recording' : ''}`}
              onClick={handleVoiceClick}
              disabled={!connected}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isRecording ? '⏹️' : '🎤'}
            </button>
          )}
          
          <button 
            type="submit" 
            className="chat-send-btn"
            disabled={!connected || !input.trim() || isRecording}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChatInterface
