/**
 * GeneratedMusicProvider — obtains music by text-to-music generation.
 *
 * Currently backed by Lyria on Vertex AI, but NOTHING outside this file knows
 * that. The model id, host and pricing are all configuration; replacing Lyria
 * with another generator means editing this file only. That is the whole point
 * of the provider seam.
 *
 * Hard constraints of the current model (verified against the Vertex model card,
 * lyria-002, GA 2025-10-27) that shape the design:
 *
 *   - MAX CLIP 32.8s. A 3-minute music bed CANNOT be generated in one call.
 *     So this provider always produces a LOOPABLE clip and lets the renderer
 *     tile it. Requirement `durationMs` is therefore treated as a hint, not a
 *     target — which is also why it is excluded from the cache fingerprint.
 *   - GLOBAL REGION ONLY. Regional endpoints 404, exactly as retired Imagen did.
 *   - 10 REQUESTS/MINUTE. The resolver calls providers sequentially for this
 *     reason; this class additionally paces itself.
 *   - INSTRUMENTAL ONLY. Fine for beds — vocals would fight narration anyway.
 */

import { logger } from '../../../utils/logger';
import type {
  IAudioAssetProvider,
  ResolveContext,
  ResolvedAsset,
} from '../IAudioAssetProvider';
import type { AssetKind } from '../../director/schema/common.schema';
import type { AssetRequirement } from '../../director/schema/requirement.schema';
import { buildMusicPrompt, NEGATIVE_PROMPT } from '../prompts/musicPrompts';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROJECT_ID =
  process.env.GOOGLE_VERTEX_PROJECT || process.env.GCLOUD_PROJECT || '';

/** Lyria is served from the global endpoint only. */
const LOCATION = (process.env.MUSIC_GEN_LOCATION || 'global').trim();

/**
 * Configurable so a model retirement is an env change, not a deploy. The Gemini
 * image family churned twice in a year; assume music will too.
 */
const MODEL = (process.env.MUSIC_GEN_MODEL || 'lyria-002').trim();

/** Model ceiling is 32.8s; stay just under it. */
export const MAX_CLIP_MS = 32_000;

/**
 * Rough per-clip cost, USD. Used only for budget ordering, so an approximation
 * is fine — but it must never be 0, or the resolver would treat generation as
 * free and prefer it over the catalogue.
 */
const COST_PER_CLIP_USD = Number.parseFloat(process.env.MUSIC_GEN_COST_USD || '') || 0.06;

/** Quota is 10 rpm; 7s spacing leaves headroom for other callers. */
const MIN_CALL_SPACING_MS = 7_000;

function vertexHost(location: string): string {
  return location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;
}

// ---------------------------------------------------------------------------
// Storage seam
// ---------------------------------------------------------------------------

/**
 * How a generated clip is persisted. Injected so tests never touch GCS and so
 * the storage backend can change without touching generation logic.
 */
export interface AudioStorageWriter {
  /** Returns the storage path the bytes landed at. */
  write(params: {
    bytes: Buffer;
    contentType: string;
    destinationPath: string;
  }): Promise<string>;
}

/** Default writer: Firebase Storage, matching the cover-image service. */
export class FirebaseAudioStorageWriter implements AudioStorageWriter {
  async write(params: {
    bytes: Buffer;
    contentType: string;
    destinationPath: string;
  }): Promise<string> {
    const { getStorage } = await import('firebase-admin/storage');
    const bucket = getStorage().bucket();
    const file = bucket.file(params.destinationPath);
    await file.save(params.bytes, {
      contentType: params.contentType,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    return params.destinationPath;
  }
}

/** Injected so tests can stub the network without an HTTP interceptor. */
export type MusicGenerationFn = (params: {
  prompt: string;
  negativePrompt: string;
  seed: number;
  signal?: AbortSignal;
}) => Promise<{ audioBase64: string; mimeType: string } | null>;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface GeneratedMusicProviderOptions {
  storage?: AudioStorageWriter;
  generate?: MusicGenerationFn;
  /** Storage prefix for generated audio. */
  storagePrefix?: string;
}

export class GeneratedMusicProvider implements IAudioAssetProvider {
  readonly name = 'vertex-lyria';
  readonly providerKind = 'generated' as const;
  /** Music and stingers only. SFX/ambience have their own provider. */
  readonly supports: readonly AssetKind[] = ['music', 'stinger'];
  readonly isGenerative = true;
  readonly estimatedCostUsd = COST_PER_CLIP_USD;

  private readonly storage: AudioStorageWriter;
  private readonly generateFn: MusicGenerationFn;
  private readonly storagePrefix: string;
  private lastCallAt = 0;

  constructor(options: GeneratedMusicProviderOptions = {}) {
    this.storage = options.storage ?? new FirebaseAudioStorageWriter();
    this.generateFn = options.generate ?? defaultVertexGenerate;
    this.storagePrefix = options.storagePrefix ?? 'audio-assets/generated/music';
  }

  canResolve(requirement: AssetRequirement): boolean {
    if (!this.supports.includes(requirement.kind)) return false;
    // Without a project we cannot authenticate; skip rather than fail later.
    return PROJECT_ID.length > 0;
  }

  async resolve(
    requirement: AssetRequirement,
    context: ResolveContext
  ): Promise<ResolvedAsset | null> {
    if (!context.allowGeneration) return null;
    if (context.budgetRemainingUsd < this.estimatedCostUsd) return null;

    const prompt = buildMusicPrompt(requirement);
    // Deterministic seed: the same requirement produces the same audio, so a
    // regenerated library is reproducible and A/B tests stay comparable.
    const seed = stableSeed(prompt);

    await this.pace();

    let generated: { audioBase64: string; mimeType: string } | null;
    try {
      generated = await this.generateFn({
        prompt,
        negativePrompt: NEGATIVE_PROMPT,
        seed,
        signal: context.signal,
      });
    } catch (error) {
      logger.warn('[GeneratedMusicProvider] Generation failed', {
        category: requirement.category,
        emotion: requirement.emotion,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (!generated?.audioBase64) return null;

    const bytes = Buffer.from(generated.audioBase64, 'base64');
    if (bytes.length === 0) return null;

    const checksum = await sha256(bytes);
    const assetId = `gen_music_${checksum.slice(0, 16)}`;
    const extension = generated.mimeType.includes('wav') ? 'wav' : 'mp3';
    const destinationPath = `${this.storagePrefix}/${assetId}.${extension}`;

    let storagePath: string;
    try {
      storagePath = await this.storage.write({
        bytes,
        contentType: generated.mimeType,
        destinationPath,
      });
    } catch (error) {
      logger.warn('[GeneratedMusicProvider] Storage write failed', {
        destinationPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    const durationMs = wavDurationMs(bytes) ?? MAX_CLIP_MS;

    logger.info('[GeneratedMusicProvider] Generated music asset', {
      assetId,
      category: requirement.category,
      emotion: requirement.emotion,
      intensity: requirement.intensity,
      durationMs,
      bytes: bytes.length,
      costUsd: this.estimatedCostUsd,
    });

    return {
      assetId,
      storagePath,
      durationMs,
      // Always declared loopable: the clip is far shorter than any bed needs to
      // be, so the renderer MUST tile it. Loop points are the whole clip; a
      // crossfade_self strategy hides the seam.
      loopable: true,
      loopStartMs: 0,
      loopEndMs: durationMs,
      provider: this.name,
      providerKind: this.providerKind,
      providerModel: MODEL,
      prompt,
      licence: 'generated',
      confidence: 0.9,
      cached: false,
      costUsd: this.estimatedCostUsd,
    };
  }

  /** Self-imposed spacing so a batch generation run does not trip the quota. */
  private async pace(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (this.lastCallAt > 0 && elapsed < MIN_CALL_SPACING_MS) {
      await new Promise((r) => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Vertex call
// ---------------------------------------------------------------------------

export const defaultVertexGenerate: MusicGenerationFn = async ({
  prompt,
  negativePrompt,
  seed,
  signal,
}) => {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();
  if (!token) {
    logger.warn('[GeneratedMusicProvider] No access token available');
    return null;
  }

  const url =
    `https://${vertexHost(LOCATION)}/v1/projects/${PROJECT_ID}` +
    `/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

  const axios = (await import('axios')).default;
  const response = await axios.post(
    url,
    {
      instances: [{ prompt, negative_prompt: negativePrompt, seed }],
      parameters: { sample_count: 1 },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
      signal,
    }
  );

  // Lyria returns predictions[].bytesBase64Encoded (camelCase over REST); accept
  // the snake_case variant too, as other Vertex media models differ.
  const prediction = response.data?.predictions?.[0];
  const audioBase64 =
    prediction?.bytesBase64Encoded ??
    prediction?.bytes_base64_encoded ??
    prediction?.audioContent;

  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) return null;

  return {
    audioBase64,
    mimeType: prediction?.mimeType || prediction?.mime_type || 'audio/wav',
  };
};

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Deterministic 31-bit seed from a prompt (FNV-1a). Same requirement → same
 * audio, which makes a regenerated asset library reproducible.
 */
export function stableSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Vertex rejects very large seeds; keep it comfortably in int32 range.
  return hash % 2_147_483_647;
}

/**
 * Read duration from a WAV header rather than trusting the model's advertised
 * clip length — a truncated or safety-filtered response is shorter, and a wrong
 * duration would desynchronise every downstream event.
 *
 * Returns null for non-WAV or malformed data.
 */
export function wavDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let byteRate = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ' && offset + 8 + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(offset + 16);
    } else if (chunkId === 'data') {
      if (byteRate <= 0) return null;
      return Math.round((chunkSize / byteRate) * 1000);
    }

    // Chunks are word-aligned.
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

async function sha256(buffer: Buffer): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(buffer).digest('hex');
}
