/**
 * Provider composition — the ONE place that decides which providers exist.
 *
 * Everything upstream (Director, timeline, renderer) is unaware of this file.
 * Changing the provider mix is an edit here plus, at most, an env var.
 *
 * Registration order does not matter: `AssetResolver` sorts by
 * `providerPriority` (non-generative first, then cost, then name), so the
 * cheapest safe source always wins and generation is genuinely a last resort.
 */

import { AssetResolver, assetResolver } from './AssetResolver';
import { CatalogueProvider } from './providers/CatalogueProvider';
import { GeneratedMusicProvider } from './providers/GeneratedMusicProvider';
import { GeneratedSoundProvider } from './providers/GeneratedSoundProvider';
import {
  AmbienceProvider,
  CC0MusicProvider,
  CC0SoundProvider,
  LicensedMusicProvider,
  LicensedSFXProvider,
  type LibraryTrack,
} from './providers/ExternalLibraryProviders';
import type { AssetManifest } from '../../services/media/assets/AssetManifest';
import { boolEnvLocal } from './envHelpers';

export interface ProviderSetupOptions {
  /** Existing catalogue, wrapped as the free built-in provider. */
  manifest?: AssetManifest;
  /** Populate to activate the licensed/CC0 providers. */
  licensedMusic?: LibraryTrack[];
  cc0Music?: LibraryTrack[];
  cc0Sound?: LibraryTrack[];
  licensedSfx?: LibraryTrack[];
  ambience?: LibraryTrack[];
  /**
   * Allow paid generation. Default follows MUSIC_GEN_ENABLED (off), so no code
   * path can start billing without an explicit opt-in.
   */
  allowGeneratedMusic?: boolean;
  /** Generated SFX is the weakest category — separate, stricter opt-in. */
  allowGeneratedSfx?: boolean;
  /** Target resolver. Defaults to the shared singleton. */
  resolver?: AssetResolver;
}

/**
 * Build the default provider stack.
 *
 * Resolution order that results:
 *   1. builtin-catalogue   free, existing assets
 *   2. cc0-music / cc0-sound / ambience-library / licensed-*   free, inert until indexed
 *   3. vertex-lyria / vertex-sound-gen   paid, only if explicitly enabled
 */
export function registerDefaultProviders(
  options: ProviderSetupOptions = {}
): AssetResolver {
  const resolver = options.resolver ?? assetResolver;

  // ── Free, non-generative ───────────────────────────────────────────────
  if (options.manifest) {
    resolver.register(new CatalogueProvider(options.manifest));
  }

  // Registered even when empty: an unindexed library returns null and costs
  // nothing, and having it present means activating it later is data-only.
  resolver.register(new CC0MusicProvider(options.cc0Music ?? []));
  resolver.register(new CC0SoundProvider(options.cc0Sound ?? []));
  resolver.register(new AmbienceProvider(options.ambience ?? []));
  resolver.register(new LicensedMusicProvider(options.licensedMusic ?? []));
  resolver.register(new LicensedSFXProvider(options.licensedSfx ?? []));

  // ── Paid, generative — opt-in only ─────────────────────────────────────
  const allowMusic =
    options.allowGeneratedMusic ?? boolEnvLocal('MUSIC_GEN_ENABLED', false);
  if (allowMusic) {
    resolver.register(new GeneratedMusicProvider());
  }

  const allowSfx = options.allowGeneratedSfx ?? boolEnvLocal('SOUND_GEN_ENABLED', false);
  if (allowSfx) {
    resolver.register(
      new GeneratedSoundProvider({
        enableSfx: options.allowGeneratedSfx ?? boolEnvLocal('SOUND_GEN_SFX_ENABLED', true), // Default true when SOUND_GEN_ENABLED
      })
    );
  }

  return resolver;
}
