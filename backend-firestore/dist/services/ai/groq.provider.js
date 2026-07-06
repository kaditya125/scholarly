"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const telemetry_1 = require("../../lib/telemetry");
const retry_1 = require("../../utils/retry");
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
    /**
     * Supports two calling conventions that exist in the codebase:
     *   - AIProvider:  generateResponse(history, systemPromptString, traceId)
     *   - IAIProvider: generateResponse(messages, { traceId })  — the system message is
     *                  already included inside `history`, and the 2nd arg is an options object.
     * Only a STRING 2nd arg is treated as a system prompt; an object is treated as options.
     */
    normalizeArgs(systemPromptArg, traceIdArg) {
        if (typeof systemPromptArg === 'string') {
            return { systemPromptStr: systemPromptArg, traceId: traceIdArg };
        }
        if (systemPromptArg && typeof systemPromptArg === 'object') {
            return { systemPromptStr: undefined, traceId: traceIdArg ?? systemPromptArg.traceId };
        }
        return { systemPromptStr: undefined, traceId: traceIdArg };
    }
    buildMessages(history, systemPromptStr) {
        const messages = [];
        if (systemPromptStr) {
            messages.push({ role: 'system', content: systemPromptStr });
        }
        history.forEach(msg => {
            // Preserve system role when present; map internal 'ai' -> 'assistant'.
            const role = msg.role === 'ai' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';
            messages.push({ role, content: msg.content });
        });
        return messages;
    }
    async generateResponse(history, systemPrompt, traceId) {
        const start = Date.now();
        const { systemPromptStr, traceId: tid } = this.normalizeArgs(systemPrompt, traceId);
        logger_1.logger.info(`Generating response via Groq`, { traceId: tid, modelName: this.modelName });
        const messages = this.buildMessages(history, systemPromptStr);
        // Resilience: 30s timeout + retry with backoff on transient errors (429/5xx/network).
        const response = await (0, retry_1.withRetry)(() => (0, retry_1.withTimeout)(this.groq.chat.completions.create({
            model: this.modelName,
            messages: messages,
            temperature: 0.7,
        }), 30000, 'groq.generateResponse'), { label: 'groq.generateResponse' });
        const end = Date.now();
        // Cost telemetry from real token usage (used for per-request cost attribution).
        telemetry_1.Telemetry.logCost('groq', response.usage?.prompt_tokens || 0, 'input', { model: this.modelName, traceId: tid });
        telemetry_1.Telemetry.logCost('groq', response.usage?.completion_tokens || 0, 'output', { model: this.modelName, traceId: tid });
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
        const { systemPromptStr } = this.normalizeArgs(systemPrompt);
        const messages = this.buildMessages(history, systemPromptStr);
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
