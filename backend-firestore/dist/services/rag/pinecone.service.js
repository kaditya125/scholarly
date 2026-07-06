"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pineconeService = exports.PineconeService = void 0;
const pinecone_1 = require("@pinecone-database/pinecone");
const env_1 = require("../../config/env");
class PineconeService {
    client;
    indexName;
    constructor() {
        if (!env_1.env.PINECONE_API_KEY) {
            console.warn('PINECONE_API_KEY is not defined. Vector operations will fail.');
        }
        this.client = new pinecone_1.Pinecone({
            apiKey: env_1.env.PINECONE_API_KEY || 'dummy_key',
        });
        this.indexName = env_1.env.PINECONE_INDEX_NAME;
    }
    getIndex() {
        return this.client.index(this.indexName);
    }
    /**
     * Upsert vectors to Pinecone
     */
    async upsertVectors(vectors, namespace) {
        const index = this.getIndex();
        const target = namespace ? index.namespace(namespace) : index;
        // Pinecone allows a max of 1000 vectors per upsert request typically, chunking if necessary
        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            // Pinecone JS SDK v8 expects an options object: upsert({ records }).
            await target.upsert({ records: batch });
        }
    }
    /**
     * Query vectors in Pinecone with metadata filtering
     */
    async queryVectors(queryVector, topK = 5, filter, namespace) {
        const index = this.getIndex();
        const target = namespace ? index.namespace(namespace) : index;
        const results = await target.query({
            vector: queryVector,
            topK,
            includeMetadata: true,
            includeValues: false,
            filter: filter
        });
        return results.matches;
    }
    /**
     * Delete vectors by IDs
     */
    async deleteVectors(ids, namespace) {
        const index = this.getIndex();
        const target = namespace ? index.namespace(namespace) : index;
        await target.deleteMany(ids);
    }
    /**
     * Delete all vectors in a namespace
     */
    async deleteAllVectors(namespace) {
        const index = this.getIndex();
        const target = namespace ? index.namespace(namespace) : index;
        await target.deleteAll();
    }
    /**
     * Fetch vectors (and their metadata) by id. Used to reconstruct a document's text from its
     * already-indexed chunks without re-downloading or re-embedding the source file.
     */
    async fetchVectors(ids, namespace) {
        if (ids.length === 0)
            return {};
        const index = this.getIndex();
        const target = namespace ? index.namespace(namespace) : index;
        const res = await target.fetch({ ids });
        return (res?.records || {});
    }
    /**
     * Fetch real index statistics from Pinecone (namespaces, vector counts, dimension, fullness).
     * Used by the admin Vector DB dashboard.
     */
    async getIndexStats() {
        const index = this.getIndex();
        const stats = await index.describeIndexStats();
        return {
            indexName: this.indexName,
            dimension: stats.dimension ?? null,
            totalVectorCount: stats.totalRecordCount ?? 0,
            indexFullness: stats.indexFullness ?? 0,
            namespaces: Object.entries(stats.namespaces ?? {}).map(([name, ns]) => ({
                name: name || '(default)',
                vectorCount: ns.recordCount ?? 0,
            })),
        };
    }
}
exports.PineconeService = PineconeService;
// Export a singleton instance
exports.pineconeService = new PineconeService();
