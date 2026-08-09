/**
 * Verifies the SFX-vs-bed hierarchy on a real episode.
 *
 * Prints the levels the current policy produces, then renders the episode twice
 * with the real narration — old levels vs new — so "the effects are inaudible"
 * becomes something you can hear rather than argue about.
 *
 * Usage: node --import tsx src/scripts/verify_sfx_audible.ts <podcastId>
 */

import '../config/firebase';

import fs from 'fs';
import path from 'path';
import { bedVolumeDb, themeVolumeDb } from '../core/director/knowledge/musicMap';
import { sfxVolumeDb } from '../core/director/planners/SFXPlanner';
import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';
import { MusicEngine } from '../services/media/assets/MusicEngine';
import { AmbienceEngine } from '../services/media/rendering/AmbienceEngine';
import { SFXEngine } from '../services/media/rendering/SFXEngine';
import { AudioMixer } from '../services/media/rendering/AudioMixer';

const DUCK_FLOOR = -12;

/** Re-score a stored timeline with the CURRENT policy. */
function rescore(t: any) {
  for (const ev of t.tracks.music.events) {
    const bed = bedVolumeDb({
      intensity: ev.intensity ?? 0.5,
      duckFloorDb: DUCK_FLOOR,
      reduceBackground: false,
      cinematicIntensity: 'dramatic',
    });
    ev.volumeDb = ev.role === 'bed' ? bed : themeVolumeDb(bed);
  }
  for (const ev of t.tracks.sfx.events) {
    // Re-derive from the trigger's authored base. The stored value already has
    // the old prominence baked in, so back it out first: stored = base + 1.5
    // (dramatic) under the previous policy with no prominence shift.
    const base = (ev.volumeDb ?? -16) - 1.5;
    ev.volumeDb = sfxVolumeDb(base, {
      duckFloorDb: DUCK_FLOOR,
      cinematicIntensity: 'dramatic',
      reduceBackground: false,
    } as any);
  }
  for (const ev of t.tracks.ambience.events) {
    for (const l of ev.layers || []) l.volumeDb = Math.min(-12, (l.volumeDb ?? -28) + 6);
  }
}

async function render(t: any, voicePath: string, outPath: string) {
  await assetLibrary.loadManifest();
  await timelineAssetBinder.bind(t);
  const m = await new MusicEngine(assetLibrary as any).prepare(t);
  const a = await new AmbienceEngine(assetLibrary as any).prepare(t);
  const s = await new SFXEngine(assetLibrary as any).prepare(t);

  console.log(`   music dB  : ${m.cues.map((c: any) => c.volumeDb).join(', ') || '(none)'}`);
  console.log(`   sfx   dB  : ${s.cues.map((c: any) => c.volumeDb).join(', ') || '(none)'}`);
  console.log(
    `   ambience  : ${a.cues.flatMap((c: any) => c.layers.map((l: any) => l.volumeDb)).join(', ') || '(none)'}`
  );

  await new AudioMixer().mix(
    {
      voicePath,
      voiceDurationMs: t.totalDurationMs,
      music: m.cues as any,
      ambience: a.cues as any,
      sfx: s.cues as any,
      mastering: t.mastering,
      totalDurationMs: t.totalDurationMs,
    } as any,
    { outputPath: outPath }
  );
}

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: verify_sfx_audible.ts <podcastId>');
    process.exit(1);
  }

  const voicePath = path.join(
    process.cwd(), 'temp', `${podcastId}_cinematic`, 'voice_bus.mp3'
  );
  if (!fs.existsSync(voicePath)) {
    console.error(`voice bus missing: ${voicePath}`);
    process.exit(1);
  }

  const dir = path.join(process.cwd(), 'temp', 'ab_sfx');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const before: any = await timelineRepository.getTimeline(podcastId);
  console.log('\nA — levels as generated (what you heard)');
  await render(before, voicePath, path.join(dir, 'A_old.mp3'));

  const after: any = await timelineRepository.getTimeline(podcastId);
  rescore(after);
  console.log('\nB — new hierarchy (sfx above the bed)');
  await render(after, voicePath, path.join(dir, 'B_new.mp3'));

  // Where to listen: the SFX moments.
  console.log('\nlisten at these timestamps for the effects:');
  for (const ev of after.tracks.sfx.events) {
    const s = Math.floor(ev.startMs / 1000);
    console.log(
      `   ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` +
        `  ${ev.effectCategory}  "${ev.triggerWord ?? '?'}"  ${ev.volumeDb} dB`
    );
  }

  console.log(`\n  A: ${path.join(dir, 'A_old.mp3')}`);
  console.log(`  B: ${path.join(dir, 'B_new.mp3')}`);
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
