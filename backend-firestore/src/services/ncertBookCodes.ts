/**
 * Maps each ingested curriculum notebook to its official NCERT book code so we can fetch the
 * REAL book cover — the first page of the book's "prelims" PDF (`<code>1ps.pdf`), which NCERT
 * ships as the illustrated front cover. This mirrors the manifest in scripts/ingest_curriculum.ts
 * (same class/subject/bookName → same derived notebook id), so covers line up with what was ingested.
 */

const BASE = 'https://ncert.nic.in/textbook/pdf';

interface BookCode { cls: number; subject: string; bookName?: string; code: string; }

const BOOKS: BookCode[] = [
  // ── STEM ──
  { cls: 12, subject: 'Physics', code: 'leph' },
  { cls: 12, subject: 'Chemistry', code: 'lech' },
  { cls: 12, subject: 'Biology', code: 'lebo' },
  { cls: 12, subject: 'Mathematics', code: 'lemh' },
  { cls: 11, subject: 'Physics', code: 'keph' },
  { cls: 11, subject: 'Chemistry', code: 'kech' },
  { cls: 11, subject: 'Biology', code: 'kebo' },
  { cls: 11, subject: 'Mathematics', code: 'kemh' },
  { cls: 10, subject: 'Science', code: 'jesc' },
  { cls: 10, subject: 'Mathematics', code: 'jemh' },
  { cls: 9, subject: 'Science', code: 'iesc' },
  { cls: 9, subject: 'Mathematics', code: 'iemh' },
  { cls: 8, subject: 'Science', code: 'hesc' },
  { cls: 8, subject: 'Mathematics', code: 'hemh' },
  { cls: 7, subject: 'Science', bookName: 'Curiosity', code: 'gecu' },
  { cls: 7, subject: 'Mathematics', bookName: 'Ganita Prakash', code: 'gegp' },
  { cls: 6, subject: 'Science', bookName: 'Curiosity', code: 'fecu' },
  { cls: 6, subject: 'Mathematics', bookName: 'Ganita Prakash', code: 'fegp' },
  { cls: 5, subject: 'EVS', bookName: 'Looking Around', code: 'eeap' },
  { cls: 5, subject: 'Mathematics', bookName: 'Math-Magic', code: 'eemh' },

  // ── Social Science / humanities ──
  { cls: 7, subject: 'Social Science', code: 'gess' },
  { cls: 8, subject: 'Social Science', code: 'hess' },
  { cls: 10, subject: 'Social Science', code: 'jess' },
  { cls: 11, subject: 'History', code: 'kehs' },
  { cls: 12, subject: 'History', code: 'lehs' },
  { cls: 11, subject: 'Geography', code: 'kegy' },
  { cls: 12, subject: 'Geography', code: 'legy' },
  { cls: 11, subject: 'Political Science', code: 'keps' },
  { cls: 12, subject: 'Political Science', code: 'leps' },
  { cls: 11, subject: 'Economics', code: 'keec' },
  { cls: 12, subject: 'Economics', code: 'leec' },

  // ── English ──
  { cls: 5, subject: 'English', bookName: 'Marigold', code: 'eeen' },
  { cls: 7, subject: 'English', bookName: 'Honeycomb', code: 'gehc' },
  { cls: 7, subject: 'English', bookName: 'An Alien Hand', code: 'geah' },
  { cls: 8, subject: 'English', bookName: 'Honeydew', code: 'hehd' },
  { cls: 9, subject: 'English', bookName: 'Beehive', code: 'iebe' },
  { cls: 10, subject: 'English', bookName: 'First Flight', code: 'jeff' },
  { cls: 10, subject: 'English', bookName: 'Footprints Without Feet', code: 'jefp' },
  { cls: 11, subject: 'English', bookName: 'Hornbill', code: 'kehb' },
  { cls: 11, subject: 'English', bookName: 'Woven Words', code: 'keww' },
  { cls: 12, subject: 'English', bookName: 'Flamingo', code: 'lefl' },
  { cls: 12, subject: 'English', bookName: 'Vistas', code: 'levt' },

  // ── Hindi ──
  { cls: 7, subject: 'Hindi', bookName: 'Vasant', code: 'ghvs' },
  { cls: 7, subject: 'Hindi', bookName: 'Durva', code: 'ghdv' },
  { cls: 7, subject: 'Hindi', bookName: 'Mahabharat', code: 'ghmh' },
  { cls: 8, subject: 'Hindi', bookName: 'Vasant', code: 'hhvs' },
  { cls: 8, subject: 'Hindi', bookName: 'Durva', code: 'hhdv' },
  { cls: 8, subject: 'Hindi', bookName: 'Bharat ki Khoj', code: 'hhbk' },
  { cls: 10, subject: 'Hindi', bookName: 'Kshitij', code: 'jhks' },
  { cls: 10, subject: 'Hindi', bookName: 'Kritika', code: 'jhkr' },
  { cls: 10, subject: 'Hindi', bookName: 'Sparsh', code: 'jhsp' },
  { cls: 10, subject: 'Hindi', bookName: 'Sanchayan', code: 'jhsy' },
  { cls: 11, subject: 'Hindi', bookName: 'Vitan', code: 'khvt' },
  { cls: 11, subject: 'Hindi', bookName: 'Antra', code: 'khat' },
  { cls: 12, subject: 'Hindi', bookName: 'Vitan', code: 'lhvt' },
  { cls: 12, subject: 'Hindi', bookName: 'Antra', code: 'lhat' },

  // ── Gap-discovery additions ──
  { cls: 6, subject: 'Social Science', bookName: 'Exploring Society', code: 'fees' },
  { cls: 6, subject: 'English', bookName: 'Poorvi', code: 'fepr' },
  { cls: 6, subject: 'Hindi', bookName: 'Malhar', code: 'fhml' },
  { cls: 8, subject: 'English', bookName: 'It So Happened', code: 'heih' },
  { cls: 11, subject: 'English', bookName: 'Snapshots', code: 'kesp' },
  { cls: 11, subject: 'Hindi', bookName: 'Aroh', code: 'khar' },
  { cls: 11, subject: 'Hindi', bookName: 'Antral', code: 'khan' },
  { cls: 12, subject: 'Hindi', bookName: 'Aroh', code: 'lhar' },
  { cls: 12, subject: 'Hindi', bookName: 'Antral', code: 'lhan' },

  // ── Sanskrit ──
  { cls: 6, subject: 'Sanskrit', bookName: 'Kaushal Bodh', code: 'fskkb1' },
  { cls: 7, subject: 'Sanskrit', bookName: 'Ruchira', code: 'ghsk1' },
  { cls: 8, subject: 'Sanskrit', bookName: 'Ruchira', code: 'hhsk1' },
  { cls: 9, subject: 'Sanskrit', bookName: 'Sharada', code: 'ihsh1' },
  { cls: 10, subject: 'Sanskrit', bookName: 'Shemushi', code: 'jhsk1' },
  { cls: 11, subject: 'Sanskrit', bookName: 'Bhaswati', code: 'khsk1' },
  { cls: 11, subject: 'Sanskrit', bookName: 'Shashwati', code: 'khsk2' },
  { cls: 11, subject: 'Sanskrit', bookName: 'Sanskrit Sahitya Parichay', code: 'klss1' },
  { cls: 12, subject: 'Sanskrit', bookName: 'Bhaswati', code: 'lhsk1' },
  { cls: 12, subject: 'Sanskrit', bookName: 'Shashwati', code: 'lhsk2' },
];

// Replicates the id derivation from scripts/ingest_curriculum.ts EXACTLY so the lookup keys match.
function notebookIdFor(cls: number, subject: string, bookName?: string): string {
  const slug = bookName ? `${subject.toLowerCase()}-${bookName.toLowerCase()}` : subject.toLowerCase();
  return `ncert-c${cls}-${slug.replace(/[^a-z0-9]/g, '-')}`;
}

const CODE_BY_ID = new Map<string, string>();
for (const b of BOOKS) CODE_BY_ID.set(notebookIdFor(b.cls, b.subject, b.bookName), b.code);

/** The official NCERT cover URL (prelims page 1 = illustrated front cover) for a notebook, or null. */
export function ncertCoverUrl(notebookId: string): string | null {
  const code = CODE_BY_ID.get(notebookId);
  return code ? `${BASE}/${code}1ps.pdf` : null;
}
