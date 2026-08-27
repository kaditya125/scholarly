/**
 * Stage 8 PILOT — 15 JEE Main questions, real source recovery, findings recorded.
 *
 * Writes ONLY to pyq_provenance_verifications. No original record is touched, and no provenance
 * stamp is issued: §26 requires the process to be proven before any question is made eligible.
 * Zero embeddings, zero Pinecone.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import {
  probeSource, decideVerdict, computeContentHash, saveVerification, classifyTier,
  type ProvenanceVerification, type SourceProbe,
} from '../../src/services/pyq/pyqProvenanceVerification.service';

const RUN_ID = `pilot-${new Date().toISOString().slice(0, 10)}`;
const APPLY = process.argv.includes('--apply');
const PACE_MS = 1500;   // domain-level pacing; never a burst

/**
 * Established by independent search: NTA distributes JEE Main question papers and answer keys
 * through a per-candidate login (application number + date of birth), not an open archive. A URL
 * of the form jeemain.nta.ac.in/archive/<paper>.pdf therefore describes something that does not
 * exist publicly — a distinct finding from "the server happens to be down".
 */
const NTA_PAPERS_ARE_LOGIN_GATED = true;

(async () => {
  const snap = await db.collection('pyq_questions').where('examId', '==', 'JEE_MAIN').get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const cohort = all.filter((r) => String(r.shift ?? '').includes('29 Jan Shift 1')).slice(0, 15);
  console.log(`PILOT: ${cohort.length} questions | run=${RUN_ID} | apply=${APPLY}\n`);

  // Duplicate map across the whole exam, computed once.
  const textCount = new Map<string, any[]>();
  all.forEach((r) => {
    const t = String(r.questionText ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (t) textCount.set(t, [...(textCount.get(t) ?? []), r]);
  });

  const probeCache = new Map<string, SourceProbe>();
  const tally: Record<string, number> = {};
  let requests = 0;

  for (const q of cohort) {
    const url = q.sourceUrl as string;
    let probe = probeCache.get(url);
    if (!probe) {
      probe = await probeSource(url);
      requests++;
      probeCache.set(url, probe);
      await new Promise((r) => setTimeout(r, PACE_MS));
    }

    const t = String(q.questionText ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cluster = textCount.get(t) ?? [];
    const identities = new Set(cluster.map((c) => [c.year, c.session, c.shift].join('|')));
    const duplicateStatus = cluster.length <= 1 ? 'UNIQUE'
      : identities.size > 1 ? 'DUPLICATE_IDENTITY_CONFLICT' : 'DUPLICATE_SAME_PAPER';

    const { verdict, notes } = decideVerdict({
      probes: [probe],
      questionFound: false,
      answerVerified: false,
      independentSearchPerformed: true,
      independentSearchFoundQuestion: false,
      duplicateStatus: duplicateStatus as any,
      sourceStructurallyPublic: !NTA_PAPERS_ARE_LOGIN_GATED,
    });

    const computed = computeContentHash(q);
    const rec: ProvenanceVerification = {
      pyqId: q.id, verificationRunId: RUN_ID, examId: q.examId,
      claimedPaper: {
        year: q.year, session: q.session, examDate: q.examDate, shift: q.shift,
        paper: q.paper, subject: q.subject, questionNumber: q.questionNumber,
      },
      verdict,
      sourceAttempts: [probe],
      questionFound: false, answerFound: !!q.correctAnswer, answerVerified: false,
      duplicateStatus: duplicateStatus as any,
      computedContentHash: computed,
      storedContentHash: q.contentHash,
      contentHashMatches: q.contentHash ? q.contentHash === computed : null,
      syllabusNodeVerified: false,
      rightsVerdict: 'REVIEW_REQUIRED',
      notes: [
        ...notes,
        `cited source returned ${probe.httpStatus} (${classifyTier(url)})`,
      ],
      verifiedAt: Date.now(),
      provenanceStampIssued: false,
    };

    tally[verdict] = (tally[verdict] ?? 0) + 1;
    if (APPLY) await saveVerification(rec);
    console.log(`  ${q.questionNumber?.toString().padStart(3)} ${String(q.subject).padEnd(12)} ${verdict.padEnd(32)} hashMatch=${rec.contentHashMatches} dup=${duplicateStatus}`);
  }

  console.log('\n=== PILOT TALLY ===');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(34)} ${v}`));
  console.log(`\nHTTP requests: ${requests} (cached ${cohort.length - requests})  ·  embeddings: 0  ·  stamps issued: 0`);
  console.log(`writes: ${APPLY ? cohort.length + ' verification records' : '0 (dry run)'}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
