"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const genai_1 = require("@google/genai");
const env_1 = require("../../config/env");
const telemetry_1 = require("../../lib/telemetry");
const telemetry_service_1 = require("../telemetry.service");
// Lazily-created cost recorder (only needs Firestore). Shared across GeminiProvider instances.
let _costRecorder = null;
const getCostRecorder = () => {
    if (!_costRecorder)
        _costRecorder = new telemetry_service_1.TelemetryService();
    return _costRecorder;
};
class GeminiProvider {
    ai;
    modelName;
    constructor(modelName = env_1.env.GEMINI_MODEL || 'gemini-2.5-flash') {
        this.modelName = modelName;
        if (!env_1.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not defined in environment.');
        }
        this.ai = new genai_1.GoogleGenAI({ apiKey: env_1.env.GEMINI_API_KEY });
    }
    async generateResponse(history, systemPrompt, opts) {
        const start = Date.now();
        const tid = opts?.traceId || `gemini_${start}`;
        const uid = opts?.userId;
        let modelToUse = opts?.model || this.modelName;
        if (modelToUse.includes('gemini-3.') || modelToUse.includes('gemini-1.5')) {
            modelToUse = modelToUse.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
        }
        // Map internal ChatMessage format to Gemini Content format
        const contents = history.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user', // System messages handled differently or mapped to user
            parts: [{ text: msg.content }]
        }));
        const config = { temperature: 0.7 };
        if (systemPrompt && systemPrompt.trim().length > 0) {
            config.systemInstruction = systemPrompt;
        }
        const response = await this.ai.models.generateContent({
            model: modelToUse,
            contents: contents,
            config: config
        });
        const end = Date.now();
        const inTok = response.usageMetadata?.promptTokenCount || 0;
        const outTok = response.usageMetadata?.candidatesTokenCount || 0;
        telemetry_1.Telemetry.logCost('gemini', inTok, 'input', { model: modelToUse, traceId: tid, userId: uid });
        telemetry_1.Telemetry.logCost('gemini', outTok, 'output', { model: modelToUse, traceId: tid, userId: uid });
        // Opt-in per-call cost record (attributed to a notebook + operation) so document-ingestion
        // cost shows up in the admin Cost Analytics — not just streaming chat. Only fires when the
        // caller labels the operation, so streaming chat (which records its own cost) isn't double
        // counted. Fire-and-forget: cost recording must never block or break generation.
        if (opts?.operation) {
            const estimatedCostUSD = (inTok / 1000) * 0.000125 + (outTok / 1000) * 0.000375;
            getCostRecorder().recordCost({
                provider: 'gemini',
                model: modelToUse,
                promptTokens: inTok,
                completionTokens: outTok,
                estimatedCostUSD,
                userId: uid || 'system',
                notebookId: opts.notebookId,
                operation: opts.operation,
                timestamp: Date.now(),
            }).catch(() => { });
        }
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
    async extractTextFromPdf(base64Data, mimeType = 'application/pdf') {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: 'Extract all the text from this document exactly as it is written. Do not add markdown formatting or summarize it. Just output the raw text.' },
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType
                            }
                        }
                    ]
                }
            ]
        });
        return response.text || '';
    }
    async *generateStreamResponse(history, systemPrompt, opts) {
        const start = Date.now();
        const tid = opts?.traceId || `gemini_${start}`;
        const uid = opts?.userId;
        let modelToUse = opts?.model || this.modelName;
        if (modelToUse.includes('gemini-3.') || modelToUse.includes('gemini-1.5')) {
            modelToUse = modelToUse.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
        }
        const contents = history.map(msg => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
        const config = { temperature: 0.7 };
        if (systemPrompt && systemPrompt.trim().length > 0) {
            config.systemInstruction = systemPrompt;
        }
        const responseStream = await this.ai.models.generateContentStream({
            model: modelToUse,
            contents: contents,
            config: config
        });
        for await (const chunk of responseStream) {
            if (chunk.text) {
                yield chunk.text;
            }
        }
    }
}
exports.GeminiProvider = GeminiProvider;
