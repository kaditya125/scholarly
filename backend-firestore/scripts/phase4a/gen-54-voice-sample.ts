/**
 * Generate the landing page's voice sample.
 *
 * The words are NOT marketing copy: this is verbatim what the production voice stack answered
 * when asked about the SSC CGL quantitative section during live testing today, grounded in the
 * official SSC notice already indexed. The landing page claims the tutor answers from the
 * commission's own syllabus rather than from memory, so a sample that said anything else would
 * be advertising a behaviour the product does not have.
 *
 * Voice is en-US-Chirp3-HD-Kore — the same Kore a student hears in a real session.
 *
 *   npx tsx scripts/phase4a/gen-54-voice-sample.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import textToSpeech from '@google-cloud/text-to-speech';

const OUT = path.resolve(__dirname, '../../../frontend/public/voice-sample-ssc-cgl.mp3');

/** Verbatim from a live Gemini Live session against production, 2026-08-26. */
const TEXT = 'It covers number systems, percentages, ratio and proportion, averages, '
           + 'interest, profit and loss, time and distance, and more.';

(async () => {
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.resolve(__dirname, '../../secrets/vertex-sa.json');
  const client = new textToSpeech.TextToSpeechClient({ keyFilename: creds });

  const [res] = await client.synthesizeSpeech({
    input: { text: TEXT },
    voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Kore' },
    // MP3 keeps a landing-page asset small; 24kHz matches the Live model's own output rate.
    audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
  });

  const audio = res.audioContent as Buffer;
  if (!audio?.length) throw new Error('no audio returned');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, audio);
  console.log(`wrote ${OUT}`);
  console.log(`  ${audio.length} bytes (${(audio.length / 1024).toFixed(0)} KB)`);
  console.log(`  text: "${TEXT}"`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
