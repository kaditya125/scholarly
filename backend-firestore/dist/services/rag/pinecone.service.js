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
            await target.upsert(batch);
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
}
exports.PineconeService = PineconeService;
// Export a singleton instance
exports.pineconeService = new PineconeService();
