/**
 * Renders the SAME episode twice — old bed levels vs new — using the real voice
 * bus, so the change can be judged by ear instead of by a number.
 *
 * A background-only render cannot show this difference: `loudnorm=I=-16`
 * normalises whatever it is given, so quiet background gets boosted to target and
 * both versions measure the same. What actually changed is the background level
 * RELATIVE to the voice, which only a full mix reveals.
 *
 * Usage: node --import tsx src/scripts/render_ab_comparison.ts <podcastId>
 */

import '../config/firebase';

import fs from 'fs';
import path from 'path';
import { bedVolumeDb, themeVolumeDb } from '../core/director/knowledge/musicMap';
import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';
import { MusicEngine } from '../services/media/assets/MusicEngine';
import { AmbienceEngine } from '../services/media/rendering/AmbienceEngine';
import { SFXEngine } from '../services/media/rendering/SFXEngine';
import { AudioMixer } from '../services/media/rendering/AudioMixer';

const DUCK_FLOOR = -12;

async function renderWith(
  timeline: any,
  voicePath: string,
  outPath: string
): Promise<void> {
  await assetLibrary.loadManifest();
  await timelineAssetBinder.bind(timeline);
  const m = await new MusicEngine(assetLibrary as any).prepare(timeline);
  const a = await new AmbienceEngine(assetLibrary as any).prepare(timeline);
  const s = await new SFXEngine(assetLibrary as any).prepare(timeline);

  await new AudioMixer().mix(
    {
      voicePath,
      voiceDurationMs: timeline.totalDurationMs,
      music: m.cues as any,
      ambience: a.cues as any,
      sfx: s.cues as any,
      mastering: timeline.mastering,
      totalDurationMs: timeline.totalDurationMs,
    } as any,
    { outputPath: outPath }
  );

  const music = m.cues.map((c: any) => c.volumeDb).join(', ');
  const amb = a.cues
    .flatMap((c: any) => c.layers.map((l: any) => l.volumeDb))
    .join(', ');
  console.log(`   music dB: ${music}`);
  console.log(`   ambience dB: ${amb}`);
}

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: render_ab_comparison.ts <podcastId>');
    process.exit(1);
  }

  // The cinematic render leaves the stitched voice bus behind — reuse it so this
  // costs nothing in TTS.
  const voicePath = path.join(
    process.cwd(),
    'temp',
    `${podcastId}_cinematic`,
    'voice_bus.mp3'
  );
  if (!fs.existsSync(voicePath)) {
    console.error(`voice bus not found: ${voicePath}`);
    console.error('Run this on a podcast whose cinematic temp dir still exists.');
    process.exit(1);
  }

  const dir = path.join(process.cwd(), 'temp', 'ab_levels');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // ── OLD levels: exactly what is stored on the timeline ──────────────────
  const oldTimeline: any = await timelineRepository.getTimeline(podcastId);
  if (!oldTimeline) {
    console.log('no timeline');
    process.exit(1);
  }
  const outOld = path.join(dir, 'A_old_levels.mp3');
  console.log('\nrendering A — OLD levels (what you heard)');
  await renderWith(oldTimeline, voicePath, outOld);

  // ── NEW levels: re-score with the current policy ─────────────────────────
  const newTimeline: any = await timelineRepository.getTimeline(podcastId);
  for (const ev of newTimeline.tracks.music.events) {
    const bed = bedVolumeDb({
      intensity: ev.intensity ?? 0.5,
      duckFloorDb: DUCK_FLOOR,
      reduceBackground: false,
      cinematicIntensity: 'dramatic',
    });
    ev.volumeDb = ev.role === 'bed' ? bed : themeVolumeDb(bed);
  }
  for (const ev of newTimeline.tracks.ambience.events) {
    for (const l of ev.layers || []) l.volumeDb = Math.min(-12, l.volumeDb + 6);
  }
  const outNew = path.join(dir, 'B_new_levels.mp3');
  console.log('\nrendering B — NEW levels');
  await renderWith(newTimeline, voicePath, outNew);

  console.log('\n=== listen and compare ===');
  console.log(`  A (old): ${outOld}`);
  console.log(`  B (new): ${outNew}`);
  console.log('\nBoth use your real narration. B should have clearly present music');
  console.log('and room tone throughout, not just under the intro.');
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
