/**
 * CLI timeline inspector.
 *
 *   npm run inspect:timeline -- --user <uid> --podcast <podcastId> [--dry-run]
 *                               [--intensity subtle|balanced|dramatic]
 *                               [--persist] [--json]
 *
 * Exists so the primary debugging surface works over SSH and in CI, with no UI
 * and no admin session. Read-only unless `--persist` is passed.
 *
 * Exit codes:
 *   0  inspected successfully, no invariant errors
 *   1  usage error or unrecoverable failure
 *   2  inspected, but the timeline has invariant ERRORS (useful for CI gating)
 */

import { AssetManifest, emptyAssetManifest } from '../services/media/assets/AssetManifest';
import { directorDryRun } from '../core/director/inspector/DirectorDryRun';
import { renderReport } from '../core/director/inspector/renderReport';

interface Args {
  userId?: string;
  podcastId?: string;
  dryRun: boolean;
  persist: boolean;
  json: boolean;
  intensity?: 'subtle' | 'balanced' | 'dramatic';
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, persist: false, json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--user':
      case '-u':
        args.userId = next();
        break;
      case '--podcast':
      case '-p':
        args.podcastId = next();
        break;
      case '--dry-run':
      case '-d':
        args.dryRun = true;
        break;
      case '--persist':
        args.persist = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--intensity':
      case '-i': {
        const v = next();
        if (v === 'subtle' || v === 'balanced' || v === 'dramatic') args.intensity = v;
        break;
      }
      default:
        break;
    }
  }
  return args;
}

function usage(): void {
  console.log(
    `
Timeline Inspector

  npm run inspect:timeline -- --user <uid> --podcast <podcastId> [options]

Options
  -u, --user <uid>            Owner of the podcast (required)
  -p, --podcast <id>          Podcast id (required)
  -d, --dry-run               Run Producer + Director now instead of reading a
                              stored timeline. Use this before shadow mode is on.
  -i, --intensity <level>     subtle | balanced | dramatic  (dry run only)
      --persist               Save the plan + timeline (dry run only)
      --json                  Emit raw JSON instead of the ASCII report

Examples
  npm run inspect:timeline -- -u abc123 -p pod_xyz --dry-run
  npm run inspect:timeline -- -u abc123 -p pod_xyz -d -i balanced --json
`.trim()
  );
}

/** Load the asset catalogue from Firestore config, if one is configured. */
async function loadManifest(): Promise<AssetManifest> {
  try {
    const { db } = await import('../config/firebase');
    const doc = await db.collection('config').doc('audioAssetCatalogue').get();
    if (!doc.exists) {
      console.warn(
        '[inspect] No asset catalogue at config/audioAssetCatalogue — asset checks will report everything as missing.\n'
      );
      return emptyAssetManifest;
    }
    const { manifest, errors } = AssetManifest.from(doc.data());
    for (const e of errors) console.warn(`[inspect] catalogue: ${e}`);
    return manifest;
  } catch (err: any) {
    console.warn(`[inspect] Could not load catalogue: ${err?.message}`);
    return emptyAssetManifest;
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.userId || !args.podcastId) {
    usage();
    return 1;
  }

  const manifest = await loadManifest();

  try {
    if (args.dryRun) {
      const result = await directorDryRun.run(args.userId, args.podcastId, {
        persist: args.persist,
        cinematicIntensity: args.intensity,
        manifest,
      });

      if (args.json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else {
        console.log(renderReport(result.report));
        console.log(
          `\nTimings: producer ${result.timings.producerMs}ms · ` +
            `director ${result.timings.directorMs}ms · total ${result.timings.totalMs}ms` +
            (result.persisted ? ' · PERSISTED' : '')
        );
      }
      return result.report.validation.errors.length > 0 ? 2 : 0;
    }

    const report = await directorDryRun.inspectStored(
      args.userId,
      args.podcastId,
      manifest
    );
    if (!report) {
      console.error(
        `No stored timeline for ${args.podcastId}. Re-run with --dry-run to generate one.`
      );
      return 1;
    }

    console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));
    return report.validation.errors.length > 0 ? 2 : 0;
  } catch (err: any) {
    console.error(`[inspect] ${err?.message || err}`);
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
