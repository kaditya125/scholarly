/**
 * Prints the request the FRONTEND actually sent for a podcast.
 *
 * This matters because a stale browser bundle sends only the legacy
 * `speakerStyle`. With the style engine on, `speakerStyle: 'solo_narrator'`
 * resolves to `solo_narration` — NOT `storytelling` — so choosing Storytelling in
 * the UI would silently produce a different production (balanced instead of
 * dramatic scoring, different structure) with no error anywhere.
 *
 * Usage: node --import tsx src/scripts/check_sent_request.ts [podcastId]
 */

import '../config/firebase';
import { db } from '../config/firebase';

async function main() {
  let podcastId = process.argv[2];

  if (!podcastId) {
    const snap = await db
      .collection('podcasts')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) {
      console.log('no podcasts');
      process.exit(1);
    }
    podcastId = snap.docs[0].id;
  }

  const pod = await db.collection('podcasts').doc(podcastId).get();
  const p: any = pod.data() || {};
  console.log(`\n=== ${podcastId} ===`);
  console.log(`title: ${p.title}`);

  const jobId = p.jobId;
  if (!jobId) {
    console.log('no jobId on the podcast');
    process.exit(1);
  }

  const job = await db.collection('podcast_jobs').doc(jobId).get();
  if (!job.exists) {
    console.log(`job ${jobId} not found`);
    process.exit(1);
  }
  const request: any = (job.data() as any).request || {};

  console.log('\nREQUEST AS RECEIVED FROM THE CLIENT:');
  console.log(JSON.stringify(request, null, 2));

  console.log('\nVERDICT');
  if (request.podcastStyle) {
    console.log(`  OK   podcastStyle="${request.podcastStyle}" — the frontend is CURRENT.`);
  } else {
    console.log('  STALE CLIENT: no podcastStyle field.');
    console.log(
      `  The backend fell back to speakerStyle="${request.speakerStyle}", which maps to a ` +
        'different production than the label you picked. Hard-refresh the browser.'
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
