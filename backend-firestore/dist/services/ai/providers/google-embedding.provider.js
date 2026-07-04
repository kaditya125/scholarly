"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleEmbeddingProvider = void 0;
const genai_1 = require("@google/genai");
const env_1 = require("../../../config/env");
class GoogleEmbeddingProvider {
    ai;
    modelName;
    constructor(modelName = 'text-embedding-004') {
        this.modelName = modelName;
        if (!env_1.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not defined in environment.');
        }
        this.ai = new genai_1.GoogleGenAI({ apiKey: env_1.env.GEMINI_API_KEY });
    }
    async generateEmbedding(text) {
        const response = await this.ai.models.embedContent({
            model: this.modelName,
            contents: text
        });
        return response.embeddings?.[0]?.values || [];
    }
    async generateEmbeddings(texts) {
        const response = await this.ai.models.embedContent({
            model: this.modelName,
            contents: texts
        });
        const embeddings = response.embeddings?.map(e => e.values) || [];
        return embeddings.filter((e) => e !== undefined);
    }
}
exports.GoogleEmbeddingProvider = GoogleEmbeddingProvider;
