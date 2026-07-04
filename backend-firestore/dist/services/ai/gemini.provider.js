"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const genai_1 = require("@google/genai");
const env_1 = require("../../config/env");
class GeminiProvider {
    ai;
    modelName;
    constructor(modelName = 'gemini-2.5-flash') {
        this.modelName = modelName;
        if (!env_1.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not defined in environment.');
        }
        this.ai = new genai_1.GoogleGenAI({ apiKey: env_1.env.GEMINI_API_KEY });
    }
    async generateResponse(history, systemPrompt) {
        const start = Date.now();
        // Map internal ChatMessage format to Gemini Content format
        const contents = history.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user', // System messages handled differently or mapped to user
            parts: [{ text: msg.content }]
        }));
        const response = await this.ai.models.generateContent({
            model: this.modelName,
            contents: contents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.7,
            }
        });
        const end = Date.now();
        return {
            reply: response.text || 'No response generated.',
            usage: {
                promptTokens: response.usageMetadata?.promptTokenCount || 0,
                completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata?.totalTokenCount || 0,
            },
            timestamps: { start, end }
        };
    }
    async *generateStreamResponse(history, systemPrompt) {
        const contents = history.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
        const responseStream = await this.ai.models.generateContentStream({
            model: this.modelName,
            contents: contents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.7,
            }
        });
        for await (const chunk of responseStream) {
            if (chunk.text) {
                yield chunk.text;
            }
        }
    }
}
exports.GeminiProvider = GeminiProvider;
