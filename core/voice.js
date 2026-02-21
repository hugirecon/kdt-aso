/**
 * KDT Aso - Voice Interface Module
 * Speech-to-text (Browser API) and Text-to-speech (ElevenLabs)
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class VoiceInterface {
  constructor() {
    this.elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    this.enabled = !!this.elevenLabsKey;
    
    if (!this.enabled) {
      console.log('Voice TTS disabled: ELEVENLABS_API_KEY not set');
      console.log('  → Get a free key at https://elevenlabs.io');
    }
    
    // Audio storage directory
    this.audioDir = path.join(__dirname, '..', 'audio');
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
    
    // ElevenLabs voice IDs - professional, clear voices
    // These are default ElevenLabs voices (no cloning needed)
    this.voiceProfiles = {
      // Command voices - authoritative
      intelligence_officer: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },      // Deep, authoritative
      operations_officer: { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },       // Professional male
      watch_officer: { voiceId: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },            // Strong, clear
      
      // Analyst voices - precise, clear
      intel_analyst: { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },             // Clear female
      collection_manager: { voiceId: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },         // Professional female
      geospatial_officer: { voiceId: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },         // Neutral male
      
      // Support voices
      surveillance_officer: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
      comms_officer: { voiceId: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi' },              // Clear, friendly
      logistics_officer: { voiceId: 'odq8hYkDhTreDLlPKjFy', name: 'Patrick' },       // Practical
      admin_officer: { voiceId: 'jsCqWAovK2LkecY7zXl4', name: 'Freya' },             // Professional female
      
      default: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' }
    };
    
    // ElevenLabs settings
    this.modelId = 'eleven_monolingual_v1';  // Fast, good quality
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  /**
   * Text-to-speech using ElevenLabs
   * @param {string} text - Text to speak
   * @param {string} agentId - Agent ID for voice selection
   * @returns {Promise<{audioPath: string, audioUrl: string, voice: string}>}
   */
  async speak(text, agentId = 'default') {
    if (!this.enabled) {
      throw new Error('Voice TTS not enabled - set ELEVENLABS_API_KEY');
    }

    const profile = this.voiceProfiles[agentId] || this.voiceProfiles.default;
    const filename = `${uuidv4()}.mp3`;
    const audioPath = path.join(this.audioDir, filename);

    const response = await fetch(`${this.baseUrl}/text-to-speech/${profile.voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsKey
      },
      body: JSON.stringify({
        text: text,
        model_id: this.modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    // Write audio to file
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(audioPath, buffer);

    return {
      audioPath: audioPath,
      audioUrl: `/audio/${filename}`,
      voice: profile.name
    };
  }

  /**
   * Get voice profile for an agent
   */
  getVoiceProfile(agentId) {
    return this.voiceProfiles[agentId] || this.voiceProfiles.default;
  }

  /**
   * Set custom voice for an agent (use ElevenLabs voice ID)
   */
  setVoiceProfile(agentId, voiceId, name) {
    this.voiceProfiles[agentId] = { voiceId, name };
  }

  /**
   * List available ElevenLabs voices
   */
  async listVoices() {
    if (!this.enabled) {
      throw new Error('Voice not enabled');
    }

    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: {
        'xi-api-key': this.elevenLabsKey
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    return data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category
    }));
  }

  /**
   * Clean up old audio files (older than 1 hour)
   */
  cleanup() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const files = fs.readdirSync(this.audioDir);
    
    for (const file of files) {
      const filePath = path.join(this.audioDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < oneHourAgo) {
        fs.unlinkSync(filePath);
      }
    }
  }

  /**
   * Check if TTS is available
   */
  isEnabled() {
    return this.enabled;
  }
}

module.exports = VoiceInterface;
