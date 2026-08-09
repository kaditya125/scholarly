import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';
import util from 'util';
import path from 'path';
import { logger } from '../../utils/logger';
import { Telemetry } from '../../lib/telemetry';

/**
 * TTS service — Google Cloud text-to-speech front door for every podcast, timeline,
 * and voice-preview call in the backend.
 *
 * Two things this file has to get right, both of which had been silently reverted:
 *
 *   1. LOAD `config/tts.config.json`. The config is where all the Chirp 3 HD
 *      voice ids live (Hindi + English + Hinglish, per role). Without loading
 *      it, the service falls back to a small hardcoded English map and every
 *      Hindi request comes out with an English Journey voice speaking Hindi
 *      text — which is exactly the "robotic voice" symptom the studio was
 *      hitting.
 *
 *   2. EXPOSE `voiceSupportsProsody(voiceName)`. VoiceEngine imports this to
 *      decide whether to send pitch/rate to Google — Chirp 3 HD and Journey
 *      REJECT SSML/prosody entirely (INVALID_ARGUMENT) so the flag is what
 *      keeps synthesis from failing silently for the premium voices.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TTSRequest {
  text: string;
  speaker: string;
  /** Language of the podcast — 'en' | 'hi' | 'hinglish'. Selects the voice family. */
  language?: string;
  /** Optional prosody overrides. Ignored for Chirp 3 HD / Journey voices. */
  speakingRate?: number;
  pitch?: number;
  /** Cost-attribution hooks. */
  userId?: string;
  podcastId?: string;
}

export interface TTSProvider {
  synthesize(request: TTSRequest, outputPath: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

interface VoiceConfig {
  languageCode: string;
  name: string;
  description?: string;
}

interface TTSConfigShape {
  provider: string;
  fallbackProvider?: string;
  voices: Record<string, Record<string, VoiceConfig>>;
  defaultVoice: Record<string, { languageCode: string; name: string }>;
  audioConfig?: {
    format?: string;
    bitrate?: number;
    sampleRate?: number;
    enableSSML?: boolean;
  };
  generationConfig?: {
    batchSize?: number;
    retryAttempts?: number;
    timeoutMs?: number;
    enableCaching?: boolean;
  };
}

/** Locate the tts.config.json from either CWD or dist layout. */
function findConfigPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'config', 'tts.config.json'),
    path.join(process.cwd(), 'backend-firestore', 'config', 'tts.config.json'),
    path.resolve(__dirname, '../../../config/tts.config.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let cachedConfig: TTSConfigShape | null = null;
function loadConfig(): TTSConfigShape | null {
  if (cachedConfig) return cachedConfig;
  const p = findConfigPath();
  if (!p) {
    logger.warn('[TTS] tts.config.json not found — falling back to hardcoded English voices.');
    return null;
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    cachedConfig = JSON.parse(raw) as TTSConfigShape;
    const voiceCount = Object.values(cachedConfig.voices || {}).reduce(
      (sum, langMap) => sum + Object.keys(langMap || {}).length,
      0
    );
    logger.info(`[TTS] Voice configuration loaded: ${voiceCount} voices from ${p}`);
    return cachedConfig;
  } catch (err: any) {
    logger.error(`[TTS] Failed to parse tts.config.json: ${err?.message || err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Voice-family prosody support
// ---------------------------------------------------------------------------

/**
 * Chirp 3 HD and Journey voices REJECT `pitch` / `speakingRate` params entirely
 * (Google returns INVALID_ARGUMENT). VoiceEngine calls this before it ever
 * sends prosody to the synthesizer, so the check must be exact.
 */
export function voiceSupportsProsody(voiceName: string | undefined | null): boolean {
  if (!voiceName) return true;
  const n = voiceName.toLowerCase();
  if (n.includes('chirp3') || n.includes('chirp-3') || n.includes('chirp3-hd')) return false;
  if (n.includes('journey')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Language normalization
// ---------------------------------------------------------------------------

/**
 * The rest of the app uses free-form language labels ('English', 'Hindi',
 * 'Hinglish', 'हिन्दी', 'hi', etc.). The config keys those under three ids;
 * this maps whatever the caller sends to one of `en | hi | hinglish`.
 */
function normalizeLanguage(input: string | undefined): 'en' | 'hi' | 'hinglish' {
  if (!input) return 'en';
  const s = String(input).toLowerCase().trim();
  if (s === 'hi' || s === 'hindi' || s.startsWith('hi-') || /[\u0900-\u097F]/.test(input)) return 'hi';
  if (s.includes('hinglish') || s.includes('hindi-english') || s === 'hi_en') return 'hinglish';
  if (s === 'en' || s === 'english' || s.startsWith('en-')) return 'en';
  return 'en';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

// Rough per-character costs for Chirp 3 HD (Studio-tier pricing, ≈$0.000016/char).
// Only used for telemetry; the real bill comes from GCP.
const COST_PER_CHAR = 0.000016;

interface CircuitState {
  failures: number;
  openUntil: number; // epoch ms; 0 = closed
}

export class GoogleCloudTTSProvider implements TTSProvider {
  private client: TextToSpeechClient;
  private config: TTSConfigShape | null;
  private circuit: CircuitState = { failures: 0, openUntil: 0 };
  private readonly circuitThreshold = 5;
  private readonly circuitCooldownMs = 60_000;

  // Legacy fallback map for when tts.config.json is missing. Kept identical to
  // the historical defaults so behaviour degrades gracefully instead of
  // crashing when the file isn't there.
  private legacyVoiceMap: Record<string, VoiceConfig> = {
    Host: { languageCode: 'en-US', name: 'en-US-Journey-F' },
    'AI Tutor': { languageCode: 'en-US', name: 'en-US-Journey-D' },
    Student: { languageCode: 'en-US', name: 'en-US-Journey-O' },
    Teacher: { languageCode: 'en-US', name: 'en-US-Studio-O' },
    'Subject Expert': { languageCode: 'en-US', name: 'en-US-Journey-F' },
    'Exam Coach': { languageCode: 'en-US', name: 'en-US-Studio-Q' },
  };
  private legacyDefault: VoiceConfig = { languageCode: 'en-US', name: 'en-US-Journey-F' };

  constructor() {
    logger.info('[TTS] Initializing provider: google-cloud');
    this.client = new TextToSpeechClient();
    this.config = loadConfig();
    logger.info(
      `[TTS] Circuit breaker enabled: ${this.circuitThreshold} consecutive failures \u2192 ${this.circuitCooldownMs / 1000}s cooldown`
    );
  }

  /** Pick the concrete Google voice for a (language, speaker) tuple. */
  private resolveVoice(speaker: string, language: string): VoiceConfig {
    const lang = normalizeLanguage(language);
    if (this.config) {
      const family = this.config.voices?.[lang];
      if (family && family[speaker]) return family[speaker];
      const fallback = this.config.defaultVoice?.[lang];
      if (fallback) return { languageCode: fallback.languageCode, name: fallback.name };
    }
    return this.legacyVoiceMap[speaker] || this.legacyDefault;
  }

  private circuitOpen(): boolean {
    return Date.now() < this.circuit.openUntil;
  }

  private noteFailure(err: any) {
    this.circuit.failures += 1;
    if (this.circuit.failures >= this.circuitThreshold) {
      this.circuit.openUntil = Date.now() + this.circuitCooldownMs;
      logger.warn(
        `[TTS] Circuit breaker OPEN after ${this.circuit.failures} failures; pausing synthesis for ${this.circuitCooldownMs / 1000}s. Last error: ${err?.message || err}`
      );
    }
  }

  private noteSuccess() {
    if (this.circuit.failures > 0 || this.circuit.openUntil > 0) {
      this.circuit.failures = 0;
      this.circuit.openUntil = 0;
    }
  }

  async synthesize(request: TTSRequest, outputPath: string): Promise<string> {
    if (this.circuitOpen()) {
      throw new Error('TTS circuit breaker is open — retry after cooldown.');
    }

    const voice = this.resolveVoice(request.speaker, request.language || 'en');
    const prosody = voiceSupportsProsody(voice.name);

    // Build audioConfig honouring the tts.config.json audioConfig block when
    // present. Chirp 3 HD needs 24 kHz and MP3 for the mixer's filter graph,
    // which is what the config already specifies.
    const cfgAudio = this.config?.audioConfig || {};
    const audioConfig: any = {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: cfgAudio.sampleRate || 24000,
    };
    if (prosody) {
      if (typeof request.speakingRate === 'number') audioConfig.speakingRate = request.speakingRate;
      if (typeof request.pitch === 'number') audioConfig.pitch = request.pitch;
    }

    const payload = {
      input: { text: request.text },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig,
    };

    const started = Date.now();
    try {
      const [response] = await this.client.synthesizeSpeech(payload);
      if (!response.audioContent) {
        throw new Error('TTS service returned no audio content');
      }

      const writeFile = util.promisify(fs.writeFile);
      await writeFile(outputPath, response.audioContent, 'binary');

      const latencyMs = Date.now() - started;
      const chars = request.text.length;
      const estCostUsd = chars * COST_PER_CHAR;

      Telemetry.logLatency('tts_synthesize', latencyMs, {
        voice: voice.name,
        language: voice.languageCode,
        chars,
      });
      Telemetry.logCost('gcp-tts', chars, 'characters', {
        model: voice.name,
        userId: request.userId,
        cost: estCostUsd,
      } as any);

      this.noteSuccess();
      return outputPath;
    } catch (err: any) {
      this.noteFailure(err);
      logger.error(`[TTS] Synthesis failed for voice ${voice.name}: ${err?.message || err}`);
      throw err;
    }
  }
}

// Singleton instance to be used across the application
export const ttsService = new GoogleCloudTTSProvider();
