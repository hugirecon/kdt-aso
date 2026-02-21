import React, { useState, useRef, useEffect } from 'react'

interface Message {
  id: string
  from: string
  content: string
  timestamp: string
  isOperator?: boolean
  audioUrl?: string
}

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (message: string, voiceEnabled?: boolean) => void
  connected: boolean
  userTitle?: string
  voiceEnabled?: boolean
  voiceAvailable?: boolean   // TTS available (server-side ElevenLabs)
  sttAvailable?: boolean     // STT available (browser Web Speech API)
  isRecording?: boolean
  isPlaying?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
  onToggleVoice?: () => void
  onPlayAudio?: (url: string) => void
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  connected,
  voiceEnabled = false,
  voiceAvailable = false,  // TTS (ElevenLabs)
  sttAvailable = false,    // STT (browser)
  isRecording = false,
  isPlaying = false,
  onStartRecording,
  onStopRecording,
  onToggleVoice,
  onPlayAudio
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
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>KDT Aso ready.</p>
            <p style={{ marginTop: '8px' }}>Speak to your staff. They're waiting.</p>
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
              <div className="message-content">{msg.content}</div>
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
            placeholder={isRecording ? 'Listening...' : 'Speak to your staff...'}
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
