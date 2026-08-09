/**
 * Audits a finished podcast: did the cinematic mix actually get applied, and
 * which background layers made it in?
 *
 * Reads the delivered artefacts rather than re-deriving them, so this reports
 * what the LISTENER got:
 *   - the pipeline's own stageDetails notes ("Cinematic mix applied" vs voice-only)
 *   - whether a Director timeline exists and what it planned
 *   - the cast and voices actually used
 *   - a bind check showing which cues would have resolved
 *
 * Usage:
 *   node --import tsx src/scripts/audit_podcast_run.ts            # last 3 podcasts
 *   node --import tsx src/scripts/audit_podcast_run.ts <podcastId>
 */

import '../config/firebase';

import { db } from '../config/firebase';
import { timelineRepository } from '../repositories/timeline.repository';
import { assetLibrary } from '../services/media/assets/AssetLibrary';
import { timelineAssetBinder } from '../services/media/assets/TimelineAssetBinder';

const PASS = '  PASS ';
const FAIL = '  FAIL ';
const NOTE = '       ';

async function audit(podcastId: string) {
  const doc = await db.collection('podcasts').doc(podcastId).get();
  if (!doc.exists) {
    console.log(`\n${podcastId}: not found`);
    return;
  }
  const p: any = doc.data();

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${p.title || '(untitled)'}`);
  console.log(`${podcastId}  status=${p.status}  duration=${p.duration ?? '?'}s`);
  console.log(`speakers: ${(p.speakers || []).join(' / ') || '(none)'}`);
  console.log(`language: ${p.language ?? '?'}`);
  console.log('='.repeat(78));

  // ── 1. What the pipeline itself reported ────────────────────────────────
  const details: any[] = p.stageDetails || [];
  // Match only the pipeline's VERDICT notes. A loose /cinematic/ match also hit
  // the plan's own description ("...dramatic arc and cinematic sound"), which
  // reported a false failure on a perfectly good episode.
  const cinematicNotes = details.filter((d) =>
    /^(Cinematic mix applied|Cinematic mix unavailable|Voice-only mix|Cinematic planning failed)/i.test(
      String(d.detail || '').trim()
    )
  );

  console.log('\n1) Pipeline verdict (its own notes)');
  if (cinematicNotes.length === 0) {
    console.log(`${NOTE}no cinematic note recorded (older run, or the stage never reached)`);
  }
  for (const n of cinematicNotes) {
    const text = String(n.detail);
    const good = /Cinematic mix applied/i.test(text);
    console.log(`${good ? PASS : FAIL}${text}`);
  }

  // Any Director failure note is the smoking gun for a voice-only episode.
  const directorFail = details.find((d) =>
    /Cinematic planning failed/i.test(String(d.detail || ''))
  );
  if (directorFail) {
    console.log(`${FAIL}${directorFail.detail}`);
  }

  // ── 2. Timeline ─────────────────────────────────────────────────────────
  console.log('\n2) Director timeline');
  const timeline = await timelineRepository.getTimeline(podcastId);
  if (!timeline) {
    console.log(`${FAIL}NO TIMELINE — nothing could be mixed; episode is voice-only.`);
    return;
  }
  const t: any = timeline;
  const planned = {
    music: t.tracks.music.events.length,
    ambience: t.tracks.ambience.events.length,
    sfx: t.tracks.sfx.events.length,
    stinger: t.tracks.stinger?.events?.length ?? 0,
  };
  console.log(
    `${PASS}timeline present (phase=${t.phase}, scenes=${t.scenes.length}, voice=${t.tracks.voice.events.length})`
  );
  console.log(
    `${NOTE}planned: music=${planned.music} ambience=${planned.ambience} sfx=${planned.sfx} stinger=${planned.stinger}`
  );
  const locations = [...new Set(t.scenes.map((s: any) => s.setting?.location))];
  console.log(`${NOTE}scene locations: ${locations.join(', ')}`);

  // ── 3. Bind ─────────────────────────────────────────────────────────────
  console.log('\n3) Asset binding');
  await assetLibrary.loadManifest();
  const bind = await timelineAssetBinder.bind(timeline);
  if (bind.missingCategories.length) {
    console.log(`${FAIL}no asset for: ${bind.missingCategories.join(', ')}`);
  } else {
    console.log(`${PASS}every planned category matched an asset`);
  }

  let musicBound = 0;
  for (const e of t.tracks.music.events) if (e.assetId) musicBound++;
  let ambienceLayers = 0;
  let ambienceBound = 0;
  for (const e of t.tracks.ambience.events) {
    for (const l of e.layers || []) {
      ambienceLayers++;
      if (l.assetId) ambienceBound++;
    }
  }
  let sfxBound = 0;
  for (const e of t.tracks.sfx.events) if (e.assetId) sfxBound++;

  const line = (label: string, bound: number, total: number) => {
    if (total === 0) return `${NOTE}${label}: none planned`;
    return `${bound === total ? PASS : FAIL}${label}: ${bound}/${total} bound`;
  };
  console.log(line('music   ', musicBound, planned.music));
  console.log(line('ambience', ambienceBound, ambienceLayers));
  console.log(line('sfx     ', sfxBound, planned.sfx));

  const backgroundInputs = musicBound + ambienceBound + sfxBound;
  console.log(`\n4) Would the mixer have background? backgroundInputs=${backgroundInputs}`);
  if (backgroundInputs === 0) {
    console.log(`${FAIL}voice-only passthrough — no background audio in the episode.`);
  } else {
    console.log(`${PASS}${backgroundInputs} background input(s) mixed under the voice.`);
  }
}

async function main() {
  const arg = process.argv[2];
  let ids: string[];

  if (arg) {
    ids = [arg];
  } else {
    const snap = await db
      .collection('podcasts')
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    ids = snap.docs.map((d) => d.id);
    console.log(`Auditing the ${ids.length} most recent podcast(s)…`);
  }

  for (const id of ids) await audit(id);
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
