import { db, firebaseApp } from '../config/firebase';
import { env } from '../config/env';

const BASE = 'https://ncert.nic.in/textbook/pdf';

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

const pad2 = (n: number) => String(n).padStart(2, '0');

function buildManifest() {
  const map = new Map<string, string>(); // title -> URL
  for (const b of BOOKS) {
    for (let p = 1; p <= b.parts; p++) {
      for (let c = 1; c <= b.chapters; c++) {
        const partTag = b.parts > 1 ? ` (Part ${p})` : '';
        const bookTag = b.bookName ? ` (${b.bookName})` : '';
        const title = `NCERT Class ${b.cls} ${b.subject}${bookTag}${partTag} - Chapter ${c}.pdf`;
        map.set(title, `${BASE}/${b.code}${p}${pad2(c)}.pdf`);
      }
    }
  }
  return map;
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

async function backfill() {
  const manifestMap = buildManifest();
  if (!env.FIREBASE_STORAGE_BUCKET) throw new Error("FIREBASE_STORAGE_BUCKET not set");
  const bucket = firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET);
  
  const notebooksSnap = await db.collection('notebooks').get();
  
  let processed = 0, skipped = 0, errors = 0;
  
  for (const nb of notebooksSnap.docs) {
    const notebookId = nb.id;
    const sourcesSnap = await db.collection('notebooks').doc(notebookId).collection('sources').get();
    
    for (const srcDoc of sourcesSnap.docs) {
      const source = srcDoc.data();
      
      // We only care about sources that are READY or INDEXING and lack a gcsPath
      if (!source.gcsPath && source.title.includes('NCERT')) {
        const url = manifestMap.get(source.title);
        if (url) {
          console.log(`Backfilling missing storage for: ${source.title}`);
          const pdfBuffer = await downloadPdf(url);
          if (pdfBuffer) {
            try {
              const storagePath = `users/${source.userId}/notebooks/${notebookId}/${source.id}/${source.title}`;
              const fileRef = bucket.file(storagePath);
              await fileRef.save(pdfBuffer, { contentType: 'application/pdf' });
              
              const gcsPath = `gs://${env.FIREBASE_STORAGE_BUCKET}/${storagePath}`;
              await srcDoc.ref.update({ gcsPath });
              
              console.log(` ✅ Uploaded and updated database: ${source.title}`);
              processed++;
            } catch (err: any) {
              console.error(` ❌ Failed to upload ${source.title}:`, err.message);
              errors++;
            }
          } else {
             console.log(` ⚠️ Could not download PDF from NIC for: ${source.title}`);
             errors++;
          }
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }
  }
  
  console.log(`\n=== BACKFILL DONE: uploaded=${processed}, skipped=${skipped}, errors=${errors} ===`);
  process.exit(0);
}

backfill().catch(console.error);
