/**
 * Local env helpers.
 *
 * Kept out of `config/featureFlags` deliberately: these are asset-provider
 * plumbing switches, not product feature flags, and mixing the two makes the
 * flag surface harder to audit.
 */

/** Parse a boolean env var. Anything other than a truthy token is false. */
export function boolEnvLocal(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return fallback;
}
