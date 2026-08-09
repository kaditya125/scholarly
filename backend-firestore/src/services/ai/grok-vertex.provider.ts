import { GoogleAuth } from 'google-auth-library';
import { env, assertAIEnabled } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';
import { GeminiProvider } from './gemini.provider';
import { Telemetry } from '../../lib/telemetry';
import { logger } from '../../utils/logger';

/**
 * GrokVertexProvider — xAI Grok served on Google Vertex AI (Agent Platform).
 *
 * Grok is a strong reasoning model available on the user's Vertex project via the
 * OpenAI-compatible endpoint. It's used selectively for the high-value reasoning
 * step (the TeacherAgent draft) — NOT for high-volume ingestion — so answer quality
 * improves on hard questions while cost stays controlled ("Grok thinks, Gemini
 * formats & does the bulk work").
 *
 * Auth: OAuth2 via a service-account key (GROK_SA_KEY_FILE), obtained + auto-refreshed
 * by google-auth-library. The Vertex partner endpoint does NOT accept API keys.
 *
 * Resilience: any failure (auth, network, 4xx/5xx) transparently falls back to the
 * Gemini provider, so enabling Grok can never break the app.
 */
const LOCATION = 'global';

export class GrokVertexProvider implements AIProvider {
  private auth: GoogleAuth;
  private modelId: string;   // e.g. 'xai/grok-4.1-fast-reasoning'
  private project: string;
  private endpoint: string;

  constructor(model?: string) {
    const m = (model || env.GROK_MODEL || 'grok-4.1-fast-reasoning').trim();
    this.modelId = m.startsWith('xai/') ? m : `xai/${m}`;
    this.project = (env.GROK_VERTEX_PROJECT || '').trim();
    if (!this.project) throw new Error('GROK_VERTEX_PROJECT is not set.');
    const keyFile = (env.GROK_SA_KEY_FILE || '').trim();
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...(keyFile ? { keyFile } : {}), // else falls back to ADC
    });
    this.endpoint = `https://aiplatform.googleapis.com/v1/projects/${this.project}/locations/${LOCATION}/endpoints/openapi/chat/completions`;
  }

  /** Fetch a valid OAuth token (google-auth caches + refreshes internally). */
  private async token(): Promise<string> {
    const client = await this.auth.getClient();
    const t = await client.getAccessToken();
    if (!t || !t.token) throw new Error('Failed to obtain OAuth token for Grok (Vertex).');
    return t.token;
  }

  private buildMessages(history: ChatMessage[], systemPrompt?: string): any[] {
    const messages: any[] = [];
    if (systemPrompt && systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt });
    for (const msg of history) {
      const role = msg.role === 'ai' ? 'assistant' : (msg.role as string) === 'system' ? 'system' : 'user';
      messages.push({ role, content: msg.content });
    }
    return messages;
  }

  async generateResponse(
    history: ChatMessage[],
    systemPrompt?: string,
    opts?: { traceId?: string; model?: string; userId?: string }
  ): Promise<AIProviderResponse> {
    assertAIEnabled('Grok generateResponse');
    const start = Date.now();
    const tid = opts?.traceId;
    try {
      const token = await this.token();
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelId,
          stream: false,
          messages: this.buildMessages(history, systemPrompt),
        }),
      });
      if (!res.ok) {
        throw new Error(`Grok HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data: any = await res.json();
      const end = Date.now();
      const usage = data.usage || {};
      Telemetry.logCost('grok', usage.prompt_tokens || 0, 'input', { model: this.modelId, traceId: tid, userId: opts?.userId });
      Telemetry.logCost('grok', usage.completion_tokens || 0, 'output', { model: this.modelId, traceId: tid, userId: opts?.userId });
      return {
        reply: data.choices?.[0]?.message?.content || 'No response generated.',
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        timestamps: { start, end },
      };
    } catch (error: any) {
      logger.warn('GrokVertexProvider failed; falling back to Gemini', {
        error: String(error?.message || error).slice(0, 200),
        traceId: tid,
      });
      const gemini = new GeminiProvider();
      return gemini.generateResponse(history, systemPrompt, opts);
    }
  }

  async *generateStreamResponse(
    history: ChatMessage[],
    systemPrompt?: string,
    opts?: { traceId?: string; model?: string; userId?: string }
  ): AsyncGenerator<string, void, unknown> {
    assertAIEnabled('Grok generateStreamResponse');

    // Resilience now covers the WHOLE attempt (connect + SSE read loop), not just the initial
    // fetch. Previously, once `fetch()` resolved OK, the `reader.read()` loop below ran with NO
    // protection at all — a mid-stream network drop (ETIMEDOUT/ECONNABORTED/"terminated",
    // observed under sustained load) propagated as a raw, unhandled exception. True streaming is
    // preserved (chunks yield immediately, nothing is buffered) so TTFT is unaffected on the
    // normal path. While NOTHING has reached the caller yet, a failure at connect time OR while
    // reading before the first delta retries the whole attempt (bounded), then falls back to
    // Gemini — matching this class's existing "any failure -> Gemini" resilience contract. Once
    // at least one chunk has been yielded, a later drop is thrown as a clean error instead of
    // retried/falling-back (either would duplicate or garble the visible answer).
    const maxAttempts = 2;
    let yieldedAny = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let res: Response;
      try {
        const token = await this.token();
        res = await fetch(this.endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.modelId,
            stream: true,
            messages: this.buildMessages(history, systemPrompt),
          }),
        });
        if (!res.ok || !res.body) throw new Error(`Grok stream HTTP ${res.status}`);
      } catch (error: any) {
        if (attempt < maxAttempts - 1) {
          logger.warn(`GrokVertexProvider stream connect attempt ${attempt + 1}/${maxAttempts} failed; retrying`, {
            error: String(error?.message || error).slice(0, 200),
          });
          await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
          continue;
        }
        logger.warn('GrokVertexProvider stream init failed; falling back to Gemini', {
          error: String(error?.message || error).slice(0, 200),
        });
        const gemini = new GeminiProvider();
        yield* gemini.generateStreamResponse(history, systemPrompt, opts);
        return;
      }

      // Parse Server-Sent Events: lines beginning with "data:" carry JSON deltas.
      try {
        const reader = (res.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') return;
            try {
              const obj = JSON.parse(payload);
              const delta = obj.choices?.[0]?.delta?.content;
              if (delta) { yieldedAny = true; yield delta; }
            } catch {
              /* ignore partial/non-JSON keepalive lines */
            }
          }
        }
        return; // stream completed normally
      } catch (error: any) {
        if (yieldedAny) {
          logger.warn('GrokVertexProvider stream dropped mid-response after partial output; not retrying', {
            error: String(error?.message || error).slice(0, 200),
          });
          throw error;
        }
        if (attempt < maxAttempts - 1) {
          logger.warn(`GrokVertexProvider stream read attempt ${attempt + 1}/${maxAttempts} dropped before any output; retrying`, {
            error: String(error?.message || error).slice(0, 200),
          });
          await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
          continue;
        }
        logger.warn('GrokVertexProvider stream read failed on all attempts before any output; falling back to Gemini', {
          error: String(error?.message || error).slice(0, 200),
        });
        const gemini = new GeminiProvider();
        yield* gemini.generateStreamResponse(history, systemPrompt, opts);
        return;
      }
    }
  }
}
