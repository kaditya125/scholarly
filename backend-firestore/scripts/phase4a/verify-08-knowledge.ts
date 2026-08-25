/**
 * Part 1 Step 5 + Part 9 — exercise the REAL retrieval path, not a hand-built Pinecone query.
 * Goes through retrievePublicKnowledge and the voice tool the model actually calls.
 */
import 'dotenv/config';
import { retrievalService } from '../../src/services/rag/retrieval.service';
import { executeVoiceTool } from '../../src/services/voice/voiceTools';

const QUERIES = [
  'explain probability in simple terms',
  'what is photosynthesis',
  'newton laws of motion',
  'quadratic equations roots',
  'the French Revolution causes',
];

(async () => {
  console.log('=== retrievePublicKnowledge (real path) ===\n');
  let allPublic = true, anyFound = false;
  for (const q of QUERIES) {
    const t = Date.now();
    const res: any[] = await retrievalService.retrievePublicKnowledge(q, 4);
    const ms = Date.now() - t;
    const pubFlags = res.map(r => r?.metadata?.public);
    const nonPublic = pubFlags.filter(p => p !== true).length;
    if (res.length) anyFound = true;
    if (nonPublic) allPublic = false;
    console.log(`"${q}"`);
    console.log(`   results=${res.length}  ${ms}ms  allPublic=${nonPublic === 0}`);
    if (res.length) {
      const m = res[0].metadata || {};
      console.log(`   top: owner=${m.userId}  notebook=${m.notebookId}  board=${m.board ?? '-'}  class=${m.class ?? '-'}  public=${m.public}`);
      console.log(`        source=${String(m.sourceTitle ?? '-').slice(0, 60)}`);
    }
    console.log('');
  }

  console.log('=== searchKnowledge voice tool ===\n');
  for (const q of QUERIES.slice(0, 3)) {
    const r: any = await executeVoiceTool('searchKnowledge', { query: q }, { userId: 'synthetic-verification-uid' });
    console.log(`"${q}" -> found=${r.found} snippets=${r.snippets?.length ?? 0}${r.reason ? ' reason=' + r.reason : ''}`);
  }

  console.log(`\nany results at all : ${anyFound}`);
  console.log(`every result public: ${allPublic}`);
  process.exit(anyFound && allPublic ? 0 : 2);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
