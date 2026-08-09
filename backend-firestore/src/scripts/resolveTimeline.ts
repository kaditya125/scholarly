/**
 * CLI timeline resolver.
 *
 *   npm run resolve:timeline -- --user <uid> --podcast <podcastId> [--force]
 *
 * Resolves a planned timeline by synthesizing all voice events via TTS and
 * recalculating timestamps. The resolved timeline is saved to Firestore.
 *
 * Idempotent: re-running on an already-resolved timeline is a no-op unless
 * --force is passed.
 *
 * Exit codes:
 *   0  resolved successfully or already resolved
 *   1  usage error or unrecoverable failure
 */

import { timelineResolverService } from '../services/timeline/timelineResolver.service';

interface Args {
  userId?: string;
  podcastId?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false };

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
      case '--force':
      case '-f':
        args.force = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function usage(): void {
  console.log(
    `
Timeline Resolver

  npm run resolve:timeline -- --user <uid> --podcast <podcastId> [options]

Options
  -u, --user <uid>            Owner of the podcast (required)
  -p, --podcast <id>          Podcast id (required)
  -f, --force                 Force re-resolution even if already resolved

Examples
  npm run resolve:timeline -- -u abc123 -p pod_xyz
  npm run resolve:timeline -- -u abc123 -p pod_xyz --force
`.trim()
  );
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.userId || !args.podcastId) {
    usage();
    return 1;
  }

  console.log('');
  console.log('═'.repeat(74));
  console.log('  TIMELINE RESOLVER');
  console.log('═'.repeat(74));
  console.log(`  user      : ${args.userId}`);
  console.log(`  podcast   : ${args.podcastId}`);
  console.log(`  force     : ${args.force}`);
  console.log('');

  try {
    const result = await timelineResolverService.resolve({
      userId: args.userId,
      podcastId: args.podcastId,
      force: args.force,
    });

    if (result.result.skipped) {
      console.log('  Timeline already resolved (use --force to re-resolve)');
      console.log('');
      return 0;
    }

    if (!result.success) {
      console.error(`  ERROR: ${result.result.error}`);
      console.log('');
      return 1;
    }

    console.log('  ✓ Resolution complete');
    console.log('');
    console.log('  RESULTS');
    console.log('  ' + '─'.repeat(72));
    console.log(`    Voice events synthesized  : ${result.result.voiceEventsSynthesized}`);
    console.log(`    Estimated duration        : ${(result.result.estimatedDurationMs / 1000).toFixed(1)}s`);
    console.log(`    Actual duration           : ${(result.result.totalDurationMs / 1000).toFixed(1)}s`);
    console.log(`    Duration delta            : ${(result.result.durationDeltaMs / 1000).toFixed(1)}s (${result.result.durationDeltaMs > 0 ? '+' : ''}${((result.result.durationDeltaMs / result.result.estimatedDurationMs) * 100).toFixed(1)}%)`);
    console.log(`    TTS cost                  : $${result.result.costUsd.toFixed(4)}`);
    console.log(`    Elapsed time              : ${(result.result.elapsedMs / 1000).toFixed(1)}s`);
    console.log('  ' + '─'.repeat(72));
    console.log('');

    return 0;
  } catch (err: any) {
    console.error(`  ERROR: ${err?.message || err}`);
    console.log('');
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
