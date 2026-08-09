/**
 * Verifies the bed/ambience level change: prints the new computed levels, then
 * re-renders a real episode's background with those levels and measures it, so
 * the improvement is a number rather than an opinion.
 *
 * Usage: node --import tsx src/scripts/verify_level_fix.ts <podcastId>
 */

import '../config/firebase';

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { bedVolumeDb, themeVolumeDb } from '../core/director/knowledge/musicMap';
import { validateInvariants, formatValidationResult } from '../core/director/validation';
import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';
import { MusicEngine } from '../services/media/assets/MusicEngine';
import { AmbienceEngine } from '../services/media/rendering/AmbienceEngine';
import { SFXEngine } from '../services/media/rendering/SFXEngine';
import { AudioMixer } from '../services/media/rendering/AudioMixer';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

const DUCK_FLOOR = -12; // voiceBusGainDb 0 + duckingDb -12, as the real episodes use

function silentVoice(out: string, sec: number): Promise<void> {
  return new Promise((res, rej) => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    ffmpeg()
      .input('anullsrc=r=48000:cl=stereo')
      .inputFormat('lavfi')
      .duration(sec)
      .outputOptions(['-c:a', 'pcm_s16le'])
      .output(out)
      .on('end', () => res())
      .on('error', rej)
      .run();
  });
}

function measure(file: string): Promise<{ mean: number | null; max: number | null }> {
  return new Promise((resolve, reject) => {
    let err = '';
    ffmpeg()
      .input(file)
      .audioFilters(['volumedetect'])
      .format('null')
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .on('stderr', (l: string) => (err += l + '\n'))
      .on('error', reject)
      .on('end', () => {
        const m = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
        const x = err.match(/max_volume:\s*(-?[\d.]+) dB/);
        resolve({ mean: m ? parseFloat(m[1]) : null, max: x ? parseFloat(x[1]) : null });
      })
      .run();
  });
}

async function main() {
  console.log('\n=== new bed levels ===\n');
  const cases = [
    { label: 'storytelling (dramatic)', ci: 'dramatic' as const, rb: false },
    { label: 'documentary  (dramatic)', ci: 'dramatic' as const, rb: false },
    { label: 'solo narr.   (balanced)', ci: 'balanced' as const, rb: false },
    { label: 'teacher/std  (subtle)  ', ci: 'subtle' as const, rb: false },
    { label: 'accessibility reduceBg ', ci: 'balanced' as const, rb: true },
  ];
  for (const c of cases) {
    const bed = bedVolumeDb({
      intensity: 0.5,
      duckFloorDb: DUCK_FLOOR,
      reduceBackground: c.rb,
      cinematicIntensity: c.ci,
    });
    console.log(
      `  ${c.label}  bed=${String(bed).padStart(6)} dB   theme=${String(themeVolumeDb(bed)).padStart(6)} dB` +
        `   (was -13 / -7.5)`
    );
  }

  const podcastId = process.argv[2];
  if (!podcastId) {
    console.log('\n(pass a podcastId to also re-render and measure)\n');
    process.exit(0);
  }

  const timeline: any = await timelineRepository.getTimeline(podcastId);
  if (!timeline) {
    console.log('no timeline');
    process.exit(1);
  }

  // Apply the NEW policy to the stored timeline so the existing episode can be
  // re-measured without paying for a whole regeneration.
  console.log('\n=== re-scoring the stored timeline with the new policy ===\n');
  for (const ev of timeline.tracks.music.events) {
    const before = ev.volumeDb;
    if (ev.role === 'bed') {
      ev.volumeDb = bedVolumeDb({
        intensity: ev.intensity ?? 0.5,
        duckFloorDb: DUCK_FLOOR,
        reduceBackground: false,
        cinematicIntensity: 'dramatic',
      });
    } else {
      ev.volumeDb = themeVolumeDb(
        bedVolumeDb({
          intensity: ev.intensity ?? 0.5,
          duckFloorDb: DUCK_FLOOR,
          reduceBackground: false,
          cinematicIntensity: 'dramatic',
        })
      );
    }
    console.log(`  music ${String(ev.id).padEnd(12)} ${before} -> ${ev.volumeDb} dB`);
  }
  // Ambience: lift by the same amount the ceiling moved (was duckFloor-6 = -18,
  // now min(-12, duckFloor+4) = -12), i.e. +6 dB.
  for (const ev of timeline.tracks.ambience.events) {
    for (const l of ev.layers || []) {
      const before = l.volumeDb;
      l.volumeDb = Math.min(-12, l.volumeDb + 6);
      console.log(`  amb   ${String(ev.id).padEnd(12)} ${before} -> ${l.volumeDb} dB`);
    }
  }

  const v = validateInvariants(timeline);
  console.log(`\nvalidation: ${formatValidationResult(v)}`);

  await assetLibrary.loadManifest();
  await timelineAssetBinder.bind(timeline);
  const m = await new MusicEngine(assetLibrary as any).prepare(timeline);
  const a = await new AmbienceEngine(assetLibrary as any).prepare(timeline);
  const s = await new SFXEngine(assetLibrary as any).prepare(timeline);

  const total = timeline.totalDurationMs;
  const dir = path.join(process.cwd(), 'temp', 'level_fix_check');
  fs.rmSync(dir, { recursive: true, force: true });
  const voice = path.join(dir, 'voice.wav');
  const out = path.join(dir, 'background_new.mp3');
  await silentVoice(voice, total / 1000);

  console.log('\nrendering with the new levels…');
  await new AudioMixer().mix(
    {
      voicePath: voice,
      voiceDurationMs: total,
      music: m.cues as any,
      ambience: a.cues as any,
      sfx: s.cues as any,
      mastering: timeline.mastering,
      totalDurationMs: total,
    } as any,
    { outputPath: out }
  );

  const lv = await measure(out);
  console.log('\n=== RESULT (background only, voice silent) ===');
  console.log(`  BEFORE the fix : mean -20.0 dB   max  -1.3 dB`);
  console.log(`  AFTER  the fix : mean ${lv.mean} dB   max ${lv.max} dB`);
  console.log(`\n  file: ${out}`);
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
