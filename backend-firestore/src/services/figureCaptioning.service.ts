import { RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../config/env';
import { firebaseApp } from '../config/firebase';
import { DocumentSource } from '../types';
import { GeminiProvider } from './ai/gemini.provider';
import { GoogleEmbeddingProvider } from './ai/providers/google-embedding.provider';
import { pineconeService } from './rag/pinecone.service';
import { resolveNotebookContext, EMBEDDING_VERSION, CHUNK_VERSION } from './vectorMetadata';
import { METADATA_VERSION } from '../config/featureFlags';
import { safeJsonParse } from '../utils/safeJson';
import { FiguresSchema, Figure } from '../utils/figureSchema';
import { IngestionDiagnostics } from './ingestionDiagnostics';

/**
 * Figures & diagrams (Part 10).
 *
 * Uses the multimodal model to identify + caption the figures in a source PDF, stores them as a
 * FIGURES learning asset, and embeds each caption into the shared vector index (tagged
 * contentType='figure') so retrieval can surface relevant diagrams alongside text. Additive and
 * flag-gated; reuses the existing vision, embedding, safe-JSON and metadata infrastructure.
 */

export class FigureCaptioningService {
  /**
   * Caption the figures in a source document and index their captions. Returns the number of
   * figures captioned. Never throws for model/parse issues — degrades to 0.
   */
  async captionFigures(
    source: DocumentSource,
    base64: string,
    mimeType: string,
    diag?: IngestionDiagnostics,
  ): Promise<number> {
    let figures: Figure[] = [];
    try {
      const ai = new GeminiProvider();
      const res = await ai.describeFigures(base64, mimeType, { userId: source.userId, notebookId: source.notebookId, operation: 'figure_captioning' });
      diag?.addLlmUsage(res.usage.promptTokens, res.usage.completionTokens);

      const parsed = safeJsonParse<any>(res.text);
      if (!parsed.ok) { diag?.warn('figures', 'figure JSON unparseable'); return 0; }
      const validated = FiguresSchema.safeParse(parsed.data);
      if (!validated.success) { diag?.warn('figures', 'figure JSON failed validation'); return 0; }
      figures = validated.data.filter(f => f.caption.trim().length > 0);
    } catch (e) {
      diag?.error('figures', e);
      return 0;
    }

    if (figures.length === 0) return 0;

    // Store the FIGURES asset.
    try {
      await firebaseApp.firestore().collection('notebooks').doc(source.notebookId).collection('assets').add({
        notebookId: source.notebookId,
        type: 'FIGURES',
        title: `${source.title} - Figures`,
        content: { figures },
        createdAt: Date.now(),
      });
    } catch (e) {
      diag?.error('figures.asset', e);
    }

    // Embed + index the captions so figures are retrievable (tagged contentType='figure').
    try {
      const ctx = resolveNotebookContext({ id: source.notebookId } as any, source);
      const provider = new GoogleEmbeddingProvider();
      const captions = figures.map(f => f.caption);
      const vecs = await provider.generateEmbeddings(captions, source.userId);
      diag?.addEmbeddingTokens(captions.reduce((sum, c) => sum + Math.ceil(c.length / 4), 0));

      const vectors = figures.map((f, i) => {
        const metadata: RecordMetadata = {
          userId: source.userId || '',
          notebookId: source.notebookId || '',
          sourceId: source.id || '',
          chapterId: source.id || '',
          subject: ctx.subject || '',
          class: ctx.class || '',
          board: ctx.board || '',
          language: ctx.language || 'en',
          embeddingVersion: EMBEDDING_VERSION,
          chunkVersion: CHUNK_VERSION,
          metadataVersion: METADATA_VERSION,
          contentType: 'figure',
          sourceTitle: source.title || '',
          text: f.caption,
          page: f.page ?? 0,
          diagramType: f.diagramType || 'other',
          labels: (f.labels || []).slice(0, 12),
          createdAt: source.createdAt || Date.now(),
        };
        return { id: `${source.id}_figure_${i}`, values: vecs[i] || [], metadata };
      }).filter(v => v.values.length > 0);

      if (vectors.length > 0) await pineconeService.upsertVectors(vectors, env.PINECONE_NAMESPACE);
    } catch (e) {
      diag?.error('figures.embedding', e);
    }

    return figures.length;
  }
}

export const figureCaptioningService = new FigureCaptioningService();
