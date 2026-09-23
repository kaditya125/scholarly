import { GoogleGenAI } from '@google/genai';
import { env, assertAIEnabled } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';
import { Telemetry } from '../../lib/telemetry';
import { TelemetryService } from '../telemetry.service';
import { withRetry } from '../../utils/retry';
import { getSecret } from '../runtimeSecrets.service';

// Lazily-created cost recorder (only needs Firestore). Shared across GeminiProvider instances.
let _costRecorder: TelemetryService | null = null;
const getCostRecorder = (): TelemetryService => {
  if (!_costRecorder) _costRecorder = new TelemetryService();
  return _costRecorder;
};

export class GeminiProvider implements AIProvider {
  private modelName: string;

  constructor(modelName: string = env.GEMINI_MODEL || 'gemini-2.5-flash') {
    this.modelName = modelName;
  }

  /**
   * Built fresh on every call rather than cached on `this` at construction time. This
   * instance is registered once at boot as a DI-wide singleton (TOKENS.AIProvider /
   * TOKENS.ReasoningProvider — core/di/registry.ts) as well as constructed ad hoc as a
   * fallback elsewhere, so caching the client here would bake in whatever GEMINI_API_KEY
   * was effective at that one moment for the rest of the process's life — exactly what an
   * admin rotating the key through Settings needs to NOT happen. Constructing the SDK
   * wrapper is cheap (no network round trip), so there is no cost to doing this per call.
   *
   * Vertex AI routing — when GOOGLE_GENAI_USE_VERTEXAI is "true" the SDK
   * must be constructed in Vertex mode with the service-account project +
   * location. In that mode the SDK picks up GOOGLE_APPLICATION_CREDENTIALS
   * automatically. Passing an apiKey alongside vertexai:true makes the SDK
   * send the API key as a bearer token to the Vertex endpoint, which
   * Vertex rejects with 401 ACCESS_TOKEN_TYPE_UNSUPPORTED — the exact
   * symptom we hit after the July revert.
   */
  private buildClient(): GoogleGenAI {
    if (env.GOOGLE_GENAI_USE_VERTEXAI === 'true') {
      if (!env.GOOGLE_VERTEX_PROJECT || !env.GOOGLE_VERTEX_LOCATION) {
        throw new Error(
          'Vertex AI mode is enabled but GOOGLE_VERTEX_PROJECT or GOOGLE_VERTEX_LOCATION is missing.'
        );
      }
      return new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_VERTEX_PROJECT,
        location: env.GOOGLE_VERTEX_LOCATION,
      });
    }
    const apiKey = getSecret('GEMINI_API_KEY') || env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment.');
    }
    return new GoogleGenAI({ apiKey });
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

    const config: any = {
      temperature: opts?.temperature !== undefined ? opts.temperature : 0.7,
      // Disable internal thinking phase for direct fast completion unless caller specifies a budget
      thinkingConfig: { thinkingBudget: (opts as any)?.thinkingBudget ?? 0 },
    };
    if (opts?.responseJson) {
      config.responseMimeType = 'application/json';
    }
    if (systemPrompt && systemPrompt.trim().length > 0) {
      config.systemInstruction = systemPrompt;
    }

    // A transient RESOURCE_EXHAUSTED/5xx throws before any content exists, so retrying the
    // whole call is always safe here (unlike the streaming variant below).
    const response = await withRetry(
      () => this.buildClient().models.generateContent({
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

  /**
   * Additive — not part of the `AIProvider` interface. Runs a bounded tool-calling loop: the
   * model may request function calls, which `executeTool` actually performs (the caller supplies
   * this rather than this provider importing a retrieval layer directly, keeping the provider a
   * leaf with no workflow-layer dependency), results are fed back as a follow-up turn, and this
   * repeats until the model returns plain text or `maxIterations` is reached.
   *
   * If the cap is hit without a final answer, one last call is made with tools disabled so the
   * model must synthesize whatever it has learned into a real answer instead of the turn ending
   * silently.
   */
  async generateWithTools(
    history: ChatMessage[],
    systemPrompt: string,
    toolDeclarations: Array<{ name: string; description: string; parameters: any }>,
    executeTool: (name: string, args: Record<string, unknown>) => Promise<any>,
    opts?: { traceId?: string; model?: string; userId?: string; maxIterations?: number },
  ): Promise<{ text: string; functionCallTrace: Array<{ name: string; args: Record<string, unknown> }> }> {
    assertAIEnabled('Gemini generateWithTools');
    const start = Date.now();
    const tid = opts?.traceId || `gemini_${start}`;
    const uid = opts?.userId;
    let modelToUse = opts?.model || this.modelName;
    if (modelToUse === 'gemini' || modelToUse.toLowerCase() === 'gemini') {
      modelToUse = 'gemini-2.5-flash';
    } else if (modelToUse.includes('gemini-3.') || modelToUse.includes('gemini-1.5')) {
      modelToUse = modelToUse.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    }

    const contents: any[] = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const config: any = {
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
      tools: [{ functionDeclarations: toolDeclarations }],
    };
    if (systemPrompt && systemPrompt.trim().length > 0) {
      config.systemInstruction = systemPrompt;
    }

    const maxIterations = opts?.maxIterations ?? 5;
    const functionCallTrace: Array<{ name: string; args: Record<string, unknown> }> = [];

    const recordUsage = (response: any) => {
      const inTok = response.usageMetadata?.promptTokenCount || 0;
      const outTok = response.usageMetadata?.candidatesTokenCount || 0;
      Telemetry.logCost('gemini', inTok, 'input', { model: modelToUse, traceId: tid, userId: uid });
      Telemetry.logCost('gemini', outTok, 'output', { model: modelToUse, traceId: tid, userId: uid });
    };

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await withRetry(
        () => this.buildClient().models.generateContent({ model: modelToUse, contents, config }),
        { retries: 2, baseDelayMs: 800, label: 'gemini.generateWithTools' },
      );
      recordUsage(response);

      const calls = response.functionCalls;
      if (!calls || calls.length === 0) {
        return { text: response.text || '', functionCallTrace };
      }

      // Carry the model's own turn (its functionCall parts) forward so the follow-up request
      // has the full exchange, then execute every requested call for real and feed the results
      // back as one user turn.
      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts: any[] = [];
      for (const call of calls) {
        const name = call.name || '';
        const args = (call.args || {}) as Record<string, unknown>;
        functionCallTrace.push({ name, args });
        let output: any;
        try {
          output = await executeTool(name, args);
        } catch (e: any) {
          output = { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
        responseParts.push({ functionResponse: { id: call.id, name, response: { output } } });
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    // Iteration cap reached without a final text answer. Ask once more with tools disabled so
    // the model must synthesize a real answer from what it already learned rather than the turn
    // ending silently or looping past the cap.
    const finalConfig = { ...config };
    delete finalConfig.tools;
    const finalResponse = await withRetry(
      () => this.buildClient().models.generateContent({ model: modelToUse, contents, config: finalConfig }),
      { retries: 1, baseDelayMs: 500, label: 'gemini.generateWithTools.final' },
    );
    recordUsage(finalResponse);
    return { text: finalResponse.text || '', functionCallTrace };
  }

  /**
   * Streaming, parallel sibling of generateWithTools, built for Deep search. Instead of running
   * the whole tool loop silently and returning at the end, it yields events as they happen:
   *   tool_call    — the model asked for a tool (emitted before it runs, so the UI can say
   *                  "Searching the web for …" while the search is in flight)
   *   tool_result  — that tool finished (calls from one model turn run in parallel and are
   *                  reported in completion order)
   *   text         — the final answer, streamed
   *
   * `requireFirstCall` forces a tool call on the first turn (functionCallingConfig ANY) — without
   * it the model sometimes answered "explain X from the NCERT textbook" without searching at all.
   * The last turn runs with tools disabled so the loop always ends in a real answer.
   *
   * Text is held back until ~160 characters arrive with no function call, so a short preamble
   * ("Let me look that up") on a tool turn is dropped instead of leaking into the answer; once
   * the threshold passes, the rest streams through as it arrives.
   */
  async *streamWithTools(
    history: ChatMessage[],
    systemPrompt: string,
    toolDeclarations: Array<{ name: string; description: string; parameters: any }>,
    executeTool: (name: string, args: Record<string, unknown>) => Promise<any>,
    opts?: {
      traceId?: string; model?: string; userId?: string;
      maxIterations?: number; maxCallsPerTurn?: number; requireFirstCall?: boolean;
    },
  ): AsyncGenerator<
    | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
    | { type: 'tool_result'; id: string; name: string; args: Record<string, unknown>; output: any; ms: number }
    | { type: 'text'; text: string },
    void,
    unknown
  > {
    assertAIEnabled('Gemini streamWithTools');
    const tid = opts?.traceId || `gemini_${Date.now()}`;
    const uid = opts?.userId;
    let modelToUse = opts?.model || this.modelName;
    if (modelToUse === 'gemini' || modelToUse.toLowerCase() === 'gemini') {
      modelToUse = 'gemini-2.5-flash';
    } else if (modelToUse.includes('gemini-3.') || modelToUse.includes('gemini-1.5')) {
      modelToUse = modelToUse.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    }

    const contents: any[] = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
    const baseConfig: any = { temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } };
    if (systemPrompt && systemPrompt.trim().length > 0) baseConfig.systemInstruction = systemPrompt;

    const maxIterations = opts?.maxIterations ?? 4;
    const maxCallsPerTurn = opts?.maxCallsPerTurn ?? 4;
    const HOLD_CHARS = 160;
    let callSeq = 0;

    for (let iteration = 0; iteration <= maxIterations; iteration++) {
      const config: any = { ...baseConfig };
      if (iteration < maxIterations) {
        config.tools = [{ functionDeclarations: toolDeclarations }];
        if (iteration === 0 && opts?.requireFirstCall) {
          config.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
        }
      }

      // Same retry boundary as generateStreamResponse: only acquiring the stream and its first
      // chunk is retried, never a stream that has already produced output.
      const { iterator, first } = await withRetry(async () => {
        const stream = await this.buildClient().models.generateContentStream({ model: modelToUse, contents, config });
        const it = stream[Symbol.asyncIterator]();
        return { iterator: it, first: await it.next() };
      }, { retries: 2, baseDelayMs: 800, label: 'gemini.streamWithTools' });

      const modelParts: any[] = [];
      const calls: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
      let held = '';
      let flushing = false;
      let usage: any;
      for (let r = first; !r.done; r = await iterator.next()) {
        const chunk: any = r.value;
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
          modelParts.push(part);
          if (part.functionCall) {
            calls.push({ id: part.functionCall.id, name: part.functionCall.name || '', args: part.functionCall.args || {} });
          } else if (typeof part.text === 'string' && !part.thought && calls.length === 0) {
            if (flushing) {
              yield { type: 'text', text: part.text };
            } else {
              held += part.text;
              if (held.length >= HOLD_CHARS) {
                flushing = true;
                yield { type: 'text', text: held };
                held = '';
              }
            }
          }
        }
      }
      Telemetry.logCost('gemini', usage?.promptTokenCount || 0, 'input', { model: modelToUse, traceId: tid, userId: uid });
      Telemetry.logCost('gemini', usage?.candidatesTokenCount || 0, 'output', { model: modelToUse, traceId: tid, userId: uid });

      if (calls.length === 0) {
        if (held) yield { type: 'text', text: held };
        return;
      }

      contents.push({ role: 'model', parts: modelParts });

      // Run this turn's calls in parallel, reporting each as it starts and as it finishes.
      const turn = calls.slice(0, maxCallsPerTurn).map((c) => ({ ...c, localId: c.id || `call_${++callSeq}` }));
      for (const c of turn) yield { type: 'tool_call', id: c.localId, name: c.name, args: c.args };
      const outputs: any[] = new Array(turn.length);
      const pending = new Map<number, Promise<{ i: number; output: any; ms: number }>>();
      turn.forEach((c, i) => pending.set(i, (async () => {
        const t = Date.now();
        let output: any;
        try {
          output = await executeTool(c.name, c.args);
        } catch (e: any) {
          output = { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
        return { i, output, ms: Date.now() - t };
      })()));
      while (pending.size > 0) {
        const done = await Promise.race(pending.values());
        pending.delete(done.i);
        outputs[done.i] = done.output;
        const c = turn[done.i];
        yield { type: 'tool_result', id: c.localId, name: c.name, args: c.args, output: done.output, ms: done.ms };
      }

      contents.push({
        role: 'user',
        parts: calls.map((c, i) => ({
          functionResponse: {
            id: c.id,
            name: c.name,
            response: {
              output: i < turn.length
                ? outputs[i]
                : { ok: false, error: `Skipped: at most ${maxCallsPerTurn} tool calls run per step.` },
            },
          },
        })),
      });
    }
  }

  async extractTextFromPdf(base64Data: string, mimeType: string = 'application/pdf'): Promise<string> {
    assertAIEnabled('Gemini extractTextFromPdf');
    const response = await this.buildClient().models.generateContent({
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

  async *generateStreamResponse(history: ChatMessage[], systemPrompt?: string, opts?: { traceId?: string, model?: string, userId?: string, maxOutputTokens?: number }): AsyncGenerator<string, void, unknown> {
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
    if (opts?.maxOutputTokens) config.maxOutputTokens = opts.maxOutputTokens;
    if (systemPrompt && systemPrompt.trim().length > 0) {
      config.systemInstruction = systemPrompt;
    }

    // Acquiring the stream and pulling its first item is where a RESOURCE_EXHAUSTED/5xx
    // actually surfaces (a request rejection, not a mid-generation failure) — before any
    // text has reached the caller, so it's safe to retry the whole request from scratch.
    // Once real content starts flowing we stop retrying entirely: re-attempting after that
    // would duplicate output the client has already started rendering.
    const acquireFirstChunk = async () => {
      const stream = await this.buildClient().models.generateContentStream({
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
