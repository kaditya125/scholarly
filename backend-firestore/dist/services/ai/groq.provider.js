"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const env_1 = require("../../config/env");
class GroqProvider {
    groq;
    modelName;
    constructor(modelName = 'openai/gpt-oss-20b') {
        this.modelName = modelName;
        if (!env_1.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY is not defined in environment.');
        }
        this.groq = new groq_sdk_1.default({ apiKey: env_1.env.GROQ_API_KEY });
    }
    async generateResponse(history, systemPrompt) {
        const start = Date.now();
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        // Map internal ChatMessage format to Groq format
        history.forEach(msg => {
            messages.push({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.content
            });
        });
        const response = await this.groq.chat.completions.create({
            model: this.modelName,
            messages: messages,
            temperature: 0.7,
        });
        const end = Date.now();
        return {
            reply: response.choices[0]?.message?.content || 'No response generated.',
            usage: {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
            },
            timestamps: { start, end }
        };
    }
    async *generateStreamResponse(history, systemPrompt) {
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        history.forEach(msg => {
            messages.push({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.content
            });
        });
        const stream = await this.groq.chat.completions.create({
            model: this.modelName,
            messages: messages,
            temperature: 0.7,
            stream: true,
        });
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
}
exports.GroqProvider = GroqProvider;
