import 'dotenv/config';
import { sampleVectorMetadata, countVectorsByExam } from './_embedding-guard';
(async () => {
  for (const e of ['BPSC_ASST_PROF', 'UPSC_NDA']) {
    const n = await countVectorsByExam(e);
    const md = (await sampleVectorMetadata(e, 2))[0] || {};
    console.log(`${e.padEnd(16)} vectors=${String(n).padStart(4)} status=${md.status} documentType=${md.documentType} syllabusVersionId=${md.syllabusVersionId}`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
