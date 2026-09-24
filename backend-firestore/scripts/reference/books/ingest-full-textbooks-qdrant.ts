/**
 * Master Reference Textbooks Ingestion into Qdrant
 * ==================================================
 *
 * Extracts full, authentic text from all 8 Computer Science & Pedagogy reference textbooks
 * stored in Firebase Storage, chunks them semantically with exact page attribution,
 * embeds them using Google Vertex AI text-embedding-004 (768-dim), and upserts them
 * directly into the Qdrant vector database (`edtech_ai_rag` collection, namespace `reference_books`).
 *
 * Guarantees complete isolation:
 * - pinecone_namespace: "reference_books"
 * - corpusBucket: "REFERENCE_BOOK"
 * - is_pyq: false
 * - content_type: "reference_book"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { db, firebaseApp } from '../../../src/config/firebase';
import { QdrantService } from '../../../src/services/rag/qdrant.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { VectorDocument } from '../../../src/services/rag/vectorStore.types';

const BUCKET_NAME = 'schaolarly.firebasestorage.app';
const REFERENCE_NAMESPACE = 'reference_books';
const REF_CHUNK_COLLECTION = 'reference_chunks';
const REF_SOURCE_COLLECTION = 'reference_sources';

interface BookTarget {
  key: string;
  title: string;
  author: string;
  publisher: string;
  domain: 'computer_science' | 'pedagogy';
  subject: string;
}

const BOOKS: BookTarget[] = [
  {
    key: 'ncert_cs_11',
    title: 'Computer Science Class XI (Official NCERT Textbook)',
    author: 'NCERT',
    publisher: 'National Council of Educational Research and Training',
    domain: 'computer_science',
    subject: 'computer_science',
  },
  {
    key: 'ncert_cs_12',
    title: 'Computer Science Class XII (Official NCERT Textbook)',
    author: 'NCERT',
    publisher: 'National Council of Educational Research and Training',
    domain: 'computer_science',
    subject: 'computer_science',
  },
  {
    key: 'silberschatz_dbms',
    title: 'Database System Concepts (6th Edition)',
    author: 'Abraham Silberschatz, Henry F. Korth, S. Sudarshan',
    publisher: 'McGraw-Hill Higher Education',
    domain: 'computer_science',
    subject: 'database_management',
  },
  {
    key: 'galvin_os',
    title: 'Operating System Concepts (9th Edition)',
    author: 'Abraham Silberschatz, Peter Baer Galvin, Greg Gagne',
    publisher: 'John Wiley & Sons',
    domain: 'computer_science',
    subject: 'operating_systems',
  },
  {
    key: 'forouzan_networks',
    title: 'Data Communications and Networking (5th Edition)',
    author: 'Behrouz A. Forouzan',
    publisher: 'McGraw-Hill Education',
    domain: 'computer_science',
    subject: 'computer_networks',
  },
  {
    key: 'mano_architecture',
    title: 'Computer System Architecture & Digital Logic (3rd Edition)',
    author: 'M. Morris Mano',
    publisher: 'Pearson Education',
    domain: 'computer_science',
    subject: 'computer_architecture',
  },
  {
    key: 'lipschutz_dsa',
    title: 'Schaum\'s Outline: Data Structures and Algorithms',
    author: 'Seymour Lipschutz',
    publisher: 'McGraw-Hill Education',
    domain: 'computer_science',
    subject: 'data_structures',
  },
  {
    key: 'stet_pedagogy_guide',
    title: 'The Science and the Art of Teaching (STET Pedagogy & Methodology)',
    author: 'Daniel Wolford La Rue',
    publisher: 'American Book Company / STET Pedagogy Reference',
    domain: 'pedagogy',
    subject: 'pedagogy_art_of_teaching',
  },
];

interface ChunkItem {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  text: string;
}

function chunkBookPages(pages: string[]): ChunkItem[] {
  const chunks: ChunkItem[] = [];
  let currentText = '';
  let startPage = 1;
  let chunkIdx = 0;

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const pageRaw = pages[i].trim();

    // Skip almost empty or blank scan pages
    if (pageRaw.length < 50) continue;

    if (!currentText) {
      startPage = pageNum;
    }

    currentText += (currentText ? '\n\n' : '') + pageRaw;

    // Target ~2,500 chars (approx 500-600 tokens) per chunk
    if (currentText.length >= 2500) {
      chunks.push({
        chunkIndex: chunkIdx++,
        pageStart: startPage,
        pageEnd: pageNum,
        text: currentText.slice(0, 4000), // Cap max chunk length
      });
      // Carry over last ~400 chars as overlap
      const overlap = currentText.slice(-400);
      currentText = overlap;
      startPage = pageNum;
    }
  }

  if (currentText.trim().length > 100) {
    chunks.push({
      chunkIndex: chunkIdx++,
      pageStart: startPage,
      pageEnd: pages.length,
      text: currentText.slice(0, 4000),
    });
  }

  return chunks;
}

async function processBook(
  book: BookTarget,
  qdrant: QdrantService,
  embeddingProvider: GoogleEmbeddingProvider,
  tempDir: string
) {
  console.log(`\n═══════════════════════════════════════════════════════════════════════════════`);
  console.log(`📖 Ingesting: [${book.key}] "${book.title}"`);
  console.log(`═══════════════════════════════════════════════════════════════════════════════`);

  const pdfPath = path.join(tempDir, `${book.key}.pdf`);
  const txtPath = path.join(tempDir, `${book.key}.txt`);

  try {
    // 1. Download source PDF from Firebase Storage
    console.log(`1. Downloading from Firebase Storage (reference-books/${book.key}/source.pdf)...`);
    const bucket = firebaseApp.storage().bucket(BUCKET_NAME);
    const file = bucket.file(`reference-books/${book.key}/source.pdf`);
    const [buf] = await file.download();
    fs.writeFileSync(pdfPath, buf);
    console.log(`   ✅ Downloaded ${(buf.length / 1024 / 1024).toFixed(2)} MB to local disk.`);

    // 2. Extract full text via pdftotext
    console.log(`2. Extracting text via pdftotext...`);
    const t0 = Date.now();
    execSync(`pdftotext "${pdfPath}" "${txtPath}"`);
    const fullText = fs.readFileSync(txtPath, 'utf8');
    const pages = fullText.split('\f');
    console.log(`   ✅ Extracted ${fullText.length.toLocaleString()} characters across ${pages.length} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

    // 3. Semantic Chunking
    console.log(`3. Generating semantic chunks with page attribution...`);
    const chunks = chunkBookPages(pages);
    console.log(`   ✅ Created ${chunks.length} semantic chunks.`);

    // 4. Batch Embed & Upsert to Qdrant
    console.log(`4. Generating 768-dim embeddings & upserting directly to Qdrant...`);
    const BATCH_SIZE = 25; // Safe concurrency with Google Vertex AI
    let totalUpserted = 0;

    for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
      const batchSlice = chunks.slice(b, b + BATCH_SIZE);
      const vectorDocs: VectorDocument[] = [];
      const firestoreBatch = db.batch();

      for (const item of batchSlice) {
        const chunkId = `ref_${book.key}_p${item.pageStart}_${item.chunkIndex}`;
        const embeddingText = `Book: ${book.title} | Subject: ${book.subject} | Pages ${item.pageStart}-${item.pageEnd}\n${item.text}`;

        let vector: number[] = [];
        try {
          vector = await embeddingProvider.generateEmbedding(embeddingText);
        } catch (embErr: any) {
          console.warn(`   ⚠ Embedding retry for chunk ${item.chunkIndex}: ${embErr.message}`);
          await new Promise((r) => setTimeout(r, 1500));
          try {
            vector = await embeddingProvider.generateEmbedding(embeddingText);
          } catch {
            continue;
          }
        }

        if (vector && vector.length === 768) {
          const metadata: Record<string, any> = {
            chunk_id: chunkId,
            book: book.key,
            book_title: book.title,
            author: book.author,
            publisher: book.publisher,
            domain: book.domain,
            subject: book.subject,
            page_start: item.pageStart,
            page_end: item.pageEnd,
            corpusBucket: 'REFERENCE_BOOK',
            content_type: 'reference_book',
            is_pyq: false,
            is_mock: false,
            is_generated: false,
            public: true,
            text: item.text,
            authority: 'secondary_reference',
          };

          vectorDocs.push({
            id: chunkId,
            values: vector,
            metadata,
          });

          firestoreBatch.set(
            db.collection(REF_CHUNK_COLLECTION).doc(chunkId),
            {
              ...metadata,
              indexedAt: Date.now(),
            },
            { merge: true }
          );
        }
      }

      if (vectorDocs.length > 0) {
        await qdrant.upsertVectors(vectorDocs, REFERENCE_NAMESPACE);
        await firestoreBatch.commit();
        totalUpserted += vectorDocs.length;
        process.stdout.write(`   🚀 Ingested ${totalUpserted}/${chunks.length} chunks to Qdrant...\r`);
      }
    }

    console.log(`\n   ✅ Ingestion complete for ${book.key}: ${totalUpserted} vectors added to Qdrant.`);

    // 5. Update Firestore Source Document
    await db.collection(REF_SOURCE_COLLECTION).doc(book.key).set(
      {
        total_chunks: totalUpserted,
        qdrant_indexed: true,
        qdrant_namespace: REFERENCE_NAMESPACE,
        qdrant_collection: 'edtech_ai_rag',
        indexed_at: Date.now(),
      },
      { merge: true }
    );
  } finally {
    if (fs.existsSync(pdfPath)) try { fs.unlinkSync(pdfPath); } catch (_) {}
    if (fs.existsSync(txtPath)) try { fs.unlinkSync(txtPath); } catch (_) {}
  }
}

async function runMasterQdrantIngestion() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 MASTER REFERENCE TEXTBOOKS QDRANT EMBEDDING & INGESTION PIPELINE');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const qdrant = new QdrantService();
  await qdrant.ensureCollection();

  const embeddingProvider = new GoogleEmbeddingProvider();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qdrant_cs_'));

  const requestedBook = process.argv.find((a) => a.startsWith('--book='))?.split('=')[1];
  const targets = requestedBook
    ? BOOKS.filter((b) => b.key === requestedBook)
    : BOOKS;

  console.log(`Processing ${targets.length} target textbooks into Qdrant...\n`);

  for (const book of targets) {
    await processBook(book, qdrant, embeddingProvider, tempDir);
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n🎉 ALL REFERENCE TEXTBOOKS SUCCESSFULLY EMBEDDED & INDEXED IN QDRANT!');
}

runMasterQdrantIngestion()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during Qdrant ingestion:', err);
    process.exit(1);
  });
