import fs from 'fs';
import util from 'util';
import axios from 'axios';
import { TTSProvider, TTSRequest } from '../tts.service';

interface ElevenLabsVoiceConfig {
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

interface ElevenLabsConfig {
  apiKey: string;
  voices: Record<string, Record<string, ElevenLabsVoiceConfig>>; // langCode -> speaker -> config
  defaultModel: string;
}

/**
 * ElevenLabs TTS Provider
 * Provides the most natural, human-like AI voices with excellent Hindi support
 * 
 * Features:
 * - Multilingual v2 model supports 29+ languages including Hindi
 * - Natural speech patterns, emotions, and intonation
 * - Voice cloning and fine-tuning capabilities
 * - Low latency streaming
 */
export class ElevenLabsProvider implements TTSProvider {
  private config: ElevenLabsConfig;
  private readonly API_BASE = 'https://api.elevenlabs.io/v1';

  constructor(apiKey: string) {
    this.config = this.loadConfig(apiKey);
    console.log('[ElevenLabs] Initialized with', Object.keys(this.config.voices).length, 'language configs');
  }

  private loadConfig(apiKey: string): ElevenLabsConfig {
    // Default voice configurations
    // These are high-quality multilingual voices from ElevenLabs
    const config: ElevenLabsConfig = {
      apiKey,
      defaultModel: 'eleven_multilingual_v2',
      voices: {
        'en': {
          'Host': {
            voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - warm, professional female
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.3,
            useSpeakerBoost: true
          },
          'AI Tutor': {
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - clear, friendly male
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.2,
            useSpeakerBoost: true
          },
          'Student': {
            voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - young, curious
            stability: 0.4,
            similarityBoost: 0.75,
            style: 0.5,
            useSpeakerBoost: true
          },
          'Teacher': {
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - authoritative, clear
            stability: 0.6,
            similarityBoost: 0.75,
            style: 0.1,
            useSpeakerBoost: true
          },
          'Subject Expert': {
            voiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel - knowledgeable male
            stability: 0.6,
            similarityBoost: 0.75,
            style: 0.2,
            useSpeakerBoost: true
          },
          'Exam Coach': {
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - motivating, encouraging
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.4,
            useSpeakerBoost: true
          }
        },
        'hi': {
          'Host': {
            voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - multilingual, warm female (works great for Hindi)
            modelId: 'eleven_multilingual_v2',
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.3,
            useSpeakerBoost: true
          },
          'AI Tutor': {
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - multilingual, clear male (excellent Hindi pronunciation)
            modelId: 'eleven_multilingual_v2',
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.2,
            useSpeakerBoost: true
          },
          'Student': {
            voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - young, curious female
            modelId: 'eleven_multilingual_v2',
            stability: 0.4,
            similarityBoost: 0.75,
            style: 0.5,
            useSpeakerBoost: true
          },
          'Teacher': {
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - authoritative male
            modelId: 'eleven_multilingual_v2',
            stability: 0.6,
            similarityBoost: 0.75,
            style: 0.1,
            useSpeakerBoost: true
          },
          'Subject Expert': {
            voiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel - knowledgeable male
            modelId: 'eleven_multilingual_v2',
            stability: 0.6,
            similarityBoost: 0.75,
            style: 0.2,
            useSpeakerBoost: true
          },
          'Exam Coach': {
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - motivating male
            modelId: 'eleven_multilingual_v2',
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0.4,
            useSpeakerBoost: true
          }
        }
      }
    };

    // Try to load custom voice config from file
    try {
      const configPath = require('path').join(process.cwd(), 'config', 'elevenlabs.config.json');
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.voices = { ...config.voices, ...fileConfig.voices };
        if (fileConfig.defaultModel) config.defaultModel = fileConfig.defaultModel;
      }
    } catch (err) {
      console.warn('[ElevenLabs] Could not load custom config, using defaults');
    }

    return config;
  }

  async synthesize(request: TTSRequest, outputPath: string): Promise<string> {
    const startTime = Date.now();
    const langCode = this.getLanguageCode(request.language || 'en');
    const voiceConfig = this.getVoiceConfig(request.speaker, langCode);

    console.log('[ElevenLabs] Synthesizing:', {
      speaker: request.speaker,
      language: langCode,
      voiceId: voiceConfig.voiceId,
      characterCount: request.text.length,
      userId: request.userId,
      podcastId: request.podcastId,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await axios.post(
        `${this.API_BASE}/text-to-speech/${voiceConfig.voiceId}`,
        {
          text: request.text,
          model_id: voiceConfig.modelId || this.config.defaultModel,
          voice_settings: {
            stability: voiceConfig.stability ?? 0.5,
            similarity_boost: voiceConfig.similarityBoost ?? 0.75,
            style: voiceConfig.style ?? 0.3,
            use_speaker_boost: voiceConfig.useSpeakerBoost ?? true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': this.config.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      const writeFile = util.promisify(fs.writeFile);
      await writeFile(outputPath, response.data, 'binary');

      const duration = Date.now() - startTime;
      console.log('[ElevenLabs] Synthesis complete:', {
        speaker: request.speaker,
        language: langCode,
        durationMs: duration,
        outputPath,
        audioSize: response.data.length
      });

      return outputPath;
    } catch (error: any) {
      // Decode error buffer if it exists
      let errorDetail = error.response?.data || error.message;
      if (Buffer.isBuffer(errorDetail)) {
        errorDetail = errorDetail.toString('utf-8');
        try {
          errorDetail = JSON.parse(errorDetail);
        } catch {
          // Keep as string if not JSON
        }
      }

      console.error('[ElevenLabs] Synthesis failed:', {
        speaker: request.speaker,
        language: langCode,
        voiceId: voiceConfig.voiceId,
        error: errorDetail,
        characterCount: request.text.length,
        status: error.response?.status,
        statusText: error.response?.statusText
      });

      // Return user-friendly error message
      if (error.response?.status === 401) {
        throw new Error(`ElevenLabs authentication failed. Please check your API key at https://elevenlabs.io/app/settings/api-keys`);
      } else if (error.response?.status === 429) {
        throw new Error(`ElevenLabs quota exceeded. Check your usage at https://elevenlabs.io/app/usage`);
      } else if (error.response?.status === 422) {
        throw new Error(`ElevenLabs request invalid: ${JSON.stringify(errorDetail)}`);
      }
      
      throw new Error(`ElevenLabs TTS failed: ${error.response?.status || 'Network error'} - ${JSON.stringify(errorDetail)}`);
    }
  }

  private getLanguageCode(language: string): string {
    const langMap: Record<string, string> = {
      'english': 'en',
      'hindi': 'hi',
      'spanish': 'es',
      'french': 'fr',
      'german': 'de',
      'en': 'en',
      'hi': 'hi',
      'es': 'es',
      'fr': 'fr',
      'de': 'de'
    };
    return langMap[language.toLowerCase()] || 'en';
  }

  private getVoiceConfig(speaker: string, langCode: string): ElevenLabsVoiceConfig {
    // Try to get voice for specific language
    const langVoices = this.config.voices[langCode];
    if (langVoices && langVoices[speaker]) {
      return langVoices[speaker];
    }

    // Fallback to English voice (multilingual models work for all languages)
    const enVoices = this.config.voices['en'];
    if (enVoices && enVoices[speaker]) {
      return { ...enVoices[speaker], modelId: 'eleven_multilingual_v2' };
    }

    // Ultimate fallback
    return {
      voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam
      modelId: 'eleven_multilingual_v2',
      stability: 0.5,
      similarityBoost: 0.75,
      useSpeakerBoost: true
    };
  }
}
