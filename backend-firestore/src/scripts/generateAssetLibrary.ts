/**
 * Generate (or report on) the MVP audio asset library.
 *
 * Usage:
 *   npm run generate:assets -- --dry-run          # plan + cost estimate, no calls
 *   npm run generate:assets -- --kind music       # one kind only
 *   npm run generate:assets -- --execute          # actually obtain assets
 *   npm run generate:assets -- --report           # what's already in the registry
 *
 * SAFETY: `--dry-run` is the DEFAULT. Generation costs real money and is
 * quota-limited, so it must be requested explicitly with `--execute`. A script
 * that bills by accident is a bug.
 *
 * The script never mentions a provider. It hands requirements to the resolver
 * and reports what came back, so it works unchanged against generated,
 * licensed or CC0 sources.
 */

import 'dotenv/config';
import {
  ALL_SFX,
  FULL_LIBRARY,
  MVP_AMBIENCE,
  MVP_LIBRARY,
  MVP_MUSIC,
  MVP_SFX,
  SFX_PHASE2,
  type LibrarySpecEntry,
} from '../core/assets/mvpLibrarySpec';
import { AssetResolver } from '../core/assets/AssetResolver';
import { assetRegistry } from '../core/assets/AssetRegistry';
import { registerDefaultProviders } from '../core/assets/registerProviders';
import { requirementFingerprint } from '../core/director/schema/requirement.schema';
import { AssetLibrary } from '../services/media/assets/AssetLibrary';

interface Args {
  execute: boolean;
  report: boolean;
  /**
   * 'sfx-missing' generates only the phase-2 SFX — the categories that had no
   * asset at all. That is the cheap, targeted run; 'sfx-all' and 'full' re-run
   * entries that already exist (the registry cache makes those free, but they
   * still cost a round trip).
   */
  kind: 'music' | 'ambience' | 'sfx' | 'sfx-missing' | 'sfx-all' | 'full' | 'all';
  budgetUsd: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const kindRaw = (get('--kind') || 'all').toLowerCase();
  const kind = (['music', 'ambience', 'sfx', 'sfx-missing', 'sfx-all', 'full'] as const).includes(
    kindRaw as never
  )
    ? (kindRaw as Args['kind'])
    : 'all';

  return {
    // Default OFF. Only an explicit --execute may spend money.
    execute: argv.includes('--execute'),
    report: argv.includes('--report'),
    kind,
    budgetUsd: Number.parseFloat(get('--budget') || '') || 3.0,
  };
}

function entriesFor(kind: Args['kind']): LibrarySpecEntry[] {
  switch (kind) {
    case 'music':
      return MVP_MUSIC;
    case 'ambience':
      return MVP_AMBIENCE;
    case 'sfx':
      return MVP_SFX;
    case 'sfx-missing':
      return SFX_PHASE2;
    case 'sfx-all':
      return ALL_SFX;
    case 'full':
      return FULL_LIBRARY;
    default:
      return MVP_LIBRARY;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const entries = entriesFor(args.kind);

  console.log('');
  console.log('═'.repeat(74));
  console.log('  MVP AUDIO ASSET LIBRARY');
  console.log('═'.repeat(74));
  console.log(`  mode      : ${args.execute ? 'EXECUTE (will incur cost)' : 'DRY RUN'}`);
  console.log(`  kind      : ${args.kind}`);
  console.log(`  entries   : ${entries.length}`);
  console.log(`  budget    : $${args.budgetUsd.toFixed(2)}`);
  console.log('');

  // ── Registry report mode ────────────────────────────────────────────────
  if (args.report) {
    const stats = await assetRegistry.stats();
    console.log('  REGISTRY CONTENTS');
    console.log(`    total assets   : ${stats.total}`);
    console.log(`    by kind        : ${JSON.stringify(stats.byKind)}`);
    console.log(`    by provider    : ${JSON.stringify(stats.byProvider)}`);
    console.log(`    by licence     : ${JSON.stringify(stats.byLicence)}`);
    console.log(`    total duration : ${(stats.totalDurationMs / 1000).toFixed(1)}s`);
    console.log(`    total reuses   : ${stats.totalUseCount}`);
    console.log('');
    return;
  }

  // ── Build the resolver ──────────────────────────────────────────────────
  const library = new AssetLibrary();
  const manifest = await library.loadManifest(true).catch(() => undefined);

  const resolver = registerDefaultProviders({
    manifest,
    resolver: new AssetResolver(assetRegistry),
    // Generation is enabled only in execute mode, regardless of env.
    allowGeneratedMusic: args.execute,
    allowGeneratedSfx: args.execute,
  });

  console.log(`  providers : ${resolver.providerNames().join(', ') || '(none)'}`);
  console.log('');

  // ── Show what already exists, so a re-run is cheap and obvious ──────────
  console.log('  PLAN');
  console.log('  ' + '─'.repeat(72));
  console.log(
    '  ' +
      'LABEL'.padEnd(26) +
      'FINGERPRINT'.padEnd(34) +
      'STATUS'
  );
  console.log('  ' + '─'.repeat(72));

  let alreadyHave = 0;
  const todo: LibrarySpecEntry[] = [];

  for (const entry of entries) {
    const fingerprint = requirementFingerprint(entry.requirement);
    const existing = await assetRegistry.findByFingerprint(fingerprint);
    if (existing) alreadyHave++;
    else todo.push(entry);

    console.log(
      '  ' +
        entry.label.slice(0, 25).padEnd(26) +
        fingerprint.slice(0, 33).padEnd(34) +
        (existing ? `cached (${existing.provider})` : 'needs resolution')
    );
  }

  console.log('  ' + '─'.repeat(72));
  console.log(`  cached: ${alreadyHave}   to resolve: ${todo.length}`);
  console.log('');

  if (todo.length === 0) {
    console.log('  Library is complete. Nothing to do.');
    console.log('');
    return;
  }

  if (!args.execute) {
    console.log('  DRY RUN — no providers were called and nothing was billed.');
    console.log('  Re-run with --execute to obtain the missing assets.');
    console.log('');
    return;
  }

  // ── Execute ─────────────────────────────────────────────────────────────
  console.log('  RESOLVING');
  console.log('  ' + '─'.repeat(72));

  const result = await resolver.resolveMany(
    todo.map((e) => e.requirement),
    { allowGeneration: true, budgetUsd: args.budgetUsd }
  );

  for (const entry of todo) {
    const outcome = result.outcomes.get(requirementFingerprint(entry.requirement));
    const asset = outcome?.asset;
    const trail = (outcome?.attempts ?? [])
      .map((a) => `${a.provider}:${a.outcome}`)
      .join(' → ');

    console.log(
      '  ' +
        entry.label.slice(0, 25).padEnd(26) +
        (asset
          ? `OK  ${asset.provider}  conf=${asset.confidence.toFixed(2)}  ` +
            `${(asset.durationMs / 1000).toFixed(1)}s  $${asset.costUsd.toFixed(3)}`
          : 'FAILED')
    );
    console.log('      ' + trail);
  }

  console.log('  ' + '─'.repeat(72));
  console.log('');
  console.log('  SUMMARY');
  console.log(`    resolved    : ${result.resolved}/${todo.length}`);
  console.log(`    unresolved  : ${result.unresolved}`);
  console.log(`    cache hits  : ${result.cacheHits}`);
  console.log(`    newly made  : ${result.generated}`);
  console.log(`    cost        : $${result.totalCostUsd.toFixed(4)}`);
  console.log(`    elapsed     : ${(result.totalMs / 1000).toFixed(1)}s`);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[generateAssetLibrary] Fatal error:', error);
    process.exit(1);
  });
