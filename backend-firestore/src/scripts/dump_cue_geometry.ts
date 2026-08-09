/**
 * Dumps the CUE objects the engines hand to the filter graph.
 *
 * The timeline stores healthy levels (intro -7.5 dB, beds -13 dB) yet the mixed
 * background measures about -82 dB. That means the loss happens in the
 * timeline-event -> cue conversion, so this prints exactly what the mixer
 * receives, including whether any field is undefined/NaN — `volume=NaN` in
 * ffmpeg silences a track without erroring.
 *
 * Usage: node --import tsx src/scripts/dump_cue_geometry.ts <podcastId>
 */

import '../config/firebase';

import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';
import { MusicEngine } from '../services/media/assets/MusicEngine';
import { AmbienceEngine } from '../services/media/rendering/AmbienceEngine';
import { SFXEngine } from '../services/media/rendering/SFXEngine';

const bad = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v));

function show(label: string, obj: Record<string, unknown>) {
  const problems: string[] = [];
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    parts.push(`${k}=${v}`);
    if (bad(v)) problems.push(k);
  }
  console.log(`  ${label}  ${parts.join(' ')}`);
  if (problems.length) {
    console.log(`     >>> INVALID FIELD(S): ${problems.join(', ')} — ffmpeg will mute this track`);
  }
}

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: dump_cue_geometry.ts <podcastId>');
    process.exit(1);
  }

  const timeline = await timelineRepository.getTimeline(podcastId);
  if (!timeline) {
    console.log('no timeline');
    process.exit(1);
  }

  await assetLibrary.loadManifest();
  await timelineAssetBinder.bind(timeline);

  const m = await new MusicEngine(assetLibrary as any).prepare(timeline);
  const a = await new AmbienceEngine(assetLibrary as any).prepare(timeline);
  const s = await new SFXEngine(assetLibrary as any).prepare(timeline);

  console.log(`\n=== cue geometry for ${podcastId} ===\n`);

  console.log(`MUSIC cues (${m.cues.length})`);
  for (const c of m.cues as any[]) {
    show(String(c.eventId ?? c.id ?? '?'), {
      volumeDb: c.volumeDb,
      startMs: c.startMs,
      durationMs: c.durationMs,
      loopCount: c.loopCount,
      fadeInMs: c.fadeInMs,
      fadeOutMs: c.fadeOutMs,
      hasPath: !!c.localPath,
    });
  }

  console.log(`\nAMBIENCE cues (${a.cues.length})`);
  for (const c of a.cues as any[]) {
    console.log(`  event ${c.eventId} startMs=${c.startMs} layers=${c.layers.length}`);
    for (const l of c.layers) {
      show(`   layer ${l.layerRole}`, {
        volumeDb: l.volumeDb,
        durationMs: l.durationMs,
        loopCount: l.loopCount,
        jitterMs: l.jitterMs,
        fadeInMs: l.fadeInMs,
        fadeOutMs: l.fadeOutMs,
        hasPath: !!l.localPath,
      });
    }
  }

  console.log(`\nSFX cues (${s.cues.length})`);
  for (const c of s.cues as any[]) {
    show(String(c.eventId ?? '?'), {
      volumeDb: c.volumeDb,
      startMs: c.startMs,
      durationMs: c.durationMs,
      hasPath: !!c.localPath,
    });
  }

  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
