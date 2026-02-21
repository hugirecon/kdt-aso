import { useState, useRef, useCallback, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { apiFetch, API_URL } from '../utils/api'

// Browser Speech Recognition types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface UseVoiceOptions {
  socket: Socket | null
  onTranscription?: (text: string) => void
  onError?: (error: string) => void
}

export function useVoice({ socket, onTranscription, onError }: UseVoiceOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [sttAvailable, setSttAvailable] = useState(false)
  
  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Check if TTS is available on server, and if browser STT is available
  useEffect(() => {
    // Check server TTS (ElevenLabs)
    apiFetch('/api/voice/status')
      .then(res => res.json())
      .then(data => setVoiceAvailable(data.enabled))
      .catch(() => setVoiceAvailable(false))

    // Check browser Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSttAvailable(!!SpeechRecognition)
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1
      const transcript = event.results[last][0].transcript
      onTranscription?.(transcript)
      setIsRecording(false)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      if (event.error !== 'aborted') {
        onError?.(`Speech recognition error: ${event.error}`)
      }
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
  }, [onTranscription, onError])

  const startRecording = useCallback(async () => {
    if (!sttAvailable) {
      onError?.('Speech recognition not available in this browser')
      return
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true })
      
      recognitionRef.current?.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      onError?.('Failed to access microphone')
    }
  }, [sttAvailable, onError])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const playAudio = useCallback((audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(`${API_URL}${audioUrl}`)
    audioRef.current = audio

    audio.onplay = () => setIsPlaying(true)
    audio.onended = () => setIsPlaying(false)
    audio.onerror = () => {
      setIsPlaying(false)
      onError?.('Failed to play audio')
    }

    audio.play().catch(err => {
      console.error('Audio playback error:', err)
      onError?.('Failed to play audio')
    })
  }, [onError])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsPlaying(false)
    }
  }, [])

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(prev => !prev)
  }, [])

  return {
    isRecording,
    isPlaying,
    voiceEnabled,
    voiceAvailable,  // TTS available (ElevenLabs)
    sttAvailable,    // STT available (browser)
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    toggleVoice
  }
}
