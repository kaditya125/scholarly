/**
 * Diagnoses why a podcast came out voice-only instead of cinematically mixed.
 *
 * Walks the render path's guards IN ORDER and reports which one stops the
 * background layers, so the answer is evidence rather than inference:
 *
 *   1. CINEMATIC_AUDIO_ENABLED  — off/undefined means the mix is discarded
 *   2. AI_DIRECTOR_ENABLED      — off means no timeline is ever written
 *   3. a timeline exists for the podcast
 *   4. the timeline actually HAS music/ambience/sfx events
 *   5. those events carry an assetId (the binder's job)
 *   6. the asset registry has anything to bind TO
 *   7. the assetId resolves to a real file on disk
 *
 * Usage: node --import tsx src/scripts/diagnose_cinematic_audio.ts [podcastId]
 *        With no argument it picks the most recent podcast.
 */

import '../config/firebase';

import { db } from '../config/firebase';
import { timelineRepository } from '../repositories/timeline.repository';
import { assetRegistry } from '../core/assets/AssetRegistry';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';

const ok = (s: string) => console.log(`  [OK]   ${s}`);
const bad = (s: string) => console.log(`  [STOP] ${s}`);
const info = (s: string) => console.log(`         ${s}`);

async function latestPodcastId(): Promise<string | null> {
  const snap = await db
    .collection('podcasts')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function main() {
  const argId = process.argv[2];
  console.log('\n=== Cinematic audio diagnosis ===\n');

  // ── 1 & 2. Flags ────────────────────────────────────────────────────────
  console.log('1) Environment flags');
  const cinematic = process.env.CINEMATIC_AUDIO_ENABLED;
  const director = process.env.AI_DIRECTOR_ENABLED;
  const directorShadow = process.env.AI_DIRECTOR_SHADOW_MODE;

  if (cinematic === undefined) {
    bad('CINEMATIC_AUDIO_ENABLED is UNSET — renderer never runs at all.');
  } else if (cinematic.toLowerCase() === 'true' || cinematic === '1') {
    ok('CINEMATIC_AUDIO_ENABLED=true — active mode, the mix WILL replace voice-only.');
  } else {
    bad(
      `CINEMATIC_AUDIO_ENABLED=${cinematic} — SHADOW mode. It renders the mix, ` +
        'logs it, then DELETES it. The episode stays voice-only by design.'
    );
  }

  if (director?.toLowerCase() === 'true' || director === '1') {
    ok(`AI_DIRECTOR_ENABLED=${director} — timelines are produced.`);
  } else {
    bad(`AI_DIRECTOR_ENABLED=${director ?? 'unset'} — NO timeline is ever written, so there are no cues to mix.`);
  }
  info(`AI_DIRECTOR_SHADOW_MODE=${directorShadow ?? 'unset'}`);
  info(`CINEMATIC_TRACKS=${process.env.CINEMATIC_TRACKS ?? 'unset'}`);
  console.log('');

  // ── 6. Asset registry (checked early — it gates everything downstream) ───
  console.log('2) Asset registry (Firestore: audio_asset_registry)');
  const kinds = ['music', 'ambience', 'sfx', 'stinger'] as const;
  let totalAssets = 0;
  for (const kind of kinds) {
    let rows: any[] = [];
    try {
      rows = await assetRegistry.listByKind(kind as any, 500);
    } catch (e: any) {
      info(`${kind}: listByKind threw — ${e?.message}`);
    }
    totalAssets += rows.length;
    const line = `${kind.padEnd(9)} ${String(rows.length).padStart(4)} asset(s)`;
    if (rows.length === 0) bad(line);
    else ok(`${line}  e.g. ${rows.slice(0, 3).map((r) => r.assetId || r.id).join(', ')}`);
  }
  if (totalAssets === 0) {
    console.log('');
    bad(
      'THE REGISTRY IS EMPTY. TimelineAssetBinder can only MATCH pre-existing ' +
        'assets — it never generates them. With nothing to match, every cue is ' +
        'skipped as "awaiting asset resolver", the mixer sees backgroundInputs===0 ' +
        'and takes the voice-only passthrough. This is the root cause.'
    );
  }
  console.log('');

  // ── Asset catalogue / manifest ──────────────────────────────────────────
  console.log('3) Asset manifest / catalogue on disk');
  try {
    await assetLibrary.loadManifest();
    const anyLib = assetLibrary as any;
    const manifest = anyLib.manifest;
    const size =
      manifest?.size ??
      manifest?.assets?.length ??
      (typeof manifest?.all === 'function' ? manifest.all().length : undefined);
    if (size === undefined) info('manifest loaded (size not introspectable)');
    else if (size === 0) bad(`manifest loaded but EMPTY (0 entries)`);
    else ok(`manifest has ${size} entr(ies)`);
  } catch (e: any) {
    bad(`loadManifest() failed — ${e?.message}`);
  }
  console.log('');

  // ── 3/4/5. Timeline for a real podcast ──────────────────────────────────
  const podcastId = argId || (await latestPodcastId());
  console.log(`4) Timeline for podcast ${podcastId ?? '(none found)'}`);
  if (!podcastId) {
    bad('No podcasts in the database to inspect.');
    process.exit(0);
  }

  const timeline = await timelineRepository.getTimeline(podcastId);
  if (!timeline) {
    bad(
      'No timeline stored for this podcast. CinematicShadowRunner logs ' +
        '"No timeline found; skipping render" and returns voice-only.'
    );
    process.exit(0);
  }
  ok(`timeline found (phase=${timeline.phase}, scenes=${timeline.scenes.length})`);

  const tracks = timeline.tracks as any;
  for (const kind of ['music', 'ambience', 'sfx'] as const) {
    const events: any[] = tracks[kind]?.events ?? [];
    const withAsset = events.filter((e) => !!e.assetId);
    if (events.length === 0) {
      bad(`${kind.padEnd(9)} 0 events planned — nothing to mix on this track.`);
      continue;
    }
    const line = `${kind.padEnd(9)} ${events.length} event(s), ${withAsset.length} with assetId`;
    if (withAsset.length === 0) bad(`${line}  → all skipped as "awaiting asset resolver"`);
    else ok(line);
  }
  console.log('');

  // ── Run the binder and see what it can actually attach ──────────────────
  console.log('5) TimelineAssetBinder dry run');
  try {
    const bind = await timelineAssetBinder.bind(timeline);
    const stats = (bind as any).stats ?? {};
    console.log(`         stats: ${JSON.stringify(stats)}`);
    if (bind.missingCategories?.length) {
      bad(`no asset matched these categories: ${bind.missingCategories.join(', ')}`);
    } else {
      ok('every cue category found a candidate asset');
    }

    let bound = 0;
    let unbound = 0;
    for (const kind of ['music', 'ambience', 'sfx'] as const) {
      for (const e of (timeline.tracks as any)[kind]?.events ?? []) {
        if (e.assetId) bound++;
        else unbound++;
      }
    }
    console.log(`         after bind: ${bound} cue(s) bound, ${unbound} still unbound`);

    if (bound === 0) {
      bad(
        'ZERO cues bound → AudioMixer will log "No background layers; voice-only ' +
          'passthrough" and the episode will have no music, ambience or SFX.'
      );
    } else {
      // ── 7. Do the bound ids resolve to real files? ──────────────────────
      console.log('');
      console.log('6) Asset file resolution for bound cues');
      for (const kind of ['music', 'ambience', 'sfx'] as const) {
        const events: any[] = (timeline.tracks as any)[kind]?.events ?? [];
        for (const e of events.slice(0, 3)) {
          if (!e.assetId) continue;
          const resolved = await assetLibrary.resolve(kind as any, e.assetId);
          if (resolved) ok(`${kind}/${e.assetId} → ${(resolved as any).localPath}`);
          else bad(`${kind}/${e.assetId} → NOT resolvable (no file); layer skipped`);
        }
      }
    }
  } catch (e: any) {
    bad(`bind() threw — ${e?.message}`);
  }

  console.log('\n=== end ===\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
