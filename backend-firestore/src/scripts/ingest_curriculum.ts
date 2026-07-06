/**
 * Bulk NCERT curriculum ingestion.
 *
 * Downloads official NCERT chapter PDFs (ncert.nic.in) and runs them through the
 * REAL ingestion pipeline (SourceService.processUpload → extract → chunk → embed →
 * Pinecone → knowledge graph → READY), organised into one notebook per class+subject.
 *
 * Only NCERT (officially free for education) is included. Copyrighted commercial
 * publisher books are intentionally NOT ingested.
 *
 * Usage (from backend-firestore/):
 *   npx tsx src/scripts/ingest_curriculum.ts --limit 2          # ingest up to 2 chapters (default 2)
 *   npx tsx src/scripts/ingest_curriculum.ts --class 11 --subject Physics --limit 3
 *   npx tsx src/scripts/ingest_curriculum.ts --all             # ingest the whole manifest (slow + embedding cost)
 *
 * Missing chapters (404) are skipped automatically. Re-running is idempotent
 * (already-READY chapters are skipped).
 */
import { db } from '../config/firebase';
import { notebookRepository } from '../repositories/notebook.repository';
import { sourceService } from '../services/source.service';

const OWNER = 'ncert-curriculum';
const BASE = 'https://ncert.nic.in/textbook/pdf';

// Verified NCERT book codes (classes 7–12 STEM). Chapter counts are upper bounds —
// non-existent chapters return 404 and are skipped.
const BOOKS: Array<{ cls: number; subject: string; bookName?: string; code: string; parts: number; chapters: number }> = [
  { cls: 12, subject: 'Physics', code: 'leph', parts: 2, chapters: 15 },
  { cls: 12, subject: 'Chemistry', code: 'lech', parts: 2, chapters: 16 },
  { cls: 12, subject: 'Biology', code: 'lebo', parts: 1, chapters: 16 },
  { cls: 12, subject: 'Mathematics', code: 'lemh', parts: 2, chapters: 13 },
  { cls: 11, subject: 'Physics', code: 'keph', parts: 2, chapters: 15 },
  { cls: 11, subject: 'Chemistry', code: 'kech', parts: 2, chapters: 14 },
  { cls: 11, subject: 'Biology', code: 'kebo', parts: 1, chapters: 22 },
  { cls: 11, subject: 'Mathematics', code: 'kemh', parts: 1, chapters: 16 },
  { cls: 10, subject: 'Science', code: 'jesc', parts: 1, chapters: 16 },
  { cls: 10, subject: 'Mathematics', code: 'jemh', parts: 1, chapters: 15 },
  { cls: 9, subject: 'Science', code: 'iesc', parts: 1, chapters: 15 },
  { cls: 9, subject: 'Mathematics', code: 'iemh', parts: 1, chapters: 15 },
  { cls: 8, subject: 'Science', code: 'hesc', parts: 1, chapters: 18 },
  { cls: 8, subject: 'Mathematics', code: 'hemh', parts: 1, chapters: 16 },
  { cls: 7, subject: 'Science', bookName: 'Curiosity', code: 'gecu', parts: 1, chapters: 18 },
  { cls: 7, subject: 'Mathematics', bookName: 'Ganita Prakash', code: 'gegp', parts: 1, chapters: 15 },
  { cls: 6, subject: 'Science', bookName: 'Curiosity', code: 'fecu', parts: 1, chapters: 16 },
  { cls: 6, subject: 'Mathematics', bookName: 'Ganita Prakash', code: 'fegp', parts: 1, chapters: 14 },
  { cls: 5, subject: 'EVS', bookName: 'Looking Around', code: 'eeap', parts: 1, chapters: 22 },
  { cls: 5, subject: 'Mathematics', bookName: 'Math-Magic', code: 'eemh', parts: 1, chapters: 14 },
];

interface ManifestItem { url: string; cls: number; subject: string; bookName?: string; title: string; }

const pad2 = (n: number) => String(n).padStart(2, '0');

function buildManifest(): ManifestItem[] {
  const items: ManifestItem[] = [];
  for (const b of BOOKS) {
    for (let p = 1; p <= b.parts; p++) {
      for (let c = 1; c <= b.chapters; c++) {
        const partTag = b.parts > 1 ? ` (Part ${p})` : '';
        const bookTag = b.bookName ? ` (${b.bookName})` : '';
        items.push({
          url: `${BASE}/${b.code}${p}${pad2(c)}.pdf`,
          cls: b.cls,
          subject: b.subject,
          bookName: b.bookName,
          title: `NCERT Class ${b.cls} ${b.subject}${bookTag}${partTag} - Chapter ${c}.pdf`,
        });
      }
    }
  }
  return items;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function ensureNotebook(cls: number, subject: string, bookName?: string): Promise<string> {
  const slug = bookName ? `${subject.toLowerCase()}-${bookName.toLowerCase()}` : subject.toLowerCase();
  const id = `ncert-c${cls}-${slug.replace(/[^a-z0-9]/g, '-')}`;
  const existing = await notebookRepository.getByIdAdmin(id);
  if (existing) return id;
  const now = Date.now();
  const title = bookName ? `NCERT Class ${cls} ${subject} (${bookName})` : `NCERT Class ${cls} ${subject}`;
  const notebook: any = {
    id,
    userId: OWNER,
    owner: OWNER,
    title,
    color: 'bg-emerald-500',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    stats: { documentCount: 0, conversationCount: 0, storageUsedBytes: 0, knowledgeGraphNodes: 0, flashcardsCount: 0, quizCount: 0, masteryPercentage: 0, completionPercentage: 0 },
    learningGoals: [], weakTopics: [], strongTopics: [], auditLogs: [],
    editors: [], viewers: [],
    description: `Official NCERT ${subject} textbook (Class ${cls}) — ingested curriculum.`,
  };
  await notebookRepository.createNotebook(notebook);
  return id;
}

async function alreadyReady(notebookId: string, title: string): Promise<boolean> {
  const snap = await db.collection('notebooks').doc(notebookId).collection('sources')
    .where('title', '==', title).where('status', '==', 'READY').limit(1).get();
  return !snap.empty;
}

async function purgeFailed(notebookId: string, title: string): Promise<void> {
  const snap = await db.collection('notebooks').doc(notebookId).collection('sources')
    .where('title', '==', title).where('status', '==', 'FAILED').get();
  for (const d of snap.docs) await d.ref.delete();
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 4).toString('latin1') !== '%PDF') return null;
    return buf;
  } catch {
    return null;
  }
}

async function pollStatus(notebookId: string, sourceId: string, timeoutMs = 1800000): Promise<string> {
  const start = Date.now();
  const ref = db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId);
  while (Date.now() - start < timeoutMs) {
    const doc = await ref.get();
    const status = (doc.data() as any)?.status || 'UNKNOWN';
    if (status === 'READY' || status === 'FAILED') return status;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return 'TIMEOUT';
}

async function main() {
  const limit = hasFlag('all') ? Infinity : parseInt(arg('limit') || '2', 10);
  const classFilter = arg('class');
  const subjectFilter = arg('subject');

  let manifest = buildManifest();
  if (classFilter) manifest = manifest.filter((m) => String(m.cls) === classFilter);
  if (subjectFilter) manifest = manifest.filter((m) => m.subject.toLowerCase() === subjectFilter.toLowerCase());

  console.log(`Manifest: ${manifest.length} candidate chapters. Ingesting up to ${limit === Infinity ? 'ALL' : limit}.`);
  let ingested = 0, skipped = 0, missing = 0, failed = 0;

  for (const item of manifest) {
    if (ingested >= limit) break;
    const notebookId = await ensureNotebook(item.cls, item.subject, item.bookName);

    if (await alreadyReady(notebookId, item.title)) {
      skipped++;
      continue;
    }

    const pdf = await downloadPdf(item.url);
    if (!pdf) { missing++; continue; }

    // Remove any prior FAILED record for this chapter so re-runs stay clean.
    await purgeFailed(notebookId, item.title);

    const file: any = { originalname: item.title, mimetype: 'application/pdf', size: pdf.length, buffer: pdf };
    console.log(`-> Ingesting: ${item.title}  (${(pdf.length / 1048576).toFixed(1)} MB)`);
    const source = await sourceService.processUpload(notebookId, OWNER, file);
    const status = await pollStatus(notebookId, source.id);
    console.log(`   → ${status}  [${item.url}]`);
    if (status === 'READY') ingested++;
    else failed++;
  }

  console.log(`\n=== DONE: ingested=${ingested}, skipped(existing)=${skipped}, missing(404)=${missing}, failed=${failed} ===`);
  process.exit(0);
}

main().catch((e) => { console.error('ingest error:', e); process.exit(1); });
