/**
 * Export the SSC CGL corpus as seed material for question generation.
 *
 * WHAT THIS IS FOR
 *
 * A generator that has only a syllabus produces generic competitive-exam questions.
 * What makes a question feel like SSC CGL is narrower than the syllabus: which
 * concepts recur, how a stem is phrased, how long the arithmetic runs, what the
 * wrong options look like. That lives in the questions themselves, so this exports
 * them in the shape a generator can learn from — grouped by topic, with the
 * observed difficulty mix and topic frequency alongside.
 *
 * WHAT IT IS NOT
 *
 * Not a PYQ export. Every record here is `TIER_C_SECONDARY` internal corpus or a
 * third-party import, and the export says so on every row and in the manifest. A
 * generator fed this must produce genuinely new questions — a stem reworded or a
 * number swapped is a copy, and for the third-party rows it is also someone else's
 * copy. The `_usage` block in the output states that; keep it there.
 *
 * SELECTION
 *
 * Structurally sound and unique: four options, an answer in A-D within range, a
 * stem worth reading. Duplicates collapse to their first occurrence, so the export
 * never teaches the generator that a repeated question is important.
 *
 * READ-ONLY.
 *
 *   npx tsx scripts/pyq/official/export-ssc-generation-seed.ts
 *   npx tsx scripts/pyq/official/export-ssc-generation-seed.ts --include-third-party
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';

const OUT = path.join(__dirname, 'out', 'seed');
const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
const key = (s: string) => crypto.createHash('sha256').update(norm(s).toLowerCase()).digest('hex').slice(0, 16);

interface Seed {
  seedId: string;
  subject: string;
  chapter: string;
  topic: string;
  difficulty: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  year: number | null;
  /** Where this exemplar came from. Never 'verified_pyq' — none of these are. */
  provenance: 'internal_corpus' | 'third_party_import';
  sourceTier: string;
  isAuthenticPYQ: false;
}

async function main() {
  const includeThirdParty = process.argv.includes('--include-third-party');
  fs.mkdirSync(OUT, { recursive: true });

  const snap = await db
    .collection('pyq_questions')
    .where('examId', '==', 'SSC_CGL')
    .select(
      'questionText', 'options', 'correctAnswer', 'solution', 'topic', 'chapter',
      'subject', 'difficulty', 'year', 'sourceType', 'sourceUrl', 'ingestionState'
    )
    .get();

  console.log(`\nSSC_CGL records read: ${snap.size}`);

  const seen = new Set<string>();
  const seeds: Seed[] = [];
  let rejected = 0;
  let skippedThirdParty = 0;
  let skippedArchived = 0;

  snap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    const thirdParty = Boolean(String(d.sourceUrl ?? '').trim());

    if (d.ingestionState === 'ARCHIVED_DUPLICATE') { skippedArchived++; return; }
    if (thirdParty && !includeThirdParty) { skippedThirdParty++; return; }

    const opts: string[] = Array.isArray(d.options) ? d.options.map(norm) : [];
    const ans = String(d.correctAnswer ?? '').trim().toUpperCase();
    const stem = norm(d.questionText);

    if (stem.length < 15 || opts.length !== 4 || !/^[A-D]$/.test(ans) || opts.some((o) => !o)) {
      rejected++;
      return;
    }
    const k = key(stem);
    if (seen.has(k)) { rejected++; return; }
    seen.add(k);

    seeds.push({
      seedId: k,
      subject: norm(d.subject) || 'Unspecified',
      chapter: norm(d.chapter) || '',
      topic: norm(d.topic) || '',
      difficulty: String(d.difficulty ?? 'MEDIUM'),
      questionText: stem,
      options: opts,
      correctAnswer: ans,
      solution: norm(d.solution),
      year: typeof d.year === 'number' ? d.year : null,
      provenance: thirdParty ? 'third_party_import' : 'internal_corpus',
      sourceTier: String(d.sourceType ?? ''),
      isAuthenticPYQ: false,
    });
  });

  console.log(`  rejected (malformed or duplicate) : ${rejected}`);
  console.log(`  skipped (already archived dupes)  : ${skippedArchived}`);
  if (!includeThirdParty) console.log(`  skipped (third-party imports)     : ${skippedThirdParty}  — pass --include-third-party to add`);
  console.log(`  exported                          : ${seeds.length}`);

  /* The distributions are the point. A generator told only "write a Percentage
     question" writes a generic one; told that Percentage is 6% of the paper and
     runs 60/30/10 easy/medium/hard here, it can match the shape of the real thing. */
  const tally = (f: (s: Seed) => string) => {
    const m: Record<string, number> = {};
    for (const s of seeds) m[f(s) || '∅'] = (m[f(s) || '∅'] || 0) + 1;
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };

  const bySubject = tally((s) => s.subject);
  const byTopic = tally((s) => `${s.subject} › ${s.topic}`);
  const byDifficulty = tally((s) => s.difficulty);

  const perTopicDifficulty: Record<string, Record<string, number>> = {};
  for (const s of seeds) {
    const t = `${s.subject} › ${s.topic}`;
    perTopicDifficulty[t] ??= {};
    perTopicDifficulty[t][s.difficulty] = (perTopicDifficulty[t][s.difficulty] || 0) + 1;
  }

  const stamp = Date.now();
  const manifest = {
    generatedAt: new Date().toISOString(),
    examId: 'SSC_CGL',
    count: seeds.length,
    includesThirdParty: includeThirdParty,
    _usage: {
      isAuthenticPYQ: false,
      statement:
        'None of these are verified previous year questions. They are internal corpus and, where included, third-party imports. Use them to learn topic frequency, phrasing and difficulty shape. Generated output must be a genuinely new question — rewording a stem or substituting numbers produces a copy, and for third-party rows a copy of someone else’s work.',
      forbidden: ['label output as a PYQ', 'paraphrase a seed', 'substitute numbers in a seed', 'reorder options of a seed'],
    },
    distribution: { bySubject, byDifficulty, topTopics: Object.fromEntries(Object.entries(byTopic).slice(0, 40)) },
    perTopicDifficulty,
  };

  const seedFile = path.join(OUT, `ssc_cgl_seed-${stamp}.jsonl`);
  fs.writeFileSync(seedFile, seeds.map((s) => JSON.stringify(s)).join('\n') + '\n');
  const manifestFile = path.join(OUT, `ssc_cgl_seed-${stamp}.manifest.json`);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  console.log(`\n── subject mix ──`);
  for (const [k, v] of Object.entries(bySubject)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log(`\n── difficulty mix ──`);
  for (const [k, v] of Object.entries(byDifficulty)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log(`\n── top 12 topics ──`);
  for (const [k, v] of Object.entries(byTopic).slice(0, 12)) console.log(`  ${String(v).padStart(5)}  ${k}`);

  console.log(`\nSeed  : ${path.relative(process.cwd(), seedFile)}`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestFile)}`);
  console.log(`\nRead-only. Nothing was modified.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
