/**
 * Manual verification script for the reasoning-first tutor rework (feature/teacher-dashboard).
 * Exercises the REAL WorkflowEngine pipeline (real Gemini calls) end-to-end, bypassing
 * HTTP/auth, to confirm:
 *  - TEACHER mode: 'reasoning' events carry a genuine private scratchpad (not a preview
 *    of the final answer), and 'chunk' events carry a distinct, persona-voiced answer.
 *  - A 'suggestions' event with follow-up questions arrives before 'done'.
 *  - QUIZ mode (non-gated): unchanged draft-then-format behavior, no suggestions event.
 *
 * Usage: npx tsx src/scripts/test_reasoning_tutor.ts
 */
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { workflowEngine, WorkflowRequest, WorkflowEvent } from '../core/workflow/WorkflowEngine';

// Captures every (systemPrompt -> reply) pair for the --dump-prompts run, written to
// a JSON file at the end so the exact prompts/replies can be inspected outside the terminal.
const capture: { call: number; systemPrompt: string; reply: string }[] = [];
let callCounter = 0;

/**
 * Real Gemini calls via Vertex AI Express Mode (vertexai:true + apiKey) — the one auth
 * shape `gemini.provider.ts` doesn't support today (it only does Vertex-via-service-account
 * or non-Vertex-via-apiKey). Test-only: lets us validate real model output against the
 * actual prompts/logic without touching the production provider. Key comes from an env
 * var, never hardcoded or written to any tracked file.
 */
class RealVertexExpressProvider {
  private ai: GoogleGenAI;
  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ vertexai: true, apiKey });
  }
  private toContents(messages: any[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.content }] }));
  }
  async generateResponse(messages: any[], systemPrompt?: string) {
    const sys = systemPrompt || messages.find((m) => m.role === 'system')?.content;
    const res = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: this.toContents(messages),
      config: sys ? { systemInstruction: sys, temperature: 0.7 } : { temperature: 0.7 },
    });
    const reply = res.text || '';
    capture.push({ call: ++callCounter, systemPrompt: sys || '', reply });
    return { reply };
  }
  async *generateStreamResponse(messages: any[], systemPrompt?: string) {
    const sys = systemPrompt || messages.find((m) => m.role === 'system')?.content;
    const stream = await this.ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: this.toContents(messages),
      config: sys ? { systemInstruction: sys, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } } : { temperature: 0.7 },
    });
    let full = '';
    for await (const chunk of stream) {
      if (chunk.text) { full += chunk.text; yield chunk.text; }
    }
    capture.push({ call: ++callCounter, systemPrompt: sys || '', reply: full });
  }
}

/**
 * This environment has no `secrets/vertex-sa.json` (correctly not committed to git), so
 * real Gemini calls fail auth. This fake provider stands in for TOKENS.AIProvider so we
 * can still verify the actual control flow — does the reasoning scratchpad genuinely
 * separate from the final answer, does it flow from TeacherAgent into ResponseFormatter,
 * does mode gating pick the right branch — by inspecting which system prompt each call
 * received and echoing back a marker that proves it. It does NOT validate real model
 * output quality/tone; that needs real credentials.
 */
class FakeAIProvider {
  async generateResponse(messages: any[], systemPrompt?: string) {
    return { reply: this.respond(this.effectivePrompt(messages, systemPrompt)) };
  }
  async *generateStreamResponse(messages: any[], systemPrompt?: string) {
    yield this.respond(this.effectivePrompt(messages, systemPrompt));
  }
  // ResponseFormatter's legacy (non-gated) call path passes the system prompt as a
  // `system`-role message instead of the positional arg — matches real behavior.
  private effectivePrompt(messages: any[], systemPrompt?: string): string | undefined {
    if (systemPrompt) return systemPrompt;
    return messages.find((m) => m.role === 'system')?.content;
  }
  private respond(systemPrompt?: string): string {
    if (systemPrompt?.includes("Think, Don't Answer Yet")) {
      return "FAKE_REASONING: student asks about Newton's second law. Concept: F=ma, prerequisite is force/mass. Plan: explain via a car-pushing analogy suited to a beginner.";
    }
    if (systemPrompt?.includes('Your Private Reasoning (internal plan')) {
      const gotReasoning = systemPrompt.includes('FAKE_REASONING');
      return `FAKE_FINAL_ANSWER (reasoning was injected into composition prompt: ${gotReasoning}) — Newton's second law states F=ma...`;
    }
    if (systemPrompt?.includes('FORMATTING, not rewriting')) {
      const draftMatch = systemPrompt.match(/## Draft Response\n([\s\S]*?)(?:\n\n|$)/);
      return `FAKE_FORMATTED(draft-was: "${(draftMatch?.[1] || '').trim()}")`;
    }
    return 'FAKE_DRAFT: quiz-mode draft answer about force and motion.';
  }
}

async function runCase(label: string, req: WorkflowRequest) {
  console.log(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}`);
  let reasoning = '';
  let answer = '';
  let suggestions: string[] | null = null;
  const eventTypeCounts: Record<string, number> = {};

  const start = Date.now();
  for await (const event of workflowEngine.executeStream(req) as AsyncGenerator<WorkflowEvent>) {
    eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
    if (event.type === 'reasoning' && event.text) reasoning += event.text;
    if (event.type === 'chunk' && event.chunk) answer += event.chunk;
    if (event.type === 'suggestions') suggestions = event.suggestions || [];
    if (event.type === 'error') console.error('ERROR EVENT:', event.message);
  }
  const elapsed = Date.now() - start;

  console.log(`\n--- event counts --- ${JSON.stringify(eventTypeCounts)}`);
  console.log(`--- elapsed: ${elapsed}ms ---`);
  console.log(`\n--- REASONING (${reasoning.length} chars) ---\n${reasoning}`);
  console.log(`\n--- ANSWER (${answer.length} chars) ---\n${answer}`);
  console.log(`\n--- SUGGESTIONS ---\n${suggestions ? JSON.stringify(suggestions, null, 2) : '(none)'}`);

  const verbatimOverlap = reasoning.length > 0 && answer.includes(reasoning.trim());
  console.log(`\n--- CHECK: answer verbatim-contains reasoning? ${verbatimOverlap ? 'YES (BAD — not genuinely distinct)' : 'no (good — distinct passes)'} ---`);
}

async function main() {
  bootstrapDI();

  const expressKey = process.env.TEST_VERTEX_EXPRESS_KEY;
  if (expressKey) {
    container.register(TOKENS.AIProvider, new RealVertexExpressProvider(expressKey));
    console.log('[test] Registered RealVertexExpressProvider — using REAL Gemini output via Vertex Express Mode.');
  } else {
    container.register(TOKENS.AIProvider, new FakeAIProvider());
    console.log('[test] No TEST_VERTEX_EXPRESS_KEY set — registered FakeAIProvider instead (control-flow-only check).');
  }

  await runCase('TEACHER mode — conceptual question, no notebook', {
    userId: 'test-script-user-001',
    sessionId: 'test-script-session-001',
    query: 'What is Newton\'s second law of motion?',
    history: [],
    mode: 'TEACHER',
  });

  await runCase('QUIZ mode — non-gated, should keep old draft-then-format behavior', {
    userId: 'test-script-user-001',
    sessionId: 'test-script-session-002',
    query: 'Quiz me on basic physics: force and motion.',
    history: [],
    mode: 'QUIZ',
  });

  if (expressKey) {
    await runCase('REVISION mode — conceptual question, no notebook', {
      userId: 'test-script-user-001',
      sessionId: 'test-script-session-003',
      query: 'Give me a quick revision of the French Revolution causes.',
      history: [],
      mode: 'REVISION',
    });
  }

  if (expressKey) {
    const outPath = process.env.DUMP_PROMPTS_TO || './_prompt_capture.json';
    fs.writeFileSync(outPath, JSON.stringify(capture, null, 2));
    console.log(`\n[test] Wrote ${capture.length} (systemPrompt -> reply) pairs to ${outPath}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Test script failed:', e);
  process.exit(1);
});
