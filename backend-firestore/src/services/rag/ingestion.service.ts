import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { db as adminDb } from '../../config/firebase';
import { FileParserService } from '../fileParser.service';
import { pineconeService, VectorDocument } from './pinecone.service';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';

export interface IngestionMetadata {
  notebookId: string;
  userId: string;
  filename: string;
  source: string;
  language: string;
  tags?: string[];
  documentId?: string; // unique ID for the document
  authority?: string; // NCERT, GOVERNMENT, STANDARD_TEXTBOOK, USER_UPLOAD, etc.
  exam?: string; // e.g. UPSC, NEET, JEE
  board?: string;
  class?: string;
  subject?: string; // e.g. History, Physics
  syllabusTopic?: string;
  book?: string;
  chapter?: string;
  pageNumber?: number;
  paragraphIndex?: number;
}

export class IngestionService {
  private embeddingProvider: GoogleEmbeddingProvider;
  
  // Configurable quota limit (e.g., 50MB per user, 10MB per file)
  private readonly MAX_FILE_SIZE_MB = 10;
  private readonly MAX_USER_QUOTA_MB = 100;

  constructor() {
    this.embeddingProvider = new GoogleEmbeddingProvider();
  }

  private async checkQuotas(userId: string, fileSizeInBytes: number): Promise<void> {
    const fileSizeMB = fileSizeInBytes / (1024 * 1024);
    if (fileSizeMB > this.MAX_FILE_SIZE_MB) {
      throw new Error(`File size exceeds the maximum limit of ${this.MAX_FILE_SIZE_MB}MB.`);
    }

    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const currentUsageMB = userDoc.data()?.storageUsageMB || 0;

    if (currentUsageMB + fileSizeMB > this.MAX_USER_QUOTA_MB) {
      throw new Error(`Storage quota exceeded. You have ${currentUsageMB.toFixed(2)}MB used out of ${this.MAX_USER_QUOTA_MB}MB.`);
    }

    // Update quota
    await userRef.set({ storageUsageMB: currentUsageMB + fileSizeMB }, { merge: true });
  }

  /**
   * Intelligently chunks text by sentences, preserving boundaries with overlap.
   */
  private chunkText(text: string, targetTokens: number = 500, overlapTokens: number = 100): string[] {
    // 1 token ~ 4 characters approx
    const targetLength = targetTokens * 4;
    const overlapLength = overlapTokens * 4;

    // Basic sentence splitting (naive but effective for most English texts)
    // Splits on . ! ? followed by space and capital letter, or newlines
    const sentences = text.match(/[^.!?]+[.!?]+(?=\s+[A-Z]|\s*$)|[^.!?]+/g) || [text];
    
    const chunks: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      if (currentChunk.length + sentence.length > targetLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Start new chunk with overlap from previous sentences
        let overlap = '';
        let backtrack = i - 1;
        while (backtrack >= 0 && overlap.length < overlapLength) {
          overlap = sentences[backtrack].trim() + ' ' + overlap;
          backtrack--;
        }
        currentChunk = overlap + sentence + ' ';
      } else {
        currentChunk += sentence + ' ';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Main ingestion pipeline
   */
  async ingestDocument(
    base64Data: string, 
    mimeType: string, 
    metadata: IngestionMetadata
  ): Promise<string> {
    
    const bufferSize = Buffer.from(base64Data, 'base64').length;
    await this.checkQuotas(metadata.userId, bufferSize);

    // 1. Extract Text
    const parsedPages = await FileParserService.extractText(base64Data, mimeType, metadata.filename);
    const rawText = parsedPages.map(p => p.text).join('\n');
    if (!rawText || rawText.includes('[Error')) {
      throw new Error(`Failed to extract text from ${metadata.filename}`);
    }

    // 2. Clean formatting (basic)
    const cleanedText = rawText.replace(/\u0000/g, '').trim();

    // 3. Chunk intelligently
    const chunks = this.chunkText(cleanedText);
    if (chunks.length === 0) {
      throw new Error('No valid text found to index.');
    }

    // 4. Generate embeddings
    const embeddings = await this.embeddingProvider.generateEmbeddings(chunks);

    const documentId = metadata.documentId || uuidv4();
    const vectorDocs: VectorDocument[] = [];

    // 5. Prepare vector documents
    for (let i = 0; i < chunks.length; i++) {
      vectorDocs.push({
        id: `${documentId}-chunk-${i}`,
        values: embeddings[i],
        metadata: {
          notebookId: metadata.notebookId,
          userId: metadata.userId,
          filename: metadata.filename,
          source: metadata.source,
          language: metadata.language,
          authority: metadata.authority || 'USER_UPLOAD',
          exam: metadata.exam || '',
          board: metadata.board || '',
          class: metadata.class || '',
          subject: metadata.subject || '',
          book: metadata.book || '',
          chapter: metadata.chapter || '',
          pageNumber: metadata.pageNumber || 0,
          paragraphIndex: i, // Rough estimation based on chunk index
          tags: metadata.tags || [],
          documentId,
          chunkIndex: i,
          text: chunks[i], // Store text for retrieval
          ocrConfidence: 0.95, // Mock OCR confidence
          pageCoordinates: '[[0,0],[0,0]]', // Mock bounding box coordinates for frontend highlighting
          uploadedAt: new Date().toISOString()
        }
      });
    }

    // 6. Save to Pinecone
    await pineconeService.upsertVectors(vectorDocs, env.PINECONE_NAMESPACE);

    // 7. Store Document Metadata to Firestore (Knowledge Base)
    await adminDb.collection('notebooks').doc(metadata.notebookId).collection('documents').doc(documentId).set({
      filename: metadata.filename,
      source: metadata.source,
      language: metadata.language,
      tags: metadata.tags || [],
      chunkCount: chunks.length,
      uploadedAt: new Date().toISOString(),
      fileSizeBytes: bufferSize,
    });

    return documentId;
  }
}

export const ingestionService = new IngestionService();
