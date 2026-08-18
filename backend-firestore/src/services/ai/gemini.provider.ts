import { GoogleGenAI } from '@google/genai';
import { env, assertAIEnabled } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';
import { Telemetry } from '../../lib/telemetry';
import { TelemetryService } from '../telemetry.service';
import { withRetry } from '../../utils/retry';

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

    // Vertex AI routing — when GOOGLE_GENAI_USE_VERTEXAI is "true" the SDK
    // must be constructed in Vertex mode with the service-account project +
    // location. In that mode the SDK picks up GOOGLE_APPLICATION_CREDENTIALS
    // automatically. Passing an apiKey alongside vertexai:true makes the SDK
    // send the API key as a bearer token to the Vertex endpoint, which
    // Vertex rejects with 401 ACCESS_TOKEN_TYPE_UNSUPPORTED — the exact
    // symptom we hit after the July revert.
    if (env.GOOGLE_GENAI_USE_VERTEXAI === 'true') {
      if (!env.GOOGLE_VERTEX_PROJECT || !env.GOOGLE_VERTEX_LOCATION) {
        throw new Error(
          'Vertex AI mode is enabled but GOOGLE_VERTEX_PROJECT or GOOGLE_VERTEX_LOCATION is missing.'
        );
      }
      this.ai = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_VERTEX_PROJECT,
        location: env.GOOGLE_VERTEX_LOCATION,
      });
    } else {
      if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not defined in environment.');
      }
      this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
  }

  async generateResponse(
    history: ChatMessage[],
    systemPrompt?: string,
    opts?: {
      traceId?: string;
      model?: string;
      userId?: string;
      notebookId?: string;
      operation?: string;
      temperature?: number;
      responseJson?: boolean;
    }
  ): Promise<AIProviderResponse> {
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

    // A transient RESOURCE_EXHAUSTED/5xx throws before any content exists, so retrying the
    // whole call is always safe here (unlike the streaming variant below).
    const response = await withRetry(
      () => this.ai.models.generateContent({
        model: modelToUse,
        contents: contents,
        config: config
      }),
      { retries: 2, baseDelayMs: 800, label: 'gemini.generateResponse' }
    );

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

    const config: any = {
      temperature: 0.7,
      // Gemini 2.5 flash/pro run an internal "thinking" phase whose tokens
      // are accounted separately from output. In some cases (short prompts,
      // certain safety heuristics) the model spent its thinking budget and
      // returned only 2–4 output tokens, which surfaced as an empty plan.
      // Setting thinkingBudget: 0 disables that phase for streaming calls
      // where we want the text tokens directly. It also cuts TTFT noticeably.
      thinkingConfig: { thinkingBudget: 0 },
    };
    if (systemPrompt && systemPrompt.trim().length > 0) {
      config.systemInstruction = systemPrompt;
    }

    // Acquiring the stream and pulling its first item is where a RESOURCE_EXHAUSTED/5xx
    // actually surfaces (a request rejection, not a mid-generation failure) — before any
    // text has reached the caller, so it's safe to retry the whole request from scratch.
    // Once real content starts flowing we stop retrying entirely: re-attempting after that
    // would duplicate output the client has already started rendering.
    const acquireFirstChunk = async () => {
      const stream = await this.ai.models.generateContentStream({
        model: modelToUse,
        contents: contents,
        config: config
      });
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { iterator, first };
    };

    const { iterator, first } = await withRetry(acquireFirstChunk, {
      retries: 2,
      baseDelayMs: 800,
      label: 'gemini.generateStreamResponse',
    });

    let result = first;
    while (!result.done) {
      const chunk = result.value;
      if (chunk.text) {
        yield chunk.text;
      }
      result = await iterator.next();
    }
  }

  async extractQuestionFromImage(...args: any[]): Promise<any> { throw new Error('Not implemented'); }
  async generateVisionStream(...args: any[]): Promise<any> { throw new Error('Not implemented'); }
  async describeFigures(...args: any[]): Promise<any> { throw new Error('Not implemented'); }
}
