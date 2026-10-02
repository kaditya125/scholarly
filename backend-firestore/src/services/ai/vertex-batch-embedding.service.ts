/**
 * Vertex AI Multi-Instance Batch Embedding Service
 * =================================================
 *
 * Provides high-throughput vector embedding generation using Vertex AI's native
 * `:predict` multi-instance endpoint for `gemini-embedding-001`.
 *
 * Benefits:
 * - Batches up to 25-50 texts per single HTTP call.
 * - Reduces HTTP requests by ~96% compared to 1-by-1 embedding.
 * - Drastically avoids 429 RPM (Requests-Per-Minute) quota exhaustion.
 * - Guarantees 768-dim output vectors (compatible with Qdrant collection).
 */

import { GoogleAuth } from 'google-auth-library';
import { env } from '../../config/env';

export interface BatchEmbeddingOptions {
  batchSize?: number;
  outputDimensionality?: number;
  model?: string;
  project?: string;
  location?: string;
  delayBetweenBatchesMs?: number;
  maxRetries?: number;
}

export class VertexBatchEmbeddingService {
  private auth: GoogleAuth;
  private project: string;
  private location: string;
  private model: string;
  private outputDimensionality: number;

  constructor(options: BatchEmbeddingOptions = {}) {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.project = options.project || process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4';
    this.location = options.location || process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    this.model = options.model || 'gemini-embedding-001';
    this.outputDimensionality = options.outputDimensionality || 768;
  }

  /**
   * Embeds an array of texts in multi-instance batches.
   *
   * @param texts Array of string chunks to embed.
   * @param batchSize Number of instances per HTTP request (default: 25).
   * @param delayBetweenBatchesMs Delay in milliseconds between consecutive batch requests.
   * @returns Array of 768-dimensional float vectors matching the order of input texts.
   */
  async embedBatch(
    texts: string[],
    batchSize: number = 25,
    delayBetweenBatchesMs: number = 400
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token;

    if (!token) {
      throw new Error('[VertexBatchEmbeddingService] Failed to acquire Google Cloud access token.');
    }

    const url = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${this.model}:predict`;

    const allVectors: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const instances = slice.map((text) => ({ content: text }));

      let response: Response | null = null;
      let lastError = '';

      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              instances,
              parameters: { outputDimensionality: this.outputDimensionality },
            }),
          });

          if (response.ok) {
            break;
          }

          if (response.status === 429) {
            const backoffMs = attempt * 3000 + Math.floor(Math.random() * 1000);
            console.warn(`  [VertexBatch] ⚠ Attempt ${attempt} hit 429 (quota). Backing off ${backoffMs}ms...`);
            await new Promise((r) => setTimeout(r, backoffMs));
          } else if (response.status >= 500) {
            console.warn(`  [VertexBatch] ⚠ Server error ${response.status}. Retrying in 2s...`);
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            lastError = await response.text();
            throw new Error(`[VertexBatch] HTTP ${response.status}: ${lastError}`);
          }
        } catch (fetchErr: any) {
          lastError = fetchErr.message;
          if (attempt === 6) throw fetchErr;
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }

      if (!response || !response.ok) {
        throw new Error(`[VertexBatch] Failed after 6 attempts: ${lastError}`);
      }

      const data: any = await response.json();
      const predictions = data.predictions || [];

      if (predictions.length !== slice.length) {
        throw new Error(
          `[VertexBatch] Mismatch in prediction count: expected ${slice.length}, got ${predictions.length}`
        );
      }

      for (const pred of predictions) {
        const vector: number[] = pred.embeddings?.values || pred.values || [];
        if (vector.length !== this.outputDimensionality) {
          throw new Error(
            `[VertexBatch] Invalid vector dimension: expected ${this.outputDimensionality}, got ${vector.length}`
          );
        }
        allVectors.push(vector);
      }

      // Small pacing delay between batches to stay comfortably within rate limits
      if (i + batchSize < texts.length && delayBetweenBatchesMs > 0) {
        await new Promise((r) => setTimeout(r, delayBetweenBatchesMs));
      }
    }

    return allVectors;
  }
}
