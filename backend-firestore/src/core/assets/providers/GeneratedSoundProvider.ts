/**
 * GeneratedSoundProvider — generates ambience beds and one-shot SFX.
 *
 * Separate class from GeneratedMusicProvider because the two have genuinely
 * different economics and quality profiles:
 *
 *   - Ambience is long, loopable, and reused across many episodes. Generating it
 *     once and caching forever is excellent value.
 *   - SFX are short, extremely numerous, and the category where generated audio
 *     is currently WEAKEST — text-to-music models produce musical interpretations
 *     of "door", not a door. So this provider reports LOW confidence for SFX and
 *     is registered at a cost that keeps it behind any catalogue or CC0 source.
 *
 * The honest position: for SFX, a CC0 library will beat this. The provider exists
 * so the pipeline is complete and testable end-to-end, not because generated SFX
 * is the right long-term answer. `SFX_CONFIDENCE` encodes that judgement in a
 * single place rather than burying it in a comment.
 */

import { logger } from '../../../utils/logger';
import type {
  IAudioAssetProvider,
  ResolveContext,
  ResolvedAsset,
} from '../IAudioAssetProvider';
import type { AssetKind } from '../../director/schema/common.schema';
import type { AssetRequirement } from '../../director/schema/requirement.schema';
import { buildSoundPrompt, NEGATIVE_PROMPT } from '../prompts/musicPrompts';
import {
  defaultVertexGenerate,
  FirebaseAudioStorageWriter,
  stableSeed,
  wavDurationMs,
  type AudioStorageWriter,
  type MusicGenerationFn,
} from './GeneratedMusicProvider';

const PROJECT_ID =
  process.env.GOOGLE_VERTEX_PROJECT || process.env.GCLOUD_PROJECT || '';

const COST_PER_CLIP_USD =
  Number.parseFloat(process.env.SOUND_GEN_COST_USD || '') || 0.06;

/**
 * Deliberately low. A generated "door" is a musical impression of a door. This
 * value is what makes the resolver prefer literally any catalogue entry.
 */
export const SFX_CONFIDENCE = 0.45;
/** Ambience generation is genuinely good — drones and beds are in-distribution. */
export const AMBIENCE_CONFIDENCE = 0.8;

export interface GeneratedSoundProviderOptions {
  storage?: AudioStorageWriter;
  generate?: MusicGenerationFn;
  storagePrefix?: string;
  /**
   * Whether to attempt SFX at all. Default false: generated SFX is the weakest
   * link in the chain, and enabling it by default would spend money producing
   * audio a human will most likely reject.
   */
  enableSfx?: boolean;
}

export class GeneratedSoundProvider implements IAudioAssetProvider {
  readonly name = 'vertex-sound-gen';
  readonly providerKind = 'generated' as const;
  readonly supports: readonly AssetKind[] = ['ambience', 'sfx'];
  readonly isGenerative = true;
  readonly estimatedCostUsd = COST_PER_CLIP_USD;

  private readonly storage: AudioStorageWriter;
  private readonly generateFn: MusicGenerationFn | null;
  private readonly storagePrefix: string;
  private readonly enableSfx: boolean;

  constructor(options: GeneratedSoundProviderOptions = {}) {
    this.storage = options.storage ?? new FirebaseAudioStorageWriter();
    // Default to the same Vertex AI generation function used for music
    this.generateFn = options.generate ?? defaultVertexGenerate;
    this.storagePrefix = options.storagePrefix ?? 'audio-assets/generated/sound';
    this.enableSfx = options.enableSfx ?? false;
  }

  canResolve(requirement: AssetRequirement): boolean {
    if (!this.supports.includes(requirement.kind)) return false;
    if (requirement.kind === 'sfx' && !this.enableSfx) return false;
    if (!this.generateFn) return false;
    return PROJECT_ID.length > 0;
  }

  async resolve(
    requirement: AssetRequirement,
    context: ResolveContext
  ): Promise<ResolvedAsset | null> {
    if (!context.allowGeneration) return null;
    if (!this.generateFn) return null;
    if (context.budgetRemainingUsd < this.estimatedCostUsd) return null;

    const prompt = buildSoundPrompt(requirement);

    let generated: { audioBase64: string; mimeType: string } | null;
    try {
      generated = await this.generateFn({
        prompt,
        negativePrompt: NEGATIVE_PROMPT,
        seed: stableSeed(prompt),
        signal: context.signal,
      });
    } catch (error) {
      logger.warn('[GeneratedSoundProvider] Generation failed', {
        kind: requirement.kind,
        category: requirement.category,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (!generated?.audioBase64) return null;
    const bytes = Buffer.from(generated.audioBase64, 'base64');
    if (bytes.length === 0) return null;

    const { createHash } = await import('crypto');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const assetId = `gen_${requirement.kind}_${checksum.slice(0, 16)}`;
    const extension = generated.mimeType.includes('wav') ? 'wav' : 'mp3';

    let storagePath: string;
    try {
      storagePath = await this.storage.write({
        bytes,
        contentType: generated.mimeType,
        destinationPath: `${this.storagePrefix}/${requirement.kind}/${assetId}.${extension}`,
      });
    } catch (error) {
      logger.warn('[GeneratedSoundProvider] Storage write failed', {
        assetId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    const durationMs = wavDurationMs(bytes) ?? 30_000;
    const isAmbience = requirement.kind === 'ambience';

    return {
      assetId,
      storagePath,
      durationMs,
      // Ambience must tile; a one-shot effect must not.
      loopable: isAmbience,
      loopStartMs: isAmbience ? 0 : undefined,
      loopEndMs: isAmbience ? durationMs : undefined,
      provider: this.name,
      providerKind: this.providerKind,
      providerModel: process.env.SOUND_GEN_MODEL || 'lyria-002',
      prompt,
      licence: 'generated',
      confidence: isAmbience ? AMBIENCE_CONFIDENCE : SFX_CONFIDENCE,
      cached: false,
      costUsd: this.estimatedCostUsd,
    };
  }
}
