/**
 * Public-content contract check for indexed exam vectors.
 *
 * Syllabus vectors are public by design — every student may retrieve them. That makes it critical
 * that nothing student-specific ever rides along on one, because `public: true` is exactly the
 * flag that removes the per-user filter. Zero embedding cost.
 */
import 'dotenv/config';
import { sampleVectorMetadata, countVectorsByExam } from './_embedding-guard';

const PRIVATE_HINT = /uid|userId|user_id|student|email|phone|firebase|owner(?!ship)/i;

(async () => {
  const exams = process.argv.slice(2).length ? process.argv.slice(2) : ['SSC_CGL', 'UPSC_CSE', 'UPSC_ESE'];
  for (const examId of exams) {
    const n = await countVectorsByExam(examId);
    const mds = await sampleVectorMetadata(examId, 5);
    console.log(`\n── ${examId}  vectors=${n}`);
    if (!mds.length) { console.log('   no vectors to inspect'); continue; }
    const keys = [...new Set(mds.flatMap((m) => Object.keys(m || {})))].sort();
    console.log(`   metadata keys: ${keys.join(', ')}`);
    const pub = mds.map((m) => m?.public);
    const kinds = [...new Set(mds.map((m) => m?.documentType || m?.vectorKind))];
    const owners = [...new Set(mds.map((m) => m?.examId))];
    console.log(`   public flags:  ${JSON.stringify(pub)}`);
    console.log(`   documentType:  ${JSON.stringify(kinds)}`);
    console.log(`   examId owner:  ${JSON.stringify(owners)}  ${owners.length === 1 && owners[0] === examId ? 'OK' : 'MISMATCH'}`);
    const leaks = keys.filter((k) => PRIVATE_HINT.test(k));
    if (leaks.length) {
      console.log('   private-looking fields — actual values:');
      for (const k of leaks) {
        const vals = [...new Set(mds.map((m) => JSON.stringify(m?.[k])))];
        // A Firebase uid is 28 chars of mixed case; a pipeline marker is a readable slug.
        const looksLikeUid = vals.some((v) => /^"[A-Za-z0-9]{26,32}"$/.test(String(v)));
        console.log(`     ${k} = ${vals.join(', ')}  ${looksLikeUid ? '<-- LOOKS LIKE A REAL UID' : '(pipeline marker, not a user)'}`);
      }
    } else console.log('   private-looking fields: none');
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
