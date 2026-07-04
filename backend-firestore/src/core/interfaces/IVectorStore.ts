export interface VectorDocument {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface IVectorStore {
  /**
   * Upserts vectors into the vector database.
   */
  upsertVectors(vectors: VectorDocument[], namespace?: string): Promise<void>;

  /**
   * Queries vectors by semantic similarity and metadata filtering.
   */
  queryVectors(
    vector: number[],
    topK: number,
    filter?: Record<string, any>,
    namespace?: string
  ): Promise<VectorMatch[]>;

  /**
   * Deletes vectors by ID or filter.
   */
  deleteVectors(ids: string[], namespace?: string): Promise<void>;
}
