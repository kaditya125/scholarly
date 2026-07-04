"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NvidiaProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
class NvidiaProvider {
    openai;
    modelName;
    constructor(modelName = 'meta/llama-3.1-405b-instruct') {
        this.modelName = modelName;
        if (!env_1.env.NVIDIA_API_KEY) {
            throw new Error('NVIDIA_API_KEY is not defined in environment.');
        }
        this.openai = new openai_1.default({
            apiKey: env_1.env.NVIDIA_API_KEY,
            baseURL: 'https://integrate.api.nvidia.com/v1',
        });
    }
    async generateResponse(history, systemPrompt) {
        const start = Date.now();
        const messages = history.map(msg => ({
            role: msg.role === 'ai' ? 'assistant' : 'user',
            content: msg.content
        }));
        if (systemPrompt) {
            messages.unshift({ role: 'system', content: systemPrompt });
        }
        const response = await this.openai.chat.completions.create({
            model: this.modelName,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1024,
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
        const messages = history.map(msg => ({
            role: msg.role === 'ai' ? 'assistant' : 'user',
            content: msg.content
        }));
        if (systemPrompt) {
            messages.unshift({ role: 'system', content: systemPrompt });
        }
        const stream = await this.openai.chat.completions.create({
            model: this.modelName,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1024,
            stream: true,
        });
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                yield content;
            }
        }
    }
}
exports.NvidiaProvider = NvidiaProvider;
