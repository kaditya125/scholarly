/**
 * Correct the provenance labels on SSC CGL questions imported from third-party datasets.
 *
 * WHAT WENT WRONG
 *
 * Four ingestion scripts pulled ~11,800 SSC CGL questions from GitHub and Hugging
 * Face into `pyq_questions`. Two of them labelled the result as though it had come
 * from the Staff Selection Commission:
 *
 *   · 6,829 records from github.com/Satvik20Pandey/SSC-CGL-PYQ carry
 *     `sourceType: TIER_A_OFFICIAL` and `isOfficial: true`, with a GitHub URL as
 *     their source. TIER_A_OFFICIAL means the examining body. It does not mean a
 *     community repository that transcribed the examining body's papers, however
 *     good that transcription may be.
 *
 *   · ~918 records from the sharad461 dataset are correctly TIER_B, but carry
 *     `verificationStatus: OFFICIAL_CONFIRMED` and a `correctAnswerSource` naming
 *     SSC's official key — a claim the record's own provenance contradicts, since
 *     it also records `isOfficial: false`.
 *
 * The questions themselves are probably fine. This does not touch them. It changes
 * only what the corpus *claims* about where they came from.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH
 *
 *   · The 2,171 original SSC_CGL records with no sourceUrl — part template output,
 *     part hand-authored, 1,359 of them already embedded. Cleaning those up is a
 *     separate job and a separate decision; mixing it in here would make both
 *     harder to review and impossible to revert independently.
 *   · github.com/aman310762-cmd/examsaathi (1,600) and github.com/akafoxfire/
 *     RankUpVocab (2,492). Both were labelled correctly on the way in — TIER_B and
 *     SECONDARY_CONFIRMED — and are left exactly as they are.
 *
 * SAFETY
 *
 * Dry-run by default. Every write is an `update()` of named fields, never a `set()`,
 * so nothing outside the listed fields can be disturbed. Before writing, a reversal
 * manifest is saved containing each document's prior values for exactly the fields
 * being changed, and `--revert` replays it. The pass is idempotent: a record already
 * at its target values is skipped, so a second run reports zero changes.
 *
 * USAGE
 *
 *   npx tsx scripts/pyq/official/relabel-third-party-provenance.ts
 *   npx tsx scripts/pyq/official/relabel-third-party-provenance.ts --execute
 *   npx tsx scripts/pyq/official/relabel-third-party-provenance.ts --revert out/relabel/<file>.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

const OUT = path.join(__dirname, 'out', 'relabel');

// ─────────────────────────────────────────────────────────────────────────────
// Cohorts
// ─────────────────────────────────────────────────────────────────────────────

/** The fields this script is allowed to touch. Nothing else is read back or written. */
const FIELDS = [
  'sourceType',
  'verificationStatus',
  'correctAnswerSource',
  'rightsStatus',
  'rightsSource',
  'redistributionAllowed',
  'provenanceRecords',
] as const;

type Field = (typeof FIELDS)[number];
type Patch = Partial<Record<Field, unknown>>;

interface Cohort {
  key: string;
  why: string;
  /** Single-field equality, so no composite index is needed. */
  match: { field: string; value: string };
  expected: number;
  /** Returns only the fields that are actually wrong on this document. */
  corrections(data: any): Patch;
}

/** Rewrites the embedded provenance array, leaving every other key on it intact. */
function fixProvenance(
  records: any,
  patch: { sourceTier?: string; isOfficial?: boolean; sourceName?: string }
): any[] | null {
  if (!Array.isArray(records) || records.length === 0) return null;
  let changed = false;
  const next = records.map((r) => {
    const out = { ...r };
    if (patch.sourceTier !== undefined && out.sourceTier !== patch.sourceTier) {
      out.sourceTier = patch.sourceTier;
      changed = true;
    }
    if (patch.isOfficial !== undefined && out.isOfficial !== patch.isOfficial) {
      out.isOfficial = patch.isOfficial;
      changed = true;
    }
    if (patch.sourceName !== undefined && out.sourceName !== patch.sourceName) {
      out.sourceName = patch.sourceName;
      changed = true;
    }
    return out;
  });
  return changed ? next : null;
}

const COHORTS: Cohort[] = [
  {
    key: 'satvik-ssc-cgl-pyq',
    why: 'A community GitHub transcription of CBT response sheets, labelled as the examining body itself.',
    match: { field: 'sourceUrl', value: 'https://github.com/Satvik20Pandey/SSC-CGL-PYQ' },
    expected: 6829,
    corrections(d) {
      const p: Patch = {};
      if (d.sourceType !== 'TIER_B_REPUTABLE_PLATFORM') p.sourceType = 'TIER_B_REPUTABLE_PLATFORM';
      if (d.verificationStatus !== 'SECONDARY_CONFIRMED') p.verificationStatus = 'SECONDARY_CONFIRMED';
      if (d.correctAnswerSource !== SATVIK_ANSWER_SOURCE) p.correctAnswerSource = SATVIK_ANSWER_SOURCE;

      /* The rights claim rested on the same mistake: "PUBLIC_DOMAIN_OR_CLEAR,
         redistribution allowed, because SSC published it" — but what we actually
         hold came from an unlicensed repository, and that repository's own right
         to redistribute is unestablished. UNKNOWN is the honest value. */
      if (d.rightsStatus !== 'UNKNOWN') p.rightsStatus = 'UNKNOWN';
      if (d.rightsSource !== SATVIK_RIGHTS_SOURCE) p.rightsSource = SATVIK_RIGHTS_SOURCE;
      if (d.redistributionAllowed !== false) p.redistributionAllowed = false;

      const prov = fixProvenance(d.provenanceRecords, {
        sourceTier: 'TIER_B_REPUTABLE_PLATFORM',
        isOfficial: false,
        sourceName: SATVIK_SOURCE_NAME,
      });
      if (prov) p.provenanceRecords = prov;
      return p;
    },
  },
  {
    key: 'sharad461-ssc-cgl-2023',
    why: 'Correctly TIER_B, but claiming OFFICIAL_CONFIRMED and naming SSC’s key while its own provenance records isOfficial: false.',
    match: { field: 'sourceId', value: 'src_sharad461_ssc_cgl_2023' },
    // 917, not the 918 the ingest script's header claims — counted from Firestore.
    expected: 917,
    corrections(d) {
      const p: Patch = {};
      if (d.verificationStatus !== 'SECONDARY_CONFIRMED') p.verificationStatus = 'SECONDARY_CONFIRMED';
      if (d.correctAnswerSource !== SHARAD_ANSWER_SOURCE) p.correctAnswerSource = SHARAD_ANSWER_SOURCE;
      // sourceType and provenance.isOfficial were already right; left untouched.
      return p;
    },
  },
];

const SATVIK_SOURCE_NAME =
  'Satvik20Pandey/SSC-CGL-PYQ — community transcription of SSC CGL CBT response sheets';
const SATVIK_ANSWER_SOURCE =
  'Community transcription of CBT response sheet (not verified against an SSC-published key)';
const SATVIK_RIGHTS_SOURCE =
  'Unlicensed GitHub repository; redistribution rights unestablished — legal review required';
const SHARAD_ANSWER_SOURCE =
  'sharad461 SSC CGL 2023 dataset (secondary; not an SSC-published key)';

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

interface Reversal {
  createdAt: string;
  cohort: string;
  docs: { id: string; prior: Patch }[];
}

const pick = (data: any, fields: Field[]): Patch => {
  const out: Patch = {};
  for (const f of fields) out[f] = data[f] === undefined ? null : data[f];
  return out;
};

async function relabel(execute: boolean) {
  fs.mkdirSync(OUT, { recursive: true });
  const col = db.collection('pyq_questions');
  let grandChanged = 0;
  let grandIndexed = 0;

  for (const cohort of COHORTS) {
    const snap = await col.where(cohort.match.field, '==', cohort.match.value).get();
    console.log(`\n── ${cohort.key}`);
    console.log(`   ${cohort.why}`);
    console.log(`   matched ${snap.size} documents (expected ${cohort.expected})`);
    if (snap.size !== cohort.expected) {
      console.log(
        `   ⚠ count differs from what was measured on 7 Sep — inspect before executing.`
      );
    }

    const pending: { id: string; patch: Patch; prior: Patch }[] = [];
    let indexed = 0;
    snap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      if (data.vectorIndexed) indexed++;
      const patch = cohort.corrections(data);
      const touched = Object.keys(patch) as Field[];
      if (touched.length === 0) return;
      pending.push({ id: doc.id, patch, prior: pick(data, touched) });
    });

    grandIndexed += indexed;
    console.log(`   already correct : ${snap.size - pending.length}`);
    console.log(`   to change       : ${pending.length}`);
    console.log(`   of which embedded in Pinecone: ${indexed}`);

    if (pending.length) {
      const fieldCount: Record<string, number> = {};
      for (const p of pending) for (const k of Object.keys(p.patch)) fieldCount[k] = (fieldCount[k] || 0) + 1;
      console.log(`   fields          : ${JSON.stringify(fieldCount)}`);
      const s = pending[0];
      console.log(`   sample ${s.id}`);
      for (const k of Object.keys(s.patch)) {
        const before = k === 'provenanceRecords' ? '[…]' : JSON.stringify((s.prior as any)[k]);
        const after = k === 'provenanceRecords' ? '[… sourceTier/isOfficial/sourceName corrected]' : JSON.stringify((s.patch as any)[k]);
        console.log(`      ${k}: ${before}  ->  ${after}`);
      }
    }

    if (!execute || pending.length === 0) continue;

    const reversal: Reversal = {
      createdAt: new Date().toISOString(),
      cohort: cohort.key,
      docs: pending.map((p) => ({ id: p.id, prior: p.prior })),
    };
    const file = path.join(OUT, `${cohort.key}-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(reversal, null, 2));
    console.log(`   reversal saved  : ${path.relative(process.cwd(), file)}`);

    for (let i = 0; i < pending.length; i += 400) {
      const batch = db.batch();
      for (const p of pending.slice(i, i + 400)) {
        batch.update(col.doc(p.id), { ...p.patch, updatedAt: Date.now() });
      }
      await batch.commit();
      process.stdout.write(`   written ${Math.min(i + 400, pending.length)}/${pending.length}\r`);
    }
    console.log(`   written ${pending.length}/${pending.length}        `);
    grandChanged += pending.length;
  }

  console.log(`\n${'─'.repeat(78)}`);
  if (execute) {
    console.log(`${grandChanged} documents relabelled.`);
  } else {
    console.log(`DRY RUN — nothing written. Re-run with --execute to apply.`);
  }
  if (grandIndexed > 0) {
    console.log(
      `\n${grandIndexed} of the affected records are already embedded. Their Pinecone metadata\n` +
        `still carries the old sourceType and verificationStatus — re-index them, or accept\n` +
        `that retrieval-time filters on those fields will disagree with Firestore.`
    );
  }
  console.log(
    `\nNot touched, by design: the 2,171 SSC_CGL records with no sourceUrl (template and\n` +
      `hand-authored, 1,359 embedded), and the ExamSaathi and RankUpVocab imports, which\n` +
      `were labelled correctly on the way in.`
  );
}

async function revert(file: string) {
  const r: Reversal = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const col = db.collection('pyq_questions');
  console.log(`Reverting ${r.docs.length} documents from ${r.cohort} (saved ${r.createdAt})`);
  for (let i = 0; i < r.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of r.docs.slice(i, i + 400)) {
      const prior: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.prior)) if (v !== null) prior[k] = v;
      batch.update(col.doc(d.id), prior);
    }
    await batch.commit();
    process.stdout.write(`  ${Math.min(i + 400, r.docs.length)}/${r.docs.length}\r`);
  }
  console.log(`  ${r.docs.length}/${r.docs.length} reverted        `);
}

async function main() {
  const args = process.argv.slice(2);
  const revertIdx = args.indexOf('--revert');
  if (revertIdx >= 0) {
    const file = args[revertIdx + 1];
    if (!file) throw new Error('--revert needs a manifest path');
    await revert(file);
    return;
  }
  const execute = args.includes('--execute');
  console.log(
    `\nSSC CGL third-party provenance relabel — ${execute ? 'EXECUTE' : 'DRY RUN'}\n` +
      `Corrects what the corpus claims about where these questions came from.\n` +
      `It does not modify any question, option, answer or explanation.`
  );
  await relabel(execute);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
