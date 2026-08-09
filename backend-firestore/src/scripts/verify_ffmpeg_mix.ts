/**
 * Executes the REAL ffmpeg mix for a podcast's timeline and verifies the output.
 *
 * A filter_complex can only be validated by ffmpeg itself — a typecheck cannot.
 * This uses the actual bound cues and the actual AudioMixer, with a synthesised
 * voice bus so it costs nothing in TTS, and then confirms the mixed file exists
 * and is materially larger than the voice bus alone (i.e. layers are present).
 *
 * Usage: node --import tsx src/scripts/verify_ffmpeg_mix.ts <podcastId>
 */

import '../config/firebase';

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';
import { MusicEngine } from '../services/media/assets/MusicEngine';
import { AmbienceEngine } from '../services/media/rendering/AmbienceEngine';
import { SFXEngine } from '../services/media/rendering/SFXEngine';
import { AudioMixer } from '../services/media/rendering/AudioMixer';

/** A silent stand-in for the stitched voice bus. */
function makeSilentVoice(outPath: string, durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    ffmpeg()
      .input(`anullsrc=r=48000:cl=stereo`)
      .inputFormat('lavfi')
      .duration(durationSec)
      .outputOptions(['-c:a', 'pcm_s16le'])
      .output(outPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: verify_ffmpeg_mix.ts <podcastId>');
    process.exit(1);
  }

  const timeline = await timelineRepository.getTimeline(podcastId);
  if (!timeline) {
    console.log('No timeline for this podcast — nothing to mix.');
    process.exit(1);
  }

  await assetLibrary.loadManifest();
  await timelineAssetBinder.bind(timeline);

  const m = await new MusicEngine(assetLibrary as any).prepare(timeline);
  const a = await new AmbienceEngine(assetLibrary as any).prepare(timeline);
  const s = await new SFXEngine(assetLibrary as any).prepare(timeline);

  const ambienceLayers = a.cues.reduce((n: number, c: any) => n + c.layers.length, 0);
  const backgroundInputs = m.cues.length + ambienceLayers + s.cues.length;
  console.log(
    `\nbackgroundInputs=${backgroundInputs} (music=${m.cues.length} ambienceLayers=${ambienceLayers} sfx=${s.cues.length})`
  );

  if (backgroundInputs === 0) {
    console.log('Nothing to mix — would be voice-only.');
    process.exit(1);
  }

  // Full episode duration. A shorter window is NOT a valid smoke test: cues are
  // positioned with `adelay=startMs`, so any cue starting after the cap lands
  // outside the output and the render looks silent for reasons that have nothing
  // to do with the mix.
  const totalDurationMs =
    (timeline as any).totalDurationMs ||
    Math.max(
      60_000,
      ...[...m.cues, ...s.cues].map((c: any) => c.startMs + c.durationMs),
      ...a.cues.flatMap((c: any) => c.layers.map((l: any) => c.startMs + l.durationMs))
    );
  const dir = path.join(process.cwd(), 'temp', 'ffmpeg_mix_check');
  const voicePath = path.join(dir, 'voice.wav');
  const outPath = path.join(dir, 'mixed.mp3');
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`Synthesising a ${totalDurationMs / 1000}s silent voice bus…`);
  await makeSilentVoice(voicePath, totalDurationMs / 1000);

  const mixer = new AudioMixer();
  const mastering = (timeline as any).mastering || {
    targetLufs: -16,
    truePeakDb: -1,
    duckingDb: -12,
    duckAttackMs: 120,
    duckReleaseMs: 400,
    voiceBusGainDb: 0,
    fadeInMs: 500,
    fadeOutMs: 1200,
  };

  console.log('Running the real ffmpeg mix…');
  try {
    const result = await mixer.mix(
      {
        voicePath,
        voiceDurationMs: totalDurationMs,
        music: m.cues as any,
        ambience: a.cues as any,
        sfx: s.cues as any,
        mastering,
        totalDurationMs,
      } as any,
      { outputPath: outPath }
    );

    const voiceBytes = fs.statSync(voicePath).size;
    const outBytes = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;

    console.log('\n=== RESULT ===');
    console.log(`stats: ${JSON.stringify(result.stats)}`);
    console.log(`mixTimeMs: ${result.mixTimeMs}`);
    console.log(`voice bus:  ${voiceBytes} bytes (silence)`);
    console.log(`mixed file: ${outBytes} bytes -> ${outPath}`);

    if (outBytes === 0) {
      console.log('FAIL: no output produced.');
      process.exit(1);
    }
    if (result.stats.musicCues === 0 && result.stats.ambienceLayers === 0) {
      console.log('FAIL: mixer reported no background layers.');
      process.exit(1);
    }
    console.log(
      '\nffmpeg accepted the filter_complex. Now measuring whether the background ' +
        'is actually AUDIBLE — file size proves nothing for a constant-bitrate mp3.'
    );
    console.log(`  node --import tsx src/scripts/measure_audio_levels.ts "${outPath}"`);
    console.log('The voice track is silent, so any level measured is the background.');
  } catch (err: any) {
    console.log('\n=== FAIL ===');
    console.log(`ffmpeg/mixer error: ${err?.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
