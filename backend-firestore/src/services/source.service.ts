import { v4 as uuidv4 } from 'uuid';
import { sourceRepository } from '../repositories/source.repository';
import { notebookService } from './notebook.service';
import { DocumentSource, ExtractionMetadata } from '../types';
import { FileParserService } from './fileParser.service';
import { TextChunker } from '../utils/textChunker';
import { GoogleEmbeddingProvider } from './ai/providers/google-embedding.provider';
import { pineconeService } from './rag/pinecone.service';
import { GeminiProvider } from './ai/gemini.provider';
import { RecordMetadata } from '@pinecone-database/pinecone';

export class SourceService {
  async processUpload(notebookId: string, userId: string, file: Express.Multer.File): Promise<DocumentSource> {
    const source: DocumentSource = {
      id: uuidv4(),
      notebookId,
      userId,
      title: file.originalname,
      type: file.originalname.split('.').pop()?.toUpperCase() || 'UNKNOWN',
      sizeBytes: file.size,
      status: 'PENDING',
      chunksExtracted: 0,
      conceptsExtracted: 0,
      authorityScore: 0.8, // Default
      processingDurationMs: 0,
      createdAt: Date.now()
    };

    await sourceRepository.createSource(source);
    await notebookService.addTimelineEvent(notebookId, 'DOCUMENT_UPLOADED', `Uploaded ${source.title}`);

    // Run processing in background
    this.processFileBackground(source, file).catch(err => console.error('Processing error:', err));

    return source;
  }

  private async processFileBackground(source: DocumentSource, file: Express.Multer.File) {
    const startTime = Date.now();
    try {
      // 1. Extraction
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'EXTRACTING' });
      const base64 = file.buffer.toString('base64');
      const text = await FileParserService.extractText(base64, file.mimetype, file.originalname);
      
      // Extract Metadata (Chapters, headings, definitions, etc.)
      const metadata = await this.extractRichMetadata(text);

      // 2. Chunking
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'CHUNKING' });
      const chunks = TextChunker.chunkText(text, 1000, 200);

      // 3. Embedding
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'EMBEDDING' });
      const embeddingProvider = new GoogleEmbeddingProvider();
      
      // Batch embedding to avoid rate limits
      const vectors = [];
      const batchSize = 50;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        const embeddings = await embeddingProvider.generateEmbeddings(batchChunks);
        
        for (let j = 0; j < embeddings.length; j++) {
          const pineconeMetadata: RecordMetadata = {
            notebookId: source.notebookId,
            sourceId: source.id,
            text: batchChunks[j]
          };
          vectors.push({
            id: `${source.id}_chunk_${i + j}`,
            values: embeddings[j],
            metadata: pineconeMetadata
          });
        }
      }

      // 4. Indexing (Pinecone)
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'INDEXING' });
      await pineconeService.upsertVectors(vectors);

      // 5. Completion
      const duration = Date.now() - startTime;
      await sourceRepository.updateSource(source.notebookId, source.id, { 
        status: 'READY',
        chunksExtracted: chunks.length,
        conceptsExtracted: metadata.definitions.length + metadata.importantFacts.length,
        metadata: metadata,
        processingDurationMs: duration
      });
      
      await notebookService.addTimelineEvent(source.notebookId, 'DOCUMENT_INDEXED', `Successfully indexed ${source.title} (${chunks.length} chunks)`);

    } catch (error: any) {
      console.error(`Failed to process source ${source.id}:`, error);
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'FAILED' });
    }
  }

  private async extractRichMetadata(text: string): Promise<ExtractionMetadata> {
    const ai = new GeminiProvider();
    
    // We only send the first 10,000 chars to avoid massive token limits for extraction
    const textSample = text.substring(0, 10000);
    
    const prompt = `Extract structured learning metadata from the following text. 
    Respond ONLY in valid JSON matching this schema:
    {
      "chapters": ["string"],
      "headings": ["string"],
      "definitions": [{"term": "string", "definition": "string"}],
      "theorems": ["string"],
      "formulae": ["string"],
      "importantFacts": ["string"],
      "keywords": ["string"],
      "people": ["string"],
      "places": ["string"],
      "dates": ["string"],
      "learningObjectives": ["string"],
      "difficultyLevel": "Easy" | "Medium" | "Hard",
      "estimatedStudyTimeMinutes": number
    }
    
    TEXT:
    ${textSample}`;

    try {
      const response = await ai.generateResponse([{ role: 'user', content: prompt }], "You are a data extraction AI. Output strictly valid JSON without markdown formatting.");
      // Clean markdown formatting if present
      let jsonStr = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
      const metadata = JSON.parse(jsonStr);
      return metadata as ExtractionMetadata;
    } catch (e) {
      console.error("Failed to extract metadata:", e);
      // Return empty fallback
      return {
        chapters: [], headings: [], definitions: [], theorems: [], formulae: [], 
        importantFacts: [], keywords: [], people: [], places: [], dates: [], learningObjectives: [],
        difficultyLevel: 'Medium', estimatedStudyTimeMinutes: 30
      };
    }
  }

  async deleteSource(notebookId: string, sourceId: string): Promise<void> {
    await sourceRepository.deleteSource(notebookId, sourceId);
    // Also delete from Pinecone
    // Note: pineconeService.deleteVectors doesn't easily support deleting by metadata filter in the free tier
    // So we might need to store chunk IDs or just accept they are orphaned for now if we can't delete them.
    // Let's assume we can't easily delete by metadata in this basic wrapper.
  }
}

export const sourceService = new SourceService();
