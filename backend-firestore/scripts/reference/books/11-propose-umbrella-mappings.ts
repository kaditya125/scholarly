/**
 * Step 11 — propose "umbrella" syllabus mappings for book chapters an exam's syllabus doesn't NAME.
 *
 * Step 09 maps a chapter only when a syllabus node's own words name it (phrase-verified). SSC CGL's
 * official syllabus names none of Direction, Blood Relation, Syllogism, Dice, Ranking, Clock or
 * Calendar — they sit under broad headings ("Problem Solving", "Space Orientation", "Drawing
 * inferences") — so those chapters never reach CGL drills even though CGL papers ask them.
 *
 * This writes a PROPOSAL only (the owner reviews it): each unmapped chapter → the CGL node chosen
 * from a fixed table of umbrella phrases, with the node's text quoted. `--apply` then writes the
 * approved rows as mappings with method 'owner-approved-umbrella' (never overwrites a verified one).
 *
 *   npx tsx scripts/reference/books/11-propose-umbrella-mappings.ts <bookKey> <examId> [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { syllabusGraphService } from '../../../src/services/exam/syllabusGraph.service';

const [bookId, examId] = process.argv.slice(2);
const apply = process.argv.includes('--apply');

// Chapter-name pattern → the umbrella phrase(s) expected in that exam's syllabus node text, in
// order of preference. Only phrases that appear VERBATIM in a node are ever used.
const UMBRELLA: [RegExp, string[]][] = [
  [/\bdirection/i, ['Space Orientation', 'Problem Solving']],
  [/\bblood relation/i, ['Problem Solving', 'Critical thinking']],
  [/\bsyllogism|statement/i, ['Drawing inferences', 'Critical thinking']],
  [/\bdice|cube/i, ['Space Visualization', 'Space Orientation']],
  [/\branking|sitting|arrangement of persons/i, ['Problem Solving']],
  [/\bclock|calend[ae]r/i, ['Problem Solving', 'Numerical Operations']],
  [/\bmissing number/i, ['Number Series', 'Numerical Operations']],
  [/\barrangement of words|logical order/i, ['Indexing', 'Semantic Series', 'Problem Solving']],
  [/\bcounting figure/i, ['Space Visualization', 'Figural Pattern']],
  [/\bmirror|water image/i, ['Space Orientation', 'Space Visualization']],
];

(async () => {
  if (!bookId || !examId) throw new Error('usage: 11-propose-umbrella-mappings.ts <bookKey> <examId> [--apply]');
  const versions = await syllabusGraphService.listVersions(examId);
  const syllabusId = versions[0]?.syllabusId;
  if (!syllabusId) throw new Error(`No syllabus graph for ${examId}`);
  const nodes = (await syllabusGraphService.getSyllabusNodes({ examId, syllabusId }))
    .filter((n: any) => n.type === 'TOPIC' || n.type === 'SUBTOPIC');

  const chaps = (await db.collection('book_chapters').where('bookId', '==', bookId).get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const proposals: any[] = [];
  for (const c of chaps.sort((a, b) => a.chapterOrdinal - b.chapterOrdinal)) {
    const cur = c.syllabusMappings?.[examId];
    if (cur?.syllabusNodeId) continue; // already verified — never touched
    const rule = UMBRELLA.find(([re]) => re.test(c.chapterName));
    let pick: any = null;
    for (const phrase of rule?.[1] ?? []) {
      const node = nodes.find((n: any) => String(n.label).toLowerCase().includes(phrase.toLowerCase()));
      if (node) { pick = { node, phrase }; break; }
    }
    proposals.push({
      docId: c.id, chapterOrdinal: c.chapterOrdinal, chapterName: c.chapterName, questions: c.extractedQuestions,
      proposedNodeId: pick?.node.id ?? null,
      proposedNodeLabel: pick ? String(pick.node.label).slice(0, 200) : null,
      matchedPhrase: pick?.phrase ?? null,
      note: pick ? 'umbrella heading (syllabus does not name the chapter)' : 'no umbrella heading found — stays unmapped',
    });
  }

  const out = path.resolve(process.cwd(), '..', 'dataset_staging', `umbrella_${bookId}_${examId}.json`);
  if (!apply) {
    fs.writeFileSync(out, JSON.stringify({ bookId, examId, syllabusId, proposals }, null, 2));
    for (const p of proposals) console.log(`${String(p.chapterOrdinal).padStart(2)} ${p.chapterName.padEnd(38)} (${p.questions}) → ${p.matchedPhrase ? `"${p.matchedPhrase}"` : '—'}`);
    console.log(`\nproposal written to ${out} — review, then re-run with --apply`);
    process.exit(0);
  }

  // Apply: only the rows in the (reviewed) proposal file that have a node.
  const reviewed = JSON.parse(fs.readFileSync(out, 'utf8'));
  const now = new Date().toISOString();
  const batch = db.batch();
  let n = 0;
  for (const p of reviewed.proposals) {
    if (!p.proposedNodeId) continue;
    batch.set(db.collection('book_chapters').doc(p.docId), {
      syllabusMappings: { [examId]: {
        inSyllabus: true, syllabusId: reviewed.syllabusId, syllabusNodeId: p.proposedNodeId, nodeLabel: p.proposedNodeLabel,
        matchedPhrase: p.matchedPhrase, method: 'owner-approved-umbrella', approvedAt: now, mappedAt: now,
      } }, updatedAt: now,
    }, { merge: true });
    n++;
  }
  await batch.commit();
  console.log(`applied ${n} umbrella mappings for ${bookId} / ${examId}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
