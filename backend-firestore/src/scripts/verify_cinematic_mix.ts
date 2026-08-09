/**
 * Proves whether background layers actually reach the mixer for a given podcast.
 *
 * Runs the real render chain up to (but not including) ffmpeg:
 *   timeline → TimelineAssetBinder → Music/Ambience/SFX engines → cue counts
 *
 * If backgroundInputs > 0 the mixer builds the full graph (amix + sidechain
 * ducking under the voice). If it is 0, AudioMixer takes the voice-only
 * passthrough and the episode has no music, ambience or effects.
 *
 * Usage: node --import tsx src/scripts/verify_cinematic_mix.ts <podcastId>
 */

import '../config/firebase';

import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';
import { MusicEngine } from '../services/media/assets/MusicEngine';
import { AmbienceEngine } from '../services/media/rendering/AmbienceEngine';
import { SFXEngine } from '../services/media/rendering/SFXEngine';

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: verify_cinematic_mix.ts <podcastId>');
    process.exit(1);
  }

  console.log(`\n=== Would background reach the mixer for ${podcastId}? ===\n`);

  const timeline = await timelineRepository.getTimeline(podcastId);
  if (!timeline) {
    console.log('No timeline — render is skipped entirely. Voice-only.');
    process.exit(0);
  }

  await assetLibrary.loadManifest();
  const bind = await timelineAssetBinder.bind(timeline);
  console.log(`bind missingCategories: ${JSON.stringify(bind.missingCategories)}`);

  const music = new MusicEngine(assetLibrary as any);
  const ambience = new AmbienceEngine(assetLibrary as any);
  const sfx = new SFXEngine(assetLibrary as any);

  const m = await music.prepare(timeline);
  const a = await ambience.prepare(timeline);
  const s = await sfx.prepare(timeline);

  const ambienceLayerCount = a.cues.reduce((sum: number, c: any) => sum + c.layers.length, 0);
  const backgroundInputs = m.cues.length + ambienceLayerCount + s.cues.length;

  console.log('');
  console.log(`music    cues: ${m.cues.length}  skipped: ${m.skipped.length}`);
  if (m.skipped.length) console.log(`   reasons: ${JSON.stringify(m.skipped.slice(0, 3))}`);
  console.log(`ambience cues: ${a.cues.length}  layers: ${ambienceLayerCount}  skipped: ${a.skipped.length}`);
  if (a.skipped.length) console.log(`   reasons: ${JSON.stringify(a.skipped.slice(0, 3))}`);
  console.log(`sfx      cues: ${s.cues.length}  skipped: ${s.skipped.length}`);
  if (s.skipped.length) console.log(`   reasons: ${JSON.stringify(s.skipped.slice(0, 3))}`);

  console.log('');
  console.log(`backgroundInputs = ${backgroundInputs}`);
  if (backgroundInputs === 0) {
    console.log('=> AudioMixer takes the VOICE-ONLY passthrough. No background audio.');
  } else {
    console.log(
      `=> AudioMixer builds the FULL graph: ${backgroundInputs} background input(s) ` +
        'mixed and sidechain-ducked under the voice. Background audio WILL be present.'
    );
    // Show the real files that would be fed to ffmpeg.
    for (const c of m.cues.slice(0, 2)) console.log(`   music    -> ${(c as any).localPath}`);
    for (const c of a.cues.slice(0, 1)) {
      for (const l of (c as any).layers.slice(0, 3)) console.log(`   ambience -> ${l.localPath}`);
    }
    for (const c of s.cues.slice(0, 2)) console.log(`   sfx      -> ${(c as any).localPath}`);
  }

  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
