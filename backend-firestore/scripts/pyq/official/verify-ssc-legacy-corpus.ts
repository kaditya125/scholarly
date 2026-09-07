/**
 * Check the 2,171 legacy SSC CGL records so they can be used, rather than binned.
 *
 * These are the SSC records with no `sourceUrl` — everything that predates the
 * third-party imports. They are currently the only SSC records left claiming
 * `TIER_A_OFFICIAL` / `OFFICIAL_CONFIRMED`, and 1,359 of them are the only SSC
 * records embedded in Pinecone, so they are what a student actually gets today
 * when they ask for a previous year question.
 *
 * The decision taken is to keep them in service and use them as seed material for
 * question generation, not to quarantine them. That is defensible: nothing found
 * so far suggests the questions are *wrong* — the defect was always the label.
 * But "use them" and "keep calling them official past papers" are different
 * things, so this establishes what they actually are before either happens.
 *
 * WHAT IT DETERMINES
 *
 *   origin        template  — emitted by generate-ssc-shift-corpus.ts, meaning the
 *                             same question text was replayed across many shifts
 *                 authored  — hand-written in scripts/pyq/corpus/ssc-cgl-*.ts
 *                 unknown   — in Firestore but traceable to neither
 *   structure     four options, an answer inside range, a non-empty stem
 *   duplication   how many records share a stem, and with which years
 *   seed value    whether a record carries enough (topic, solution, difficulty)
 *                 to be worth anything as a generation exemplar
 *
 * READ-ONLY. Writes a report to out/verify/ and changes nothing.
 *
 *   npx tsx scripts/pyq/official/verify-ssc-legacy-corpus.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';

const CORPUS = path.join(__dirname, '..', 'corpus');
const TOOLS = path.join(__dirname, '..', 'tools');
const OUT = path.join(__dirname, 'out', 'verify');

const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const key = (s: string) => crypto.createHash('sha256').update(norm(s)).digest('hex').slice(0, 16);

/**
 * Question stems as they appear in the repository's own source files. Matching on
 * the stem rather than on any id, because the ids were rewritten on ingestion and
 * the text is the only thing that survived unchanged.
 */
function stemsFrom(file: string): string[] {
  const src = fs.readFileSync(file, 'utf-8');
  const re = /(?:^|[\s,{])text:\s*(`(?:[^`\\]|\\[\s\S])*`|'(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*")/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1].slice(1, -1));
  return out;
}

function buildIndex() {
  const template = new Set<string>();
  const authored = new Set<string>();

  const tpl = path.join(TOOLS, 'generate-ssc-shift-corpus.ts');
  if (fs.existsSync(tpl)) for (const t of stemsFrom(tpl)) template.add(key(t));

  for (const f of fs.readdirSync(CORPUS)) {
    if (!/^ssc-cgl-/.test(f) || !f.endsWith('.ts')) continue;
    for (const t of stemsFrom(path.join(CORPUS, f))) authored.add(key(t));
  }
  return { template, authored };
}

interface Row {
  id: string;
  k: string;
  origin: 'template' | 'authored' | 'unknown';
  year: number | null;
  optionCount: number;
  answerOk: boolean;
  hasStem: boolean;
  hasSolution: boolean;
  hasTopic: boolean;
  hasDifficulty: boolean;
  indexed: boolean;
  state: string;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { template, authored } = buildIndex();
  console.log(`\nSource index: ${template.size} template stems, ${authored.size} authored stems\n`);

  const snap = await db
    .collection('pyq_questions')
    .where('examId', '==', 'SSC_CGL')
    .where('sourceType', '==', 'TIER_A_OFFICIAL')
    .select(
      'questionText', 'options', 'correctAnswer', 'solution', 'topic', 'chapter',
      'subject', 'difficulty', 'year', 'vectorIndexed', 'ingestionState'
    )
    .get();

  console.log(`Legacy SSC records (TIER_A_OFFICIAL, no third-party source): ${snap.size}\n`);

  const rows: Row[] = [];
  const byStem = new Map<string, number>();

  snap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    const k = key(d.questionText);
    byStem.set(k, (byStem.get(k) || 0) + 1);

    const opts: string[] = Array.isArray(d.options) ? d.options : [];
    const ans = String(d.correctAnswer ?? '').trim().toUpperCase();
    const answerOk = /^[A-D]$/.test(ans) && opts.length >= 'ABCD'.indexOf(ans) + 1;

    rows.push({
      id: doc.id,
      k,
      origin: template.has(k) ? 'template' : authored.has(k) ? 'authored' : 'unknown',
      year: typeof d.year === 'number' ? d.year : null,
      optionCount: opts.length,
      answerOk,
      hasStem: norm(d.questionText).length > 15,
      hasSolution: String(d.solution ?? '').trim().length > 10,
      hasTopic: String(d.topic ?? '').trim().length > 0,
      hasDifficulty: Boolean(d.difficulty),
      indexed: Boolean(d.vectorIndexed),
      state: String(d.ingestionState ?? '∅'),
    });
  });

  const count = <T extends string | number | boolean>(f: (r: Row) => T) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[String(f(r))] = (m[String(f(r))] || 0) + 1;
    return m;
  };

  console.log('── origin ──');
  console.log(' ', JSON.stringify(count((r) => r.origin)));
  console.log('\n── structure ──');
  console.log(`  exactly 4 options : ${rows.filter((r) => r.optionCount === 4).length}`);
  console.log(`  other counts      : ${JSON.stringify(count((r) => r.optionCount))}`);
  console.log(`  answer A-D, in range: ${rows.filter((r) => r.answerOk).length}`);
  console.log(`  usable stem       : ${rows.filter((r) => r.hasStem).length}`);
  console.log('\n── seed value ──');
  console.log(`  has solution      : ${rows.filter((r) => r.hasSolution).length}`);
  console.log(`  has topic         : ${rows.filter((r) => r.hasTopic).length}`);
  console.log(`  has difficulty    : ${rows.filter((r) => r.hasDifficulty).length}`);
  console.log('\n── duplication ──');
  const dupGroups = [...byStem.values()].filter((v) => v > 1);
  console.log(`  distinct stems    : ${byStem.size}`);
  console.log(`  duplicate groups  : ${dupGroups.length}`);
  console.log(`  surplus records   : ${dupGroups.reduce((a, b) => a + b - 1, 0)}`);
  console.log(`  worst repeat      : ${Math.max(0, ...byStem.values())}`);
  console.log('\n── current state ──');
  console.log(' ', JSON.stringify(count((r) => r.state)));
  console.log(`  embedded          : ${rows.filter((r) => r.indexed).length}`);

  /* A record is worth seeding generation with if it is structurally sound, unique,
     and carries the labels a generator needs to imitate it: topic and difficulty.
     Origin does not disqualify it — a template question is still a real question,
     it simply is not a past paper. */
  const seen = new Set<string>();
  const seed = rows.filter((r) => {
    if (!r.hasStem || r.optionCount !== 4 || !r.answerOk) return false;
    if (seen.has(r.k)) return false;
    seen.add(r.k);
    return true;
  });
  const rich = seed.filter((r) => r.hasTopic && r.hasSolution);

  console.log('\n── verdict ──');
  console.log(`  structurally sound and unique : ${seed.length}`);
  console.log(`  ...of those, with topic + solution (best seed material) : ${rich.length}`);
  console.log(`  rejected                      : ${rows.length - seed.length}`);

  const report = { generatedAt: new Date().toISOString(), total: rows.length, rows };
  const file = path.join(OUT, `ssc-legacy-verification-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nPer-record detail: ${path.relative(process.cwd(), file)}`);
  console.log('\nRead-only. Nothing was modified.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
