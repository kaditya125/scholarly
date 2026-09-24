/**
 * Master Reference Books & Syllabi Uploader to Firebase Storage (FULL UNABRIDGED EDITIONS)
 * =========================================================================================
 *
 * Downloads and stores complete, unabridged multi-hundred page PDF textbooks and reference
 * manuals for the Bihar STET and BPSC TRE Computer Science syllabus directly into
 * Firebase Storage (`schaolarly.firebasestorage.app`) under `reference-books/<bookKey>/source.pdf`.
 *
 * Updates `reference_sources` in Firestore with the verified storage path, file size,
 * page count, and public reference status.
 */

import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { firebaseApp, db } from '../../../src/config/firebase';
import { REF_SOURCE_COLLECTION } from './contract';

const BUCKET_NAME = 'schaolarly.firebasestorage.app';

interface FullBookDef {
  key: string;
  title: string;
  author: string;
  publisher: string;
  edition: string;
  sourceUrl: string;
}

const FULL_CS_BOOKS: FullBookDef[] = [
  {
    key: 'silberschatz_dbms',
    title: 'Database System Concepts',
    author: 'Abraham Silberschatz, Henry F. Korth, S. Sudarshan',
    publisher: 'McGraw-Hill Higher Education',
    edition: '6th Edition / Unabridged',
    sourceUrl: 'https://github.com/TusharKukra/GateBooks/raw/master/DBMS%20Korth.pdf',
  },
  {
    key: 'galvin_os',
    title: 'Operating System Concepts',
    author: 'Abraham Silberschatz, Peter Baer Galvin, Greg Gagne',
    publisher: 'John Wiley & Sons',
    edition: '9th Edition / Unabridged',
    sourceUrl: 'https://github.com/TusharKukra/GateBooks/raw/master/(OS)%20Operating%20System%20Concepts%20(9th%20Ed)%20-%20Gagne,%20Silberschatz,%20and%20Galvin.pdf',
  },
  {
    key: 'forouzan_networks',
    title: 'Data Communications and Networking',
    author: 'Behrouz A. Forouzan',
    publisher: 'McGraw-Hill Education',
    edition: '5th Edition / Unabridged',
    sourceUrl: 'https://github.com/TusharKukra/GateBooks/raw/master/(CN%202)%20DATA_COMMUNICATIONS_AND_NETWORKING_McGra.pdf',
  },
  {
    key: 'mano_architecture',
    title: 'Computer System Architecture & Digital Logic',
    author: 'M. Morris Mano',
    publisher: 'Pearson Education',
    edition: '3rd Edition / Unabridged',
    sourceUrl: 'https://archive.org/download/computer-system-architecture-morris-mano-third-edition/computer-system-architecture-morris-mano-third-edition.pdf',
  },
  {
    key: 'lipschutz_dsa',
    title: "Schaum's Outline: Data Structures and Algorithms",
    author: 'Seymour Lipschutz',
    publisher: 'McGraw-Hill (Schaum\'s Outlines)',
    edition: 'Classic Edition / Unabridged',
    sourceUrl: 'https://media.githubusercontent.com/media/rising-flare/books/main/CSE%203/Schaum%27s%20Outline%20of%20Theory%20and%20Problems%20of%20Data%20Structures%20-%20Seymour%20Lipschutz.pdf',
  },
  {
    key: 'stet_pedagogy_guide',
    title: 'The Science and the Art of Teaching (STET Pedagogy & Methodology)',
    author: 'Daniel Wolford La Rue / Educational Reference Guide',
    publisher: 'American Book Company / Bihar STET Pedagogy Reference',
    edition: 'Complete Edition / Unabridged',
    sourceUrl: 'https://archive.org/download/scienceartofteac00larurich/scienceartofteac00larurich.pdf',
  },
];

async function downloadAndUploadFullBook(book: FullBookDef) {
  console.log(`\n═══════════════════════════════════════════════════════════════════════════════`);
  console.log(`📥 Processing Full Unabridged Textbook: [${book.key}]`);
  console.log(`   "${book.title}" by ${book.author}`);
  console.log(`   Edition: ${book.edition} | Publisher: ${book.publisher}`);
  console.log(`═══════════════════════════════════════════════════════════════════════════════`);

  const tempDir = path.join(__dirname, '..', '..', 'tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFilePath = path.join(tempDir, `${book.key}_full.pdf`);

  try {
    console.log(`1. Downloading full textbook from: ${book.sourceUrl}`);
    const curlCmd = `curl.exe -L --fail --silent --show-error -o "${tempFilePath}" "${book.sourceUrl}"`;
    execSync(curlCmd, { stdio: 'inherit', timeout: 180000 });

    const stats = fs.statSync(tempFilePath);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   ✅ Download completed: ${sizeMb} MB`);

    console.log(`2. Inspecting page count with pdf-lib...`);
    const fileBuf = fs.readFileSync(tempFilePath);
    let pageCount = 0;
    try {
      const pdfDoc = await PDFDocument.load(fileBuf, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
      console.log(`   ✅ Total Pages: ${pageCount}`);
    } catch (parseErr: any) {
      console.warn(`   ⚠ Failed to parse page count directly: ${parseErr.message}`);
    }

    const storagePath = `reference-books/${book.key}/source.pdf`;
    console.log(`3. Streaming to Firebase Storage: gs://${BUCKET_NAME}/${storagePath}...`);

    const bucket = firebaseApp.storage().bucket(BUCKET_NAME);
    await bucket.upload(tempFilePath, {
      destination: storagePath,
      resumable: false,
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          bookKey: book.key,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          edition: book.edition,
          pageCount: String(pageCount),
          fileSizeBytes: String(stats.size),
          unabridged: 'true',
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`   ✅ Upload confirmed to Firebase Storage!`);

    console.log(`4. Updating Firestore reference_sources record...`);
    await db.collection(REF_SOURCE_COLLECTION).doc(book.key).set({
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      edition: book.edition,
      storage_path: storagePath,
      storage_url: `gs://${BUCKET_NAME}/${storagePath}`,
      storage_status: 'available',
      pdf_page_count: pageCount,
      file_size_bytes: stats.size,
      unabridged: true,
      updatedAt: Date.now(),
    }, { merge: true });

    console.log(`   ✅ Firestore record ${book.key} successfully updated.`);
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`   🧹 Temporary file cleaned up.`);
      } catch (_) {}
    }
  }
}

async function runFullTextbooksPipeline() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 BIHAR STET & BPSC TRE FULL UNABRIDGED REFERENCE TEXTBOOKS UPLOAD PIPELINE');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  for (const book of FULL_CS_BOOKS) {
    await downloadAndUploadFullBook(book);
  }

  console.log('\n🎉 ALL FULL UNABRIDGED TEXTBOOKS SUCCESSFULLY INGESTED INTO FIREBASE STORAGE!');
}

runFullTextbooksPipeline()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during full textbooks pipeline:', err);
    process.exit(1);
  });

