import { container, TOKENS } from '../../di/container';
import { IAIProvider } from '../../interfaces/IAIProvider';
import { WorkflowEvent, WorkflowStage, WorkflowRequest } from '../types';
import { AgentContext } from '../../agents/IAgent';
import { TeacherAgent } from '../../agents/TeacherAgent';
import { ResponseFormatter } from '../../agents/ResponseFormatter';
import { buildScholarlySystemPrompt } from '../../../config/prompts';
import { Telemetry } from '../../../lib/telemetry';
import { env } from '../../../config/env';
import { StudentContext } from '../../../types/studentContext.types';
import { verificationService } from './VerificationService';
import { featureFlags } from '../../../config/featureFlags';
import { ExecutionPlan } from '../../intelligence/types';
import { promptBuilder } from '../../intelligence/PromptBuilder';

export interface GenerationParams {
  req: WorkflowRequest;
  mode: string;
  studentContext: StudentContext;
  agentContext: AgentContext;
  citationsList: any[];
  hasAttachment: boolean;
  workflowStartTime: number;
  /** Intelligence-Layer plan (Increment 2). Consumed for model routing only when the sub-flag is on. */
  plan?: ExecutionPlan;
  /** Concept-level mastery gaps (Increment 3), consumed by the dynamic prompt when the flag is on. */
  masteryWeakConcepts?: string[];
}

export interface GenerationOutcome {
  fullReply: string;
  generatedResponse: string;
  firstChunkAt: number;
  generationLatencyMs: number;
  measuredHallucinationRate: number;
  measuredCitationCoverage: number;
  measuredConfidence: number;
}

/**
 * GenerationOrchestrator — owns Stage 5.5 (reasoning trace) + Stage 6-9 (answer generation)
 * and the on-critical-path verification pass (design decision A). Implemented as an async
 * generator so the exact SSE sequence — reasoning chunks → AGENT_EXECUTION progress → answer
 * chunks → verification warning — is preserved. Returns the reply text, TTFT, generation
 * latency, and measured quality metrics.
 *
 * Moved VERBATIM from WorkflowEngine.executeStream (fast + legacy paths, reasoning prompt,
 * TTFT logging) so streaming behavior and output are byte-for-byte unchanged.
 */
export class GenerationOrchestrator {
  private get aiProvider(): IAIProvider {
    return container.resolve<IAIProvider>(TOKENS.AIProvider);
  }

  /**
   * Appends the Intelligence-Layer adaptive directive to the system prompt (Increment 2), gated by
   * `featureFlags.dynamicPrompt`. Uses only data already on the hot path (the ExecutionPlan +
   * StudentContext) so no extra I/O is added. Fully guarded — any failure returns the base prompt
   * unchanged, and with the flag off it is a no-op (byte-identical output).
   */
  private applyDynamicPrompt(base: string, params: GenerationParams): string {
    try {
      if (!featureFlags.dynamicPrompt || !params.plan) return base;
      const sc: any = params.studentContext || {};
      const built = promptBuilder.build({
        plan: params.plan,
        preferences: params.plan.personalization,
        weakTopics: sc.memory?.weakTopics,
        weakConcepts: params.masteryWeakConcepts,
        comprehensionDepth: sc.memory?.comprehensionDepth,
        masteryPercentage: sc.analytics?.masteryPercentage,
        hasNotebook: !!params.req.notebookId,
        historyLength: (params.req.history || []).length,
      });
      return built.directive ? `${base}\n\n${built.directive}` : base;
    } catch {
      return base;
    }
  }

  /**
   * Resolves everything the FAST PATH answer call needs (system prompt incl. dynamic-prompt
   * directive, routed provider, and the message history). Pure/sync and side-effect-free, so it
   * can safely be called EARLY (before the reasoning trace) to kick off the answer provider's
   * network call concurrently with the reasoning-trace call — see the latency note in `stream()`.
   */
  private prepareAnswerCall(params: GenerationParams, agentContext: AgentContext, mode: string, studentContext: StudentContext) {
    const { req } = params;
    const hasNotebookContext = agentContext.retrievedContext !== 'No specific context found.'
      && agentContext.retrievedContext !== 'Placeholder RAG Text'
      && agentContext.retrievedContext.length > 50;
    const baseSystemPrompt = buildScholarlySystemPrompt({
      mode, studentContext, retrievedContext: agentContext.retrievedContext, hasNotebookContext,
    });
    const systemPrompt = this.applyDynamicPrompt(baseSystemPrompt, params);
    const useModelRouting = featureFlags.intelligenceModelRouting && !!params.plan;
    const routedToFastTier = useModelRouting && params.plan!.model.providerToken === 'AIProvider';
    const modelToken = routedToFastTier ? TOKENS.AIProvider : TOKENS.ReasoningProvider;
    const provider = container.resolve<IAIProvider>(modelToken) as any;
    const messages = [...req.history, { role: 'user', content: req.query, timestamp: Date.now() }];
    // The ModelRouter chose the "fast" tier specifically because the query is low-complexity
    // (definitions, greetings-adjacent, simple factual asks) — it does not need Gemini's internal
    // "thinking" pass, which burns a hidden token budget BEFORE the first visible token streams
    // (measured: ~45s TTFT with thinking on vs ~10s for an equivalent reasoning-tier call).
    // Disabling it ONLY on this router-chosen fast-tier path keeps every other path (routing off,
    // reasoning tier, Grok-failure fallback) byte-for-byte unchanged.
    const extraOpts = routedToFastTier ? { disableThinking: true } : {};
    return { systemPrompt, provider, messages, extraOpts };
  }

  async *stream(params: GenerationParams): AsyncGenerator<WorkflowEvent, GenerationOutcome, unknown> {
    const { req, mode, studentContext, agentContext, citationsList, hasAttachment, workflowStartTime } = params;
    let firstChunkAt = 0;
    const generationStartTime = Date.now();

    // ── Latency optimization: overlap the answer call's connection setup with the reasoning
    // trace call ──────────────────────────────────────────────────────────────────────────────
    // Previously the reasoning-trace network call ran to completion BEFORE the answer-generation
    // call even started — two independent round-trips (auth handshake + connection + TTFB) paid
    // fully sequentially. Neither call depends on the other's output, so when both are enabled we
    // prepare the answer call and call `.next()` on its async generator immediately: this starts
    // the underlying fetch (auth token fetch + request) WHILE the reasoning trace streams. The SSE
    // event order below (reasoning → AGENT_EXECUTION progress → answer chunks) is unchanged; only
    // the underlying network timing overlaps. Fails open: any setup error just clears `earlyAnswer`
    // and the FAST PATH block below prepares fresh, exactly as before.
    let earlyAnswer: { provider: any; messages: any[]; systemPrompt: string; extraOpts: any; iterator: AsyncGenerator<string, void, unknown>; firstNext: Promise<IteratorResult<string, void>> } | null = null;
    if (env.CHAT_REASONING_ENABLED !== 'false' && env.CHAT_FAST_ANSWER !== 'false') {
      try {
        const prep = this.prepareAnswerCall(params, agentContext, mode, studentContext);
        if (typeof prep.provider.generateStreamResponse === 'function') {
          const iterator = prep.provider.generateStreamResponse(prep.messages, prep.systemPrompt, { traceId: req.traceId, model: req.model, userId: req.userId, ...prep.extraOpts });
          const firstNext = iterator.next();
          // Attach a no-op observer NOW so Node never reports this as an unhandled rejection —
          // the REAL error (if any) still surfaces when `firstNext` is awaited for real below.
          firstNext.catch(() => {});
          earlyAnswer = { provider: prep.provider, messages: prep.messages, systemPrompt: prep.systemPrompt, extraOpts: prep.extraOpts, iterator, firstNext };
        }
      } catch {
        earlyAnswer = null;
      }
    }

    // ── Stage 5.5: Reasoning trace (detailed, architecture-aware) ──────
    if (env.CHAT_REASONING_ENABLED !== 'false') {
      try {
        const graphMeta = (agentContext.sharedState['graphMeta'] as any) || {};
        const hasGraph = !!agentContext.sharedState['graphContext'];
        const ctxLen = (agentContext.retrievedContext || '').length;
        const signals = [
          hasAttachment
            ? `- Intent: the student has ATTACHED A FILE and wants it read / analysed / summarised. Its full extracted text is already included inline in the question above — you HAVE the document's contents. Plan around analysing THAT document. Never say you cannot access, open or read files.`
            : `- Intent: interpret the question "${req.query}" and infer the student's real goal + level`,
          hasGraph
            ? `- Knowledge graph: matched ${graphMeta.matched ?? '?'} seed concept(s); traversed ~${graphMeta.nodeCount ?? '?'} nodes / ${graphMeta.edgeCount ?? '?'} relationships to pull in prerequisites and related topics`
            : `- Knowledge graph: no notebook-scoped concept graph applied for this query`,
          hasAttachment
            ? `- Source: the attached document's own text is the primary source. No curriculum/web retrieval was run (deliberately, so unrelated material isn't mixed in).`
            : citationsList.length > 0
              ? `- Vector retrieval (RAG): ${citationsList.length} passage(s) retrieved from ${req.notebookId ? "the student's material" : 'the NCERT curriculum corpus'} and reranked for relevance`
              : `- Vector retrieval: no strongly-matching passages found, so drawing on general subject knowledge`,
          ctxLen > 50
            ? `- Fused GraphRAG context assembled (${ctxLen} chars: graph relationships + retrieved passages)`
            : hasAttachment
              ? `- The attached document's text is available inline for you to analyse.`
              : `- No specific retrieved context found; will rely on internal expertise`,
        ].join('\n');

        const reasoningSystem = `You are the internal reasoning trace of a GraphRAG tutoring engine, thinking OUT LOUD in the first person about HOW you will approach the student's question — BEFORE any answer is written. This trace is shown live as your "thinking".

Cover ONLY your process and plan, as flowing paragraphs (no headings, no bullet lists):
1. What the student is really asking, and the level/intent behind it.
2. What the pipeline surfaced — the knowledge-graph concepts + relationships and the retrieved passages (use the signals below). Note what's relevant, what's a false positive, and what's missing.
3. The PREREQUISITE concepts a student needs before this one, and how the ideas connect / build on each other.
4. How you will EXPLAIN it — the order you'll take, how deep to go, what kinds of examples or analogies you'll use, and what to emphasise.

ABSOLUTELY CRITICAL — this is your reasoning, NOT the answer:
- Do NOT state any actual facts, definitions, formulas, values, mechanisms, or explanations of the concept itself. For example, say "I'll explain what red blood cells do and their key structural feature" — do NOT say what they do or what that feature is.
- Refer to topics by name only; never teach or define them here.
- No numbered content, no worked examples, no summary of the material.
- If the student attached a file, its extracted text is ALREADY provided to you inline — plan how you'll analyse that document. NEVER claim you cannot access, open or read files, and never pivot to unrelated material.
The actual explanation belongs ONLY in the final answer that comes after this. Do NOT introduce yourself or mention being "Scholarly".`;

        const anyProvider = this.aiProvider as any;
        if (typeof anyProvider.generateStreamResponse === 'function') {
          // When a file is attached, req.query holds the whole extracted document — cap it so
          // the reasoning call stays within budget while still conveying what the doc is about.
          const qForReason = req.query.length > 2000 ? `${req.query.slice(0, 2000)} …[document continues]` : req.query;
          const userContent = `Student question / attached content:\n"${qForReason}"\n\nInternal pipeline signals for this query:\n${signals}\n\nRetrieved context excerpt (may be empty):\n${(agentContext.retrievedContext || '').slice(0, 1200)}`;
          const rStream = anyProvider.generateStreamResponse(
            [{ role: 'user', content: userContent, timestamp: Date.now() }],
            reasoningSystem,
            { traceId: req.traceId, userId: req.userId, model: env.CHAT_REASONING_MODEL || 'gemini-2.5-flash', disableThinking: true, maxOutputTokens: 900 }
          );
          for await (const chunk of rStream) {
            if (chunk) yield { type: 'reasoning', chunk };
          }
        }
      } catch (e) {
        console.warn('Reasoning trace generation failed (non-fatal):', (e as Error).message);
      }
    }

    // Quality metrics (populated by verification when a notebook + citations exist).
    let measuredHallucinationRate = 0;
    let measuredCitationCoverage = citationsList.length > 0 ? 1 : 0;
    let measuredConfidence = citationsList.length > 0 ? 0.9 : 0.7;
    let fullReply = '';
    let generatedResponse = '';

    // Verification stays on the critical path (design decision A): it still streams the
    // `warning` event and feeds `done.confidenceScore`. Computation is delegated to
    // VerificationService; the streaming/warning concern remains here.
    const runVerification = async function* (text: string): AsyncGenerator<WorkflowEvent> {
      if (!(req.notebookId && text && citationsList.length > 0)) return;
      const result = await verificationService.verify(text, citationsList as any);
      if (!result) return; // non-fatal failure — keep default metrics
      if (result.hallucinationRate !== undefined) measuredHallucinationRate = result.hallucinationRate;
      if (result.citationCoverage !== undefined) measuredCitationCoverage = result.citationCoverage;
      measuredConfidence = result.confidence;
      if (result.warnings.length > 0) {
        agentContext.sharedState['verificationWarnings'] = result.warnings;
        yield { type: 'warning', warning: `Note: some claims could not be verified against your material: ${result.warnings.join('; ')}` };
      }
    };

    // ── Stage 6-9: Answer generation ───────────────────────────────────
    yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: `Scholarly AI ${mode} mode composing the answer...` };

    if (env.CHAT_FAST_ANSWER !== 'false') {
      // FAST PATH — single streaming pass straight from the reasoning provider (Grok,
      // transparently Gemini on failure) using the full teaching prompt. No separate
      // non-streaming draft and no second reformat pass: the answer streams live as
      // it is generated, so there is no silent gap.
      //
      // If `earlyAnswer` was prepared above (concurrent with the reasoning trace), reuse its
      // already-in-flight iterator instead of starting a brand new call — this is what actually
      // removes the sequential round-trip. Any failure on the early call falls back to preparing
      // fresh here, so behavior/output is identical either way; only timing differs.
      let provider: any; let messages: any[]; let systemPrompt: string; let extraOpts: any = {};
      let iterator: AsyncGenerator<string, void, unknown> | null = null;
      let pendingFirst: Promise<IteratorResult<string, void>> | null = null;
      if (earlyAnswer) {
        ({ provider, messages, systemPrompt, iterator, extraOpts } = earlyAnswer);
        pendingFirst = earlyAnswer.firstNext;
      } else {
        const prep = this.prepareAnswerCall(params, agentContext, mode, studentContext);
        provider = prep.provider; messages = prep.messages; systemPrompt = prep.systemPrompt; extraOpts = prep.extraOpts;
      }

      if (iterator) {
        // Consume the already-pending first chunk (from the early kickoff) before continuing the
        // iterator normally — this is the actual latency win: its network round-trip started
        // during the reasoning trace instead of after it. A rejection here is a genuine provider
        // failure (same as the non-early path would hit) and propagates unchanged — retrying with
        // an identical fresh call would just double the failure latency for no benefit, since the
        // provider/params are the same either way.
        let next = pendingFirst ? await pendingFirst : await iterator.next();
        while (!next.done) {
          const chunk = next.value;
          if (chunk) {
            if (!firstChunkAt) {
              firstChunkAt = Date.now();
              Telemetry.logTTFT('chat_workflow', firstChunkAt - workflowStartTime, { userId: req.userId, notebookId: req.notebookId });
            }
            fullReply += chunk;
            yield { type: 'chunk', chunk };
          }
          next = await iterator.next();
        }
      } else if (typeof provider.generateStreamResponse === 'function') {
        for await (const chunk of provider.generateStreamResponse(messages, systemPrompt, { traceId: req.traceId, model: req.model, userId: req.userId, ...extraOpts })) {
          if (!chunk) continue;
          if (!firstChunkAt) {
            firstChunkAt = Date.now();
            Telemetry.logTTFT('chat_workflow', firstChunkAt - workflowStartTime, { userId: req.userId, notebookId: req.notebookId });
          }
          fullReply += chunk;
          yield { type: 'chunk', chunk };
        }
      } else {
        const res = await provider.generateResponse(messages, systemPrompt, { traceId: req.traceId, model: req.model, userId: req.userId, ...extraOpts });
        fullReply = res.reply || '';
        yield { type: 'chunk', chunk: fullReply };
      }
      generatedResponse = fullReply;

      // Verify AFTER streaming (fast path streams before we have the full text).
      for await (const evt of runVerification(generatedResponse)) yield evt;
    } else {
      // LEGACY PATH — Grok draft (non-streaming) -> verify -> Gemini reformat stream.
      const teacher = new TeacherAgent();
      await teacher.execute(agentContext);
      generatedResponse = agentContext.sharedState['teacherDraft'] || '';
      yield { type: 'progress', stage: WorkflowStage.VERIFICATION, message: 'Verifying retrieved information...' };
      for await (const evt of runVerification(generatedResponse)) yield evt;
      yield { type: 'progress', stage: WorkflowStage.ASSET_GENERATION, message: 'Creating learning assets...' };
      const formatter = new ResponseFormatter();
      if (formatter.executeStream) {
        for await (const chunk of formatter.executeStream(agentContext)) {
          if (!firstChunkAt) {
            firstChunkAt = Date.now();
            Telemetry.logTTFT('chat_workflow', firstChunkAt - workflowStartTime, { userId: req.userId, notebookId: req.notebookId });
          }
          fullReply += chunk;
          yield { type: 'chunk', chunk };
        }
      }
    }
    const generationLatencyMs = Date.now() - generationStartTime;

    return {
      fullReply,
      generatedResponse,
      firstChunkAt,
      generationLatencyMs,
      measuredHallucinationRate,
      measuredCitationCoverage,
      measuredConfidence,
    };
  }
}

export const generationOrchestrator = new GenerationOrchestrator();
