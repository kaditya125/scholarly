import fs from 'fs';
import util from 'util';
import { VertexAI } from '@google-cloud/vertexai';
import { TTSProvider, TTSRequest } from '../tts.service';

interface GeminiVoiceConfig {
  voiceName: string;
  description?: string;
}

interface GeminiTTSConfig {
  project: string;
  location: string;
  model: string; // 'gemini-3.1-flash-tts-preview'
  voices: Record<string, Record<string, GeminiVoiceConfig>>; // langCode -> speaker -> config
}

/**
 * Gemini TTS Provider (Vertex AI)
 * Uses Google Gemini 3.1 Flash TTS Preview via Vertex AI - dedicated text-to-speech model
 * 
 * Features:
 * - Natural, human-like voices (much better than Google Cloud TTS)
 * - Built-in multilingual support (Hindi, English, 100+ languages)
 * - Uses Vertex AI with service account authentication
 * - Low latency
 * - Dedicated TTS model optimized for speech synthesis
 * 
 * Voice names available:
 * - Puck (energetic, youthful)
 * - Charon (deep, resonant)
 * - Kore (warm, conversational)
 * - Fenrir (authoritative, clear)
 * - Aoede (melodic, expressive)
 */
export class GeminiTTSProvider implements TTSProvider {
  private vertexAI: VertexAI;
  private config: GeminiTTSConfig;

  constructor() {
    // Load Vertex AI configuration from environment
    const project = process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4';
    const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    
    this.vertexAI = new VertexAI({
      project,
      location
    });
    
    this.config = this.loadConfig(project, location);
    console.log('[Gemini TTS] Initialized with model:', this.config.model);
    console.log('[Gemini TTS] Using Vertex AI project:', project);
  }

  private loadConfig(project: string, location: string): GeminiTTSConfig {
    const config: GeminiTTSConfig = {
      project,
      location,
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview',
      voices: {
        'en': {
          'Host': {
            voiceName: 'Kore',
            description: 'Warm, conversational female voice for podcast host'
          },
          'AI Tutor': {
            voiceName: 'Puck',
            description: 'Energetic, clear voice for AI tutor'
          },
          'Student': {
            voiceName: 'Aoede',
            description: 'Melodic, curious voice for student role'
          },
          'Teacher': {
            voiceName: 'Fenrir',
            description: 'Authoritative, clear voice for teacher role'
          },
          'Subject Expert': {
            voiceName: 'Charon',
            description: 'Deep, knowledgeable voice for subject expert'
          },
          'Exam Coach': {
            voiceName: 'Puck',
            description: 'Motivating, energetic voice for exam coaching'
          }
        },
        'hi': {
          'Host': {
            voiceName: 'Kore',
            description: 'Warm Hindi female voice for podcast host'
          },
          'AI Tutor': {
            voiceName: 'Puck',
            description: 'Clear Hindi voice for AI tutor'
          },
          'Student': {
            voiceName: 'Aoede',
            description: 'Natural Hindi female voice for student'
          },
          'Teacher': {
            voiceName: 'Fenrir',
            description: 'Authoritative Hindi voice for teacher'
          },
          'Subject Expert': {
            voiceName: 'Charon',
            description: 'Deep Hindi voice for subject expert'
          },
          'Exam Coach': {
            voiceName: 'Puck',
            description: 'Energetic Hindi voice for coaching'
          }
        }
      }
    };

    // Try to load custom config
    try {
      const configPath = require('path').join(process.cwd(), 'config', 'gemini-tts.config.json');
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.voices = { ...config.voices, ...fileConfig.voices };
        if (fileConfig.model) config.model = fileConfig.model;
      }
    } catch (err) {
      console.warn('[Gemini TTS] Could not load custom config, using defaults');
    }

    return config;
  }

  async synthesize(request: TTSRequest, outputPath: string): Promise<string> {
    const startTime = Date.now();
    const langCode = this.getLanguageCode(request.language || 'en');
    const voiceConfig = this.getVoiceConfig(request.speaker, langCode);

    console.log('[Gemini TTS] Synthesizing:', {
      speaker: request.speaker,
      language: langCode,
      voice: voiceConfig.voiceName,
      characterCount: request.text.length,
      model: this.config.model,
      project: this.config.project,
      userId: request.userId,
      podcastId: request.podcastId,
      timestamp: new Date().toISOString()
    });

    try {
      // Create generative model with audio generation config
      const generativeModel = this.vertexAI.getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          responseMimeType: 'audio/mp3',
          // @ts-ignore - speechConfig is experimental/preview
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceConfig.voiceName
              }
            }
          }
        }
      });

      // Generate audio
      const result = await generativeModel.generateContent(request.text);
      const response = result.response;

      // Extract audio data - Vertex AI returns base64-encoded audio
      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!audioBase64) {
        throw new Error('No audio content returned from Vertex AI');
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');

      // Write to file
      const writeFile = util.promisify(fs.writeFile);
      await writeFile(outputPath, audioBuffer, 'binary');

      const duration = Date.now() - startTime;
      console.log('[Gemini TTS] Synthesis complete:', {
        speaker: request.speaker,
        language: langCode,
        voice: voiceConfig.voiceName,
        durationMs: duration,
        audioSize: audioBuffer.length,
        outputPath
      });

      return outputPath;
    } catch (error: any) {
      console.error('[Gemini TTS] Synthesis failed:', {
        speaker: request.speaker,
        language: langCode,
        voice: voiceConfig.voiceName,
        error: error.message,
        characterCount: request.text.length,
        stack: error.stack
      });

      // Return user-friendly error message
      if (error.message?.includes('permission') || error.message?.includes('403')) {
        throw new Error(`Vertex AI permission denied. Ensure service account has access to Gemini TTS model.`);
      } else if (error.message?.includes('quota')) {
        throw new Error(`Vertex AI quota exceeded. Check your usage in Google Cloud Console.`);
      } else if (error.message?.includes('not found') || error.message?.includes('404')) {
        throw new Error(`Gemini TTS model not available in region ${this.config.location}. Model: ${this.config.model}`);
      }

      throw new Error(`Gemini TTS (Vertex AI) failed: ${error.message}`);
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

  private getVoiceConfig(speaker: string, langCode: string): GeminiVoiceConfig {
    // Try to get voice for specific language
    const langVoices = this.config.voices[langCode];
    if (langVoices && langVoices[speaker]) {
      return langVoices[speaker];
    }

    // Fallback to English voice (works for all languages)
    const enVoices = this.config.voices['en'];
    if (enVoices && enVoices[speaker]) {
      return enVoices[speaker];
    }

    // Ultimate fallback
    return {
      voiceName: 'Puck',
      description: 'Default energetic voice'
    };
  }
}
