/**
 * Prints the actual mastering config and per-cue volumeDb for a podcast's
 * timeline, to explain why the mixed background is inaudible.
 *
 * Usage: node --import tsx src/scripts/dump_mix_levels.ts <podcastId>
 */

import '../config/firebase';

import { timelineRepository } from '../repositories/timeline.repository';

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: dump_mix_levels.ts <podcastId>');
    process.exit(1);
  }

  const t: any = await timelineRepository.getTimeline(podcastId);
  if (!t) {
    console.log('no timeline');
    process.exit(1);
  }

  console.log(`\n=== ${podcastId} ===\n`);

  const m = t.mastering || {};
  console.log('MASTERING');
  console.log(`  voiceBusGainDb : ${m.voiceBusGainDb}`);
  console.log(`  duckingDb      : ${m.duckingDb}`);
  console.log(`  targetLufs     : ${m.targetLufs}`);
  console.log(`  truePeakDb     : ${m.truePeakDb}`);
  const duckFloor =
    (m.voiceBusGainDb ?? 0) + (m.duckingDb ?? 0);
  console.log(`  => duckFloorDb : ${duckFloor}  (beds are forced BELOW this)`);
  console.log(`  totalDurationMs: ${t.totalDurationMs}`);

  console.log('\nMUSIC cues');
  for (const e of t.tracks.music.events) {
    console.log(
      `  ${String(e.id).padEnd(10)} role=${String(e.role).padEnd(11)} ` +
        `volumeDb=${String(e.volumeDb).padStart(7)}  ` +
        `start=${String(e.startMs).padStart(7)}ms dur=${String(e.durationMs).padStart(7)}ms`
    );
  }

  console.log('\nAMBIENCE layers');
  for (const e of t.tracks.ambience.events) {
    for (const l of e.layers || []) {
      console.log(
        `  ${String(e.id).padEnd(12)} ${String(l.layerRole).padEnd(8)} ` +
          `volumeDb=${String(l.volumeDb).padStart(7)}  ` +
          `start=${String(e.startMs).padStart(7)}ms dur=${String(l.durationMs).padStart(7)}ms`
      );
    }
  }

  console.log('\nSFX cues');
  if (!t.tracks.sfx.events.length) console.log('  (none)');
  for (const e of t.tracks.sfx.events) {
    console.log(
      `  ${String(e.id).padEnd(10)} volumeDb=${String(e.volumeDb).padStart(7)} start=${e.startMs}ms`
    );
  }

  // How much of the episode actually has background over it?
  const covered = new Set<number>();
  const markSec = (startMs: number, durMs: number) => {
    for (let s = Math.floor(startMs / 1000); s < Math.ceil((startMs + durMs) / 1000); s++) {
      covered.add(s);
    }
  };
  for (const e of t.tracks.music.events) markSec(e.startMs, e.durationMs);
  for (const e of t.tracks.ambience.events) {
    for (const l of e.layers || []) markSec(e.startMs, l.durationMs);
  }
  const totalSec = Math.ceil((t.totalDurationMs || 0) / 1000);
  console.log(
    `\nCOVERAGE: background present for ${covered.size}s of ${totalSec}s ` +
      `(${totalSec ? Math.round((covered.size / totalSec) * 100) : 0}%)`
  );
  console.log(
    'A low coverage percentage drags mean_volume down even when the audible ' +
      'moments are fine — judge audibility by max_volume, not mean.'
  );

  const loudest = Math.max(
    ...t.tracks.music.events.map((e: any) => e.volumeDb ?? -99),
    ...t.tracks.ambience.events.flatMap((e: any) =>
      (e.layers || []).map((l: any) => l.volumeDb ?? -99)
    )
  );
  console.log(`\nLOUDEST background cue: ${loudest} dB`);
  if (loudest <= -40) {
    console.log('  >>> At or below -40 dB this is inaudible under speech.');
  } else if (loudest <= -30) {
    console.log('  >>> Very quiet; likely masked by the voice.');
  } else {
    console.log('  >>> Should be audible.');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
