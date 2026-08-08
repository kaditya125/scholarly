/**
 * Feature Flags
 * 
 * Centralized feature flag management for gradual rollout of new features.
 * Supports environment variables, localStorage overrides, and user-based targeting.
 */

/**
 * Feature flag configuration
 */
export interface FeatureFlags {
  // AI Workspace: Conversational podcast planning interface
  aiWorkspace: boolean;
  
  // Future flags can be added here
  // videoGeneration: boolean;
  // articleGeneration: boolean;
}

/**
 * Default feature flags (production)
 */
const DEFAULT_FLAGS: FeatureFlags = {
  aiWorkspace: false, // Disabled by default for gradual rollout
};

/**
 * Get feature flags from environment variables
 */
function getEnvFlags(): Partial<FeatureFlags> {
  return {
    aiWorkspace: import.meta.env.VITE_USE_AI_WORKSPACE === 'true',
  };
}

/**
 * Get feature flags from localStorage (for testing/overrides)
 * Prefix: scholarly_feature_
 */
function getLocalStorageFlags(): Partial<FeatureFlags> {
  try {
    return {
      aiWorkspace: localStorage.getItem('scholarly_feature_aiWorkspace') === 'true',
    };
  } catch {
    return {};
  }
}

/**
 * Merge flags with priority: localStorage > env > defaults
 */
function mergeFlags(): FeatureFlags {
  const envFlags = getEnvFlags();
  const localFlags = getLocalStorageFlags();

  return {
    ...DEFAULT_FLAGS,
    ...envFlags,
    ...localFlags,
  };
}

/**
 * Feature flags instance (singleton)
 */
let flagsCache: FeatureFlags | null = null;

/**
 * Get current feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  if (!flagsCache) {
    flagsCache = mergeFlags();
  }
  return flagsCache;
}

/**
 * Refresh feature flags (call after localStorage changes)
 */
export function refreshFeatureFlags(): FeatureFlags {
  flagsCache = mergeFlags();
  return flagsCache;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return getFeatureFlags()[feature];
}

/**
 * Enable a feature flag in localStorage (for testing)
 */
export function enableFeature(feature: keyof FeatureFlags): void {
  try {
    localStorage.setItem(`scholarly_feature_${feature}`, 'true');
    refreshFeatureFlags();
    console.log(`[FeatureFlags] Enabled feature: ${feature}`);
  } catch (err) {
    console.error(`[FeatureFlags] Failed to enable feature ${feature}:`, err);
  }
}

/**
 * Disable a feature flag in localStorage
 */
export function disableFeature(feature: keyof FeatureFlags): void {
  try {
    localStorage.setItem(`scholarly_feature_${feature}`, 'false');
    refreshFeatureFlags();
    console.log(`[FeatureFlags] Disabled feature: ${feature}`);
  } catch (err) {
    console.error(`[FeatureFlags] Failed to disable feature ${feature}:`, err);
  }
}

/**
 * Reset a feature flag to default (remove localStorage override)
 */
export function resetFeature(feature: keyof FeatureFlags): void {
  try {
    localStorage.removeItem(`scholarly_feature_${feature}`);
    refreshFeatureFlags();
    console.log(`[FeatureFlags] Reset feature: ${feature}`);
  } catch (err) {
    console.error(`[FeatureFlags] Failed to reset feature ${feature}:`, err);
  }
}

/**
 * Hook for React components to use feature flags
 * Note: This is a simple getter. For reactive updates, wrap in useState/useEffect
 */
export function useFeatureFlags(): FeatureFlags {
  return getFeatureFlags();
}

// Export for console debugging
if (typeof window !== 'undefined') {
  (window as any).scholarlyFeatureFlags = {
    get: getFeatureFlags,
    enable: enableFeature,
    disable: disableFeature,
    reset: resetFeature,
    refresh: refreshFeatureFlags,
  };
}
