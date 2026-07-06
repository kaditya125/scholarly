import { GoogleGenAI } from '@google/genai';
import { env, assertAIEnabled } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';
import { Telemetry } from '../../lib/telemetry';
import { TelemetryService } from '../telemetry.service';

// Lazily-created cost recorder (only needs Firestore). Shared across GeminiProvider instances.
let _costRecorder: TelemetryService | null = null;
const getCostRecorder = (): TelemetryService => {
  if (!_costRecorder) _costRecorder = new TelemetryService();
  return _costRecorder;
};

export class GeminiProvider implements AIProvider {
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(modelName: string = env.GEMINI_MODEL || 'gemini-2.5-flash') {
    this.modelName = modelName;
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in environment.');
    }
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generateResponse(history: ChatMessage[], systemPrompt?: string, opts?: { traceId?: string, model?: string, userId?: string, notebookId?: string, operation?: string }): Promise<AIProviderResponse> {
    assertAIEnabled('Gemini generateResponse');
    const start = Date.now();
    const tid = opts?.traceId || `gemini_${start}`;
    const uid = opts?.userId;
    let modelToUse = opts?.model || this.modelName;
    if (modelToUse === 'gemini' || modelToUse.toLowerCase() === 'gemini') {
      modelToUse = 'gemini-2.5-flash';
    } else if (modelToUse.includes('gemini-3.') || modelToUse.includes('gemini-1.5')) {
      modelToUse = modelToUse.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    }

    // Map internal ChatMessage format to Gemini Content format
    const contents = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user', // System messages handled differently or mapped to user
      parts: [{ text: msg.content }]
    }));

    const config: any = { temperature: 0.7 };
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
    Telemetry.logCost('gemini', inTok, 'input', { model: modelToUse, traceId: tid, userId: uid });
    Telemetry.logCost('gemini', outTok, 'output', { model: modelToUse, traceId: tid, userId: uid });

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
      }).catch(() => { /* swallow */ });
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

  async extractTextFromPdf(base64Data: string, mimeType: string = 'application/pdf'): Promise<string> {
    assertAIEnabled('Gemini extractTextFromPdf');
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

  async *generateStreamResponse(history: ChatMessage[], systemPrompt?: string, opts?: { traceId?: string, model?: string, userId?: string }): AsyncGenerator<string, void, unknown> {
    assertAIEnabled('Gemini generateStreamResponse');
    const start = Date.now();
    const tid = opts?.traceId || `gemini_${start}`;
    const uid = opts?.userId;
    let modelToUse = opts?.model || this.modelName;
    if (modelToUse === 'gemini' || modelToUse.toLowerCase() === 'gemini') {
      modelToUse = 'gemini-2.5-flash';
    } else if (modelToUse.includes('gemini-3.') || modelToUse.includes('gemini-1.5')) {
      modelToUse = modelToUse.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    }

    const contents = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const config: any = { temperature: 0.7 };
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
