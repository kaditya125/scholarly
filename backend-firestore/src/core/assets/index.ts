/**
 * Barrel for the asset resolution layer.
 *
 * Import from here so the internal file layout can change without touching
 * call sites.
 */

export * from './IAudioAssetProvider';
export * from './AssetRegistry';
export * from './AssetResolver';
export * from './registerProviders';
export * from './prompts/musicPrompts';
export * from './providers/CatalogueProvider';
export * from './providers/GeneratedMusicProvider';
export * from './providers/GeneratedSoundProvider';
export * from './providers/ExternalLibraryProviders';
