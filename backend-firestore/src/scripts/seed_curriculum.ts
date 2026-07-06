/**
 * Seed curriculum ingestion — 10 notebooks x 2 chapters (verified NCERT PDFs).
 * Ingests each candidate code in order until 2 chapters reach READY per notebook.
 * Idempotent (skips already-READY chapters), size-capped, self-healing on 404.
 *
 * Run in background (long):  npx tsx src/scripts/seed_curriculum.ts
 */
import { db } from '../config/firebase';
import { notebookRepository } from '../repositories/notebook.repository';
import { sourceService } from '../services/source.service';

const OWNER = 'ncert-curriculum';
const BASE = 'https://ncert.nic.in/textbook/pdf';
const TARGET_PER_NB = 2;
const MAX_MB = 25;

interface Seed { id: string; title: string; cls: number; subject: string; codes: string[]; }

const SEED: Seed[] = [
  { id: 'ncert-c9-physics', title: 'NCERT Class 9 Physics', cls: 9, subject: 'Physics', codes: ['iesc108', 'iesc109', 'iesc110', 'iesc111'] },
  { id: 'ncert-c10-science', title: 'NCERT Class 10 Science', cls: 10, subject: 'Science', codes: ['jesc101', 'jesc102', 'jesc103'] },
  { id: 'ncert-c11-physics', title: 'NCERT Class 11 Physics', cls: 11, subject: 'Physics', codes: ['keph101', 'keph102', 'keph103'] },
  { id: 'ncert-c11-chemistry', title: 'NCERT Class 11 Chemistry', cls: 11, subject: 'Chemistry', codes: ['kech103', 'kech102', 'kech104', 'kech105', 'kech106'] },
  { id: 'ncert-c11-biology', title: 'NCERT Class 11 Biology', cls: 11, subject: 'Biology', codes: ['kebo101', 'kebo102', 'kebo103'] },
  { id: 'ncert-c11-mathematics', title: 'NCERT Class 11 Mathematics', cls: 11, subject: 'Mathematics', codes: ['kemh102', 'kemh101', 'kemh103', 'kemh104'] },
  { id: 'ncert-c12-physics', title: 'NCERT Class 12 Physics', cls: 12, subject: 'Physics', codes: ['leph103', 'leph102', 'leph101'] },
  { id: 'ncert-c12-chemistry', title: 'NCERT Class 12 Chemistry', cls: 12, subject: 'Chemistry', codes: ['lech101', 'lech103', 'lech102'] },
  { id: 'ncert-c12-biology', title: 'NCERT Class 12 Biology', cls: 12, subject: 'Biology', codes: ['lebo103', 'lebo105', 'lebo107'] },
  { id: 'ncert-c12-mathematics', title: 'NCERT Class 12 Mathematics', cls: 12, subject: 'Mathematics', codes: ['lemh101', 'lemh102', 'lemh103'] },
];

async function ensureNotebook(s: Seed): Promise<void> {
  const existing = await notebookRepository.getByIdAdmin(s.id);
  if (existing) return;
  const now = Date.now();
  await notebookRepository.createNotebook({
    id: s.id, userId: OWNER, owner: OWNER, title: s.title, color: 'bg-emerald-500',
    createdAt: now, updatedAt: now, lastOpenedAt: now,
    isPinned: false, isFavorite: false, isArchived: false,
    stats: { documentCount: 0, conversationCount: 0, storageUsedBytes: 0, knowledgeGraphNodes: 0, flashcardsCount: 0, quizCount: 0, masteryPercentage: 0, completionPercentage: 0 },
    learningGoals: [], weakTopics: [], strongTopics: [], auditLogs: [], editors: [], viewers: [],
    description: `Official NCERT ${s.subject} (Class ${s.cls}) — seed curriculum.`,
  } as any);
}

async function readySources(notebookId: string): Promise<any[]> {
  const snap = await db.collection('notebooks').doc(notebookId).collection('sources').where('status', '==', 'READY').get();
  return snap.docs.map((d) => d.data());
}

async function purgeFailed(notebookId: string): Promise<void> {
  const snap = await db.collection('notebooks').doc(notebookId).collection('sources').where('status', '==', 'FAILED').get();
  for (const d of snap.docs) await d.ref.delete();
}

async function codeAlreadyReady(notebookId: string, code: string): Promise<boolean> {
  const ready = await readySources(notebookId);
  return ready.some((s: any) => (s.title || '').includes(`[${code}]`));
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 4).toString('latin1') !== '%PDF') return null;
    if (buf.length > MAX_MB * 1048576) { console.log(`   skip (>${MAX_MB}MB): ${url}`); return null; }
    return buf;
  } catch { return null; }
}

async function pollStatus(notebookId: string, sourceId: string, timeoutMs = 300000): Promise<string> {
  const start = Date.now();
  const ref = db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId);
  while (Date.now() - start < timeoutMs) {
    const status = (await ref.get()).data()?.status || 'UNKNOWN';
    if (status === 'READY' || status === 'FAILED') return status;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return 'TIMEOUT';
}

async function main() {
  console.log(`=== SEED CURRICULUM: ${SEED.length} notebooks x ${TARGET_PER_NB} chapters ===\n`);
  for (const s of SEED) {
    await ensureNotebook(s);
    await purgeFailed(s.id);
    let ready = (await readySources(s.id)).length;
    console.log(`[${s.title}] existing READY=${ready}`);
    if (ready >= TARGET_PER_NB) { console.log('   already seeded, skipping.\n'); continue; }

    for (const code of s.codes) {
      if (ready >= TARGET_PER_NB) break;
      if (await codeAlreadyReady(s.id, code)) continue;
      const chap = parseInt(code.slice(-2), 10);
      const title = `${s.title} - Chapter ${chap} [${code}].pdf`;
      const pdf = await downloadPdf(`${BASE}/${code}.pdf`);
      if (!pdf) continue;
      console.log(`   -> ingesting ${code} (${(pdf.length / 1048576).toFixed(1)}MB)`);
      const file: any = { originalname: title, mimetype: 'application/pdf', size: pdf.length, buffer: pdf };
      const source = await sourceService.processUpload(s.id, OWNER, file);
      const status = await pollStatus(s.id, source.id);
      console.log(`      ${status}`);
      if (status === 'READY') ready++;
    }
    console.log(`   final READY=${ready}\n`);
  }

  console.log('=== SEED COMPLETE ===');
  const all = await db.collection('notebooks').where('owner', '==', OWNER).get();
  for (const d of all.docs) {
    const r = (await d.ref.collection('sources').where('status', '==', 'READY').get()).size;
    console.log(`  ${(d.data() as any).title}: READY=${r}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error('seed error:', e); process.exit(1); });
