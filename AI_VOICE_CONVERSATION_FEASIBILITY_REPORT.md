# AI VOICE CONVERSATION FEASIBILITY REPORT

**Scope:** Can the existing AI Chat be extended to support real-time, interruptible, bidirectional voice conversation with an AI tutor?
**Type:** Audit and feasibility study. **No code was modified, created, installed or refactored.**
**Repository:** `d:\scholarly`
**Date:** 2026-08-08
**Method:** Direct source inspection + official Google documentation + latency measured from this platform's own running logs.

**Final decision: PROTOTYPE REQUIRED BEFORE IMPLEMENTATION** (see §29–30).

---

## 1. Executive Summary

Real-time voice is achievable on this platform, but **almost none of the required infrastructure exists today**, and one decisive unknown must be tested before any build is committed.

### Verified by inspection

| Finding | Evidence |
|---|---|
| Chat is **one-directional SSE-over-fetch**, request/response | `useWorkflowStream.ts`, `chat.controller.ts` L68-78 |
| **No WebSocket server anywhere** | Repo-wide grep for `socket.io`, `WebSocketServer`, `express-ws`, `from 'ws'` → **0 matches**; `ws` absent from both `package.json` |
| **No audio capture infrastructure at all** | No `getUserMedia`, `MediaRecorder`, `AudioContext`, `AudioWorklet` anywhere in frontend |
| Mic button = browser STT that **types into the textarea** | `Chat.tsx` `handleTalk()` L216-253 |
| Speak button = `window.speechSynthesis` | `Chat.tsx` `handleSpeak()` L373-391 |
| **No server-side STT** | No `@google-cloud/speech` dependency; no STT service |
| **No tool/function calling anywhere** | Grep `functionDeclarations`, `toolConfig`, `function_call`, `tools:` → 0 hits in backend `src` |
| Every model collapses to one | `gemini.provider.ts` L20-25 |

### The two findings that dominate the recommendation

1. **Your Gemini access may not be able to open a Live session at all.**
   `gemini.provider.ts` L20-25 documents that the Vertex AI Express endpoint in use (project `531689269935`) **404s every model except `gemini-2.5-flash`**. The Live API requires distinct native-audio model IDs. Cheap to test; determines the entire architecture.

2. **The existing RAG is 6–15× too slow for a voice turn.**
   Measured from this platform's own logs during this session: `retrieval_total` **4,472–7,169 ms**; full `chat_workflow_total` **14,459 ms** with **6,882 ms** to first token. The platform's own alerting fired: `High latency detected: 14459ms`.

### Verdict

**YELLOW** — feasible; requires meaningful architectural additions (client audio layer, realtime session abstraction, tool layer, voice-tuned retrieval). No permanent blockers found.

---

## 2. Current AI Chat Architecture

Discovered, not assumed:

```
Chat.tsx  (React, local useState — no store)
   │  native fetch + response.body.getReader()  (NOT EventSource)
   ▼
POST /api/chat/stream                requireAuth (Firebase Admin, uid from token)
   ▼
ChatController.handleChatStream      manual SSE headers + res.flushHeaders()
   ▼
ChatService.processChatStream        saves user msg to Firestore, loads history
   ▼
workflowEngine.executeStream(req)    AsyncGenerator of events
   ▼
progress | reasoning | chunk | citation | warning | done   →  res.write(`data: …\n\n`)
   ▼
RAG (Pinecone + Cohere rerank) · GraphRAG · StudentContext · IntelligenceService
```

### File map

| File | Path | Purpose | Voice relevance |
|---|---|---|---|
| Chat page | `frontend/src/pages/Chat.tsx` (1196 lines) | Chat UI, model selector, attachments, mic, per-message speak | Host for voice mode; too large to extend inline |
| Stream hook | `frontend/src/hooks/ai/useWorkflowStream.ts` | SSE parsing via `getReader()`/`TextDecoder`, `AbortController` | Not reusable — one-directional |
| Controller | `backend-firestore/src/controllers/chat.controller.ts` (L68-78) | SSE headers, attachment parsing | Request contract + auth pattern reusable |
| Service | `backend-firestore/src/services/chat.service.ts` (L123-150) | Event → `res.write`, Firestore persistence | Persistence reusable |
| Routes | `backend-firestore/src/routes/chat.routes.ts` | `router.use(requireAuth)` on **all** chat routes | Auth pattern reusable |
| Storage | `backend-firestore/src/repositories/chat.repository.ts` | `getOrCreateSession`, `saveMessage`, `getMessages` | Reusable with a `modality` field |

### Notable observations

- Chat state is **local `useState`** — no chat store/context. `@tanstack/react-query` is installed but not used for chat.
- Server disables compression for `text/event-stream` and `/api/chat/stream` (required for SSE to flush).
- Modes available: `chat, study-guide, podcast, slides, worksheet, infographic, mindmap, image, page, meeting-notes`. **No "Deep Research" option found in `Chat.tsx`** — a separate `frontend/src/pages/Research.tsx` exists but was not inspected. *NOT DETERMINED FROM CODEBASE.*

---

## 3. Existing Voice/Microphone Implementation

**Answer: option C + G — browser Web Speech API feeding the text input. No audio ever reaches the backend.**

### Input — `Chat.tsx` `handleTalk()` (L216-253)

```
window.SpeechRecognition || window.webkitSpeechRecognition
recognition.continuous    = true
recognition.interimResults = true
onresult → setInput(prev => prev + finalTranscript)
onerror / onend → setIsListening(false)
```

### Output — `Chat.tsx` `handleSpeak()` (L373-391)

```
window.speechSynthesis + SpeechSynthesisUtterance
markdown stripped: content.replace(/[#*_\[\]`]/g, '')
speechSynthesis.cancel() on toggle and on unmount
```

### Capability inventory

| Capability | Present? |
|---|---|
| `getUserMedia` | **No** |
| `MediaRecorder` | **No** |
| `AudioContext` / `AudioWorklet` | **No** |
| PCM conversion / sample-rate control | **No** |
| Audio upload to backend | **No** |
| Server-side STT / transcription | **No** |
| WebSocket | **No** |
| Audio playback beyond `speechSynthesis` | **No** |

**Conclusion:** the entire real audio stack is greenfield. The current feature is a text-entry convenience, not a voice pipeline, and is Chrome/Edge-only.

---

## 4. Current AI Provider Architecture

An abstraction **exists** — `backend-firestore/src/services/ai/ai.provider.interface.ts`:

```ts
export interface AIProvider {
  generateResponse(history: ChatMessage[], systemPrompt?: string, opts?): Promise<AIProviderResponse>;
  generateStreamResponse?(history: ChatMessage[], systemPrompt?: string, opts?): AsyncGenerator<string, void, unknown>;
}
```

Implementations found: `gemini.provider.ts`, `groq.provider.ts`, `gpt.provider.ts`, `claude.provider.ts`, `nvidia.provider.ts`, `grok-vertex.provider.ts`, plus `services/ai/providers/`.

### Critical: the interface is text-only

`AsyncGenerator<string>` cannot express audio frames, turn boundaries, or interruption. **A Live voice provider cannot implement `AIProvider`.** It needs a *sibling* abstraction (e.g. `IRealtimeVoiceSession`), not a new `AIProvider` implementation.

### Critical: all models collapse to one

`backend-firestore/src/services/ai/gemini.provider.ts` L20-25:

```ts
// The Vertex AI Express endpoint this project uses (project 531689269935,
// asia-southeast1) currently only serves `gemini-2.5-flash`. Every other model id
// — gemini-2.5-pro, gemini-2.0-flash, gemini-3.x, gemini-1.5, *-latest, *-lite —
// returns 404 NOT_FOUND (verified 2026-07 by probing the endpoint).
const SUPPORTED_MODELS = new Set<string>(['gemini-2.5-flash']);
const DEFAULT_MODEL = 'gemini-2.5-flash';
```

The UI offers **12 models**; all normalize to one. Also `AIOrchestrator.getProviderForMode()` **ignores mode** and always returns Gemini; Groq is a catch-block fallback only.

### Environment (from `.env`)

```
GOOGLE_GENAI_USE_VERTEXAI = true
GOOGLE_VERTEX_PROJECT     = eng-cache-501514-q4   (number 531689269935)
GOOGLE_VERTEX_LOCATION    = us-central1
```

> **Discrepancy to resolve:** `gemini.provider.ts` says `asia-southeast1`; `.env` says `us-central1`. Same project number. One is stale, and it affects which regional capacity pool is used.

### Relevant dependencies already installed

**Backend:** `@google/genai ^2.12.0`, `@google-cloud/vertexai ^1.12.0`, `@google/generative-ai ^0.24.1`, `@google-cloud/text-to-speech ^6.4.1`, `@pinecone-database/pinecone ^8.0.0`, `groq-sdk`, `openai ^6.45.0`, `redis ^6.1.0`, `bullmq`, `express-rate-limit`, `rate-limit-redis`, `cockatiel`, `winston`.

**Frontend:** `@google/genai ^2.4.0`, `@tanstack/react-query ^5.101.2`, `firebase ^12.15.0`, `axios`, `motion`, `lucide-react`.

**No `ws`, no `socket.io`, no audio library in either.**

---

## 5. Gemini / Real-Time Voice Feasibility

Verified against current official documentation.

| Capability | Status | Source |
|---|---|---|
| Bidirectional realtime interaction | Yes | [Live API overview](https://ai.google.dev/gemini-api/docs/live-api) |
| Native audio input **and** output | Yes | [WebSockets guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket) |
| Raw WebSocket integration | Yes | [Live WS reference](https://ai.google.dev/api/live) |
| Server-side SDK integration | Yes | [GenAI SDK guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk) |
| Voice interruption / barge-in | Yes — model responses can be interrupted by voice | [Agent Platform reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/multimodal-live) |
| Function calling in-session | Yes — server can send function call requests | [Live WS reference](https://ai.google.dev/api/live) |
| Session: audio-only duration | **15 min** without context compression; **unlimited** with compression | [Session management](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session) |
| Session: audio + video duration | **2 min** without compression | same |
| Single connection lifetime | ~**10 min** — requires resumption | [Firebase sessions](https://firebase.google.com/docs/ai-logic/live-api/sessions) |
| Session context window | **128k tokens** | [Limits and specs](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs) |
| Ephemeral tokens | **1 min** to start a session; **30 min** to send messages | [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens) |
| Native audio latency rationale | Single low-latency model processes raw audio; unification is the core latency win | [Vertex AI native audio blog](https://cloud.google.com/blog/topics/developers-practitioners/how-to-use-gemini-live-api-native-audio-in-vertex-ai?hl=en) |
| Thinking budget control | `thinkingBudget`, `0` disables | [Capabilities guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities) |

*Content was rephrased for compliance with licensing restrictions.*

### How this fits THIS application

**Positive:** `@google/genai` is already a dependency on both frontend and backend — no new SDK required.

**Blocking unknown:** Live requires a **native-audio model ID**. This project's endpoint resolves exactly one non-audio model and 404s the rest. **Whether these credentials can open a Live session is NOT DETERMINED FROM CODEBASE and must be probed.**

**Quota concern:** the platform is *already* receiving `429 RESOURCE_EXHAUSTED` on `gemini-2.5-flash`, which runs on **Dynamic Shared Quota** — there is no per-project per-minute limit that can be raised for it. Voice consumes far more tokens per minute than text.

---

## 6. Frontend Feasibility

React + Vite. State: local `useState` per page. Routing: `react-router-dom`. No audio or WebSocket libraries installed.

Everything audio must be built: mic capture via `AudioWorklet`, PCM downsampling to the required rate, a playback queue, barge-in cancellation with buffer flush, and an explicit state machine.

### Recommended state model

Today `Chat.tsx` has only `isListening: boolean` and `speakingIndex: number | null`. A voice session needs:

```
IDLE → CONNECTING → LISTENING → THINKING → AI_SPEAKING
                        ↑            │            │
                        └──── INTERRUPTED ◄───────┘

ERROR · DISCONNECTED · RECONNECTING · ENDED
```

Implement as a reducer/state machine inside a new `useVoiceSession` hook — **not** as additional booleans in a 1196-line component.

### Browser considerations

- `AudioWorklet` requires a secure context (HTTPS or localhost) — fine.
- Mic permission must be requested explicitly with a visible indicator.
- The current Web Speech dependency (Chrome/Edge only) becomes moot.

---

## 7. Backend Feasibility

| Requirement | Status | Evidence |
|---|---|---|
| SSE streaming | **Yes** | `chat.controller.ts` L68-78; compression disabled for SSE |
| WebSocket server | **No — must be added** | 0 grep matches; no `ws` dependency |
| Persistent connections | No | Stateless Express |
| Authentication | **Yes** | `requireAuth`, Firebase Admin, uid from verified token only |
| Authorization | Yes | Ownership checks return 403 (`getSessionHistory`) |
| Rate limiting | **Yes** | `express-rate-limit` + `rate-limit-redis` |
| Redis | **Yes** | `redis ^6.1.0`, BullMQ, rate limiting |
| Conversation persistence | **Yes** | Firestore via `chat.repository.ts` |
| Tool execution | **No** | No tool layer exists |
| Circuit breakers / resilience | Yes | `cockatiel`, `llmPolicy`, `runResilient` |

### Recommendation: Option B (hybrid), not Option A

**Chosen: browser ↔ Gemini Live directly, authorised by a backend-minted ephemeral token; browser continues to call existing REST/SSE APIs for RAG, tools and context.**

Why not Option A (proxy all audio through Express):

- Adds a full audio hop in each direction on the latency-critical path.
- Converts a stateless Express app into a stateful audio router.
- Single-instance topology has no WS fan-out or sticky-session strategy.
- Node would shuttle continuous PCM per concurrent student.

Option B advantages: shortest audio path; **API key never leaves the server** (ephemeral tokens exist for exactly this); **requires no WebSocket server at all** — the only new backend surface is a short token-minting REST endpoint.

Trade-off, stated plainly: **audio never traverses your backend, so central audio observability is lost.** Transcripts and usage still flow through your APIs, which is an acceptable compromise.

---

## 8. WebSocket / Streaming Readiness

SSE is proven twice in this codebase:

1. `/api/chat/stream` — manual SSE, consumed via `fetch` + `getReader()`.
2. `core/pipeline/orchestrator/PipelineRealtimeService.ts` (L87-91) + `frontend/src/hooks/usePipelineRealtime.ts` — `EventSource`-based.

**SSE is one-directional and cannot carry microphone audio upstream.** It is not extensible to this use case; it is not a partial foundation.

**With Option B, no WebSocket server is needed** — a significant simplification and a strong argument for that architecture.

---

## 9. RAG Integration Feasibility

Wiring is easy. **Latency is the blocker.**

### Measured on this platform, this session (real logs, not estimates)

| Stage | Observed |
|---|---|
| `query_embedding` | 1,858 – 1,925 ms |
| `pinecone_search` | 1,725 – 4,318 ms |
| `cohere_rerank` | 353 – 579 ms |
| **`retrieval_total`** | **4,472 – 7,169 ms** |
| `chat_workflow_total` | 14,459 ms |
| Time to first token | 6,882 ms |

The platform's own alerting fired: `Alert triggered: latency High latency detected: 14459ms for gemini/gemini-2.5-flash`.

A conversational turn tolerates roughly **300–800 ms**. Current RAG is **6–15× over budget**. Calling it synchronously inside a voice turn produces dead air.

### Reusable services

`services/rag/retrieval.service.ts`, `services/rag/graphRetrieval.service.ts`, `services/rag/pinecone.service.ts`. `GraphRetrievalService` tracks `traversalMs`.

### Mitigation strategy, by value

1. **Preload context at session start** — resolve chapter/topic scope once, inject into the Live system instruction. **Zero per-turn cost.** Handles the majority of tutoring turns.
2. **Speak first, retrieve second** — model acknowledges ("let me check your NCERT chapter…") while a function call runs.
3. **Voice-tuned fast retrieval path** — drop Cohere rerank (~0.5 s), cache query embeddings, reduce top-k.
4. **Never** run Deep Research or GraphRAG traversal inside a turn.

Existing RAG is reusable **as a tool**, not as a blocking pre-step.

---

## 10. Student Context Integration

**The most reusable component in the platform.**

`backend-firestore/src/services/studentContext.service.ts` L37:

```ts
async aggregateContext(userId: string): Promise<StudentContext> {
  const [profile, memory, analytics, stats, planner, notebooks, digitalTwin] =
    await Promise.all([ ... ]);
```

Seven sources fetched in parallel. Consumed today by `PodcastPlanner` (exam, difficulty band, mastery %, weak topics) and by `LearnerProfileBuilder`.

**Recommendation: call once at session start**, inject into the Live system instruction. This delivers the "Mujhe physics padhni hai" scenario with **zero per-turn latency**.

**Caveat observed live:** outside an HTTP request scope it throws
`Dependency not found for token: Symbol(IMemoryProvider)` (DI not registered). It is caught and non-fatal, but a voice session must either run in a properly initialised DI scope or tolerate degraded context.

Also reusable: `frontend/src/lib/learningTree.ts` (`buildLearningDirective`, `collectScopeSourceIds`) already converts a chapter selection into a tutor directive and hard retrieval scope — directly applicable to session-start context.

---

## 11. Tool / Function Calling Integration

**Does not exist. This must be built from zero.**

Grep across backend `src` for `functionDeclarations`, `toolConfig`, `function_call`, `tools:` → **no hits**.

None of the following exists as a callable tool: `searchKnowledge`, `getWeakTopics`, `generateQuestion`, `solveQuestion`, `evaluateAnswer`, `startQuiz`, `getStudentProgress`, `analyzeImage`, `searchWeb`, `createStudyPlan`.

The **capabilities** exist as services (retrieval, quiz, student context, OCR via `tesseract.js`), but nothing is exposed as a declarable function schema.

### What must be built

| Piece | Notes |
|---|---|
| Tool declarations | JSON schema per tool (Zod is already a dependency for generation) |
| Dispatcher | Name → service call, with timeout and error shaping |
| **Per-tool authorization** | Re-verify ownership server-side; never trust a `userId` supplied by the model |
| Result return path | Feed results back into the live session |
| Latency guards | Hard timeout; filler speech while running |

Live supports tool calling; **this platform has no producer for it.** Budget as its own phase (highest new-code volume).

---

## 12. Conversation & Memory Integration

### Current schema

`ChatMessage { role: 'user' | 'ai', content: string, timestamp: number, reasoning?: string, reasoningMs?: number }`
Sessions via `getOrCreateSession(sessionId, userId, topicType, model)`; messages via `saveMessage` / `saveMessagesBatch` / `getMessages`.

### Recommendation: persist transcripts, not audio

| Data | Persist? | Rationale |
|---|---|---|
| Transcript turns | **Yes** | Reuses existing schema; keeps voice and text history unified |
| `voiceSession` metadata — duration, model, voice, interruption count, token usage | **Yes** | Required for cost control and analytics |
| Tool call events | **Yes** | Debuggability and audit |
| **Raw audio** | **No** | Storage cost, privacy exposure, consent burden, minimal product value |

Add a `modality: 'text' | 'voice'` discriminator to messages rather than forking the collection — this keeps chat history, session titles and the sidebar working unchanged.

---

## 13. Interruption / Barge-In Feasibility

**Model side: supported natively** (VAD + voice interruption, per official docs).

**Client side: entirely missing, and this is where perceived quality is won or lost.**

Required, none of which exists:

| Requirement | Status |
|---|---|
| Continuous mic capture during AI speech | **New** — needs `AudioWorklet` |
| Detect interruption signal from session | **New** |
| Stop playback immediately | **New** |
| **Flush the queued audio buffer** | **New** — the classic bug is the model stopping while seconds of buffered audio keep playing |
| Discard in-flight audio frames | **New** |
| Preserve session context after interrupt | Handled by Live |

`speechSynthesis.cancel()` is not a foundation for this — it cancels a browser utterance, not a streamed audio queue.

---

## 14. Multilingual / Hindi / Hinglish Feasibility

**Encouraging, with direct in-platform evidence.**

This platform already produces Hindi and Hinglish content end to end. `services/ai/tts.service.ts` has a dedicated `hinglish` language key mapping to Hindi Chirp 3 HD voices, with documented reasoning that Hindi voices handle embedded English better than English voices handle embedded Devanagari.

Existing reusable assets: language style guides in the podcast prompt layer (Devanagari enforcement, danda punctuation rules, code-mixing ratios).

**Assessment:** Live's native-audio models are multilingual; Hindi should work. **Hinglish code-switching within a single utterance is the genuine risk** and must be tested explicitly rather than assumed — both for recognition and for output naturalness.

---

## 15. Latency Analysis

| Stage | Estimate | Rating |
|---|---|---|
| Mic capture → PCM frame | 10–30 ms | **Excellent** |
| Browser → Live, direct (Option B) | 30–120 ms | **Excellent** |
| Model turn start (native audio) | 300–600 ms | **Acceptable** |
| Audio playback start | 20–50 ms | **Excellent** |
| Backend hop added (Option A) | +60–200 ms round trip | Acceptable but avoidable |
| Voice-tuned retrieval (no rerank, cached embedding) | 800–2,000 ms | **Potential problem** |
| **Existing RAG as a blocking step** | **4,472–7,169 ms (measured)** | **Major problem** |
| **Existing full chat workflow** | **14,459 ms (measured)** | **Unusable for voice** |

### Must NOT run inside a voice turn

- Deep Research
- GraphRAG traversal
- `studentContext.aggregateContext()` (7 parallel Firestore reads)
- Full RAG with Cohere rerank
- Attachment/file parsing

### Should run at session start

- Student context aggregation
- Chapter/topic scope resolution
- System instruction assembly
- Tool declaration registration

---

## 16. Security Analysis

### Existing strengths

- `requireAuth` applied to **all** chat routes via `router.use()`.
- uid taken from the **verified token** (`req.user.uid`), never from body or query — explicitly commented as a deliberate rule.
- Ownership checks with 403 on session access.
- Redis-backed rate limiting; `helmet`; compression disabled only where needed.
- `GOOGLE_APPLICATION_CREDENTIALS` + service account, server-side only.

### New requirements

| Requirement | Detail |
|---|---|
| **Never expose a permanent Gemini key in the browser** | Mint **ephemeral tokens** server-side (1 min to start, 30 min to send) |
| Bind token to identity | Each token tied to the authenticated uid; log issuance |
| Rate-limit token minting | A voice minute costs far more than a text message |
| Concurrent session cap | Per-user limit to prevent abuse |
| **Tool authorization** | Voice-invoked tools must re-verify ownership server-side |
| Mic consent + visible indicator | Explicit permission UX |
| Transcript retention policy | Define before launch |
| No raw audio persistence | Avoids the largest privacy surface entirely |

---

## 17. Cost Analysis

> **Authoritative Live audio per-token rates could not be retrieved from the official pricing page during this session. No figure is stated here.** Live is billed per input and output audio/text token over WebSocket ([source](https://ai.google.dev/gemini-api/docs/live-api)). **Confirm current rates on the official pricing page before budgeting.**

### Cost model (fill `R_in` / `R_out` from official pricing)

```
audio tokens ≈ 25 tokens per second of audio      ← VERIFY against current docs

5-minute session, ~50/50 talk split:
  input  ≈ 150 s × 25 = 3,750 tokens
  output ≈ 150 s × 25 = 3,750 tokens

cost ≈ (3,750 / 1e6 × R_in) + (3,750 / 1e6 × R_out)
       + tool call tokens + RAG cost + Firestore writes
```

Scales linearly: **10 min ≈ 2×**, **30 min ≈ 6×**, **60 min ≈ 12×**.

### Known platform-side costs (from code — estimated, not official)

| Item | Source |
|---|---|
| Google Cloud TTS per character | `costTrackingService` already tracks this |
| Pinecone query + Cohere rerank per retrieval | `retrieval.service.ts` |
| Firestore writes per turn | `chat.repository.ts` |
| Backend compute | Minimal under Option B (token minting only) |
| Audio bandwidth | Browser ↔ Google direct under Option B — **not your egress** |

**Guidance:** voice will be materially more expensive per minute than text. Implement **per-user minute caps before launch**, not after.

---

## 18. Scalability Analysis

| Concurrent sessions | Assessment |
|---|---|
| **10** | Fine under Option B |
| **100** | Backend fine (token minting only); **Gemini quota becomes the constraint** |
| **1,000** | Requires quota planning; Firestore transcript writes need batching |
| **10,000** | Requires provisioned throughput, horizontal scaling, connection budgeting |

### Bottlenecks, ranked

1. **Gemini quota — the real ceiling.** 429s already occur on Dynamic Shared Quota with only a handful of podcast generations. Not raisable per-project.
2. **Single Express instance** — no horizontal scaling configuration found.
3. **RAG / Pinecone** if invoked per turn (avoid by design).
4. **Firestore write throughput** for per-turn transcripts.
5. Under **Option A**, Node audio-proxying would bottleneck before any of the above.

---

## 19. Existing Code Reuse Matrix

| Existing Component | Can Reuse? | Modification Needed | Completely New? |
|---|---|---|---|
| `Chat.tsx` shell / message list | **Yes** | Additive voice-mode surface | — |
| Chat state (`useState`) | Partial | Voice needs a state machine | Yes (`useVoiceSession`) |
| `useWorkflowStream` | **No** | One-directional by nature | Voice transport is new |
| `AIProvider` interface | **No** | Text-only by design | Sibling realtime interface |
| `GeminiProvider` | **No** | — | Live session manager |
| `AIOrchestrator` | Partial | Prompt building reusable | Voice path separate |
| `retrievalService` / `graphRetrievalService` | **Yes** | Wrap as tool + fast path | Tool layer |
| `studentContext.service` | **Yes, as-is** | Call once at session start | — |
| `IntelligenceService` | **Yes** | Heuristic, no I/O — fast | — |
| `requireAuth` / Firebase Admin | **Yes** | — | Token-mint endpoint |
| `chat.repository` / Firestore | **Yes** | Add `modality` + `voiceSession` | — |
| Tool / function calling | — | — | **Entirely new** |
| WebSocket infrastructure | — | — | New (or **none** under Option B) |
| Mic capture / audio playback | — | — | **Entirely new** |
| `tts.service` | **No** | File-based MP3 batch, 24 kHz | Live emits audio itself |
| Web Speech mic + `speechSynthesis` | **No** | Superseded | — |
| Rate limiting / Redis | **Yes** | Add voice-specific limits | — |
| Logging / telemetry (`winston`, `Telemetry`) | **Yes** | Add voice events | — |
| Analytics | **Yes** | Add voice session metrics | — |
| `featureFlags` (`boolEnv`) | **Yes** | Add a voice kill switch | — |

---

## 20. Blockers

### CRITICAL

1. **Live model availability on the current endpoint is unverified.**
   `gemini.provider.ts` L20-25 documents 404 for every model except `gemini-2.5-flash`. Live requires native-audio model IDs. If unavailable, credentials/endpoint/provider must change.
2. **No audio capture or playback infrastructure whatsoever.**
   Zero `getUserMedia` / `AudioContext` / `AudioWorklet` in the repository.
3. **RAG latency 4,472–7,169 ms (measured).**
   Fatal inside a voice turn without the preload + tool redesign.

### HIGH

4. **No tool/function calling exists** — must be built from scratch.
5. **Gemini quota already saturating** — 429 `RESOURCE_EXHAUSTED` on Dynamic Shared Quota, not raisable.
6. **No WebSocket server** — mitigated entirely if Option B is chosen.

### MEDIUM

7. **Chat state is local `useState` in a 1196-line component** — no clean seam for a session lifecycle.
8. **`AIProvider` cannot express audio** — needs a sibling abstraction.
9. **DI `IMemoryProvider` unregistered outside request scope** — affects `aggregateContext`.
10. **Region discrepancy** — `asia-southeast1` in code comment vs `us-central1` in `.env`.

### LOW

11. Model selector misrepresents choice (12 offered, 1 used) — pre-existing.
12. Web Speech API is Chrome/Edge-only — becomes moot.

---

## 21. Risks

| Risk | Severity | Note |
|---|---|---|
| Interruption feels wrong | High | Entirely in unwritten client code; determines perceived quality |
| Hinglish intra-utterance switching degrades | Medium | Unverified; platform's core language mode |
| Cost blowout | High | Mitigate with per-user minute caps before launch |
| Session limits cut lessons short | Medium | 15 min audio-only; ~10 min per connection — needs resumption + compression |
| Voice path diverges from text path | Medium | Two context/tool implementations drifting apart |
| Observability loss under Option B | Medium | Audio never reaches the backend |
| Quota exhaustion under load | High | Already occurring at low volume |

---

## 22. Recommended Architecture

```
                          STUDENT (browser)
                                 │
                      ┌──────────┴───────────┐
                      │  Chat.tsx  (shell)   │
                      └──────────┬───────────┘
                                 │
                 Text mode ──────┴────── Voice mode
                     │                        │
        POST /api/chat/stream          useVoiceSession
           (existing SSE)                     │
                     │        ① GET /api/voice/token ──► backend mints
                     │                        │           ephemeral token
                     │                        │           (uid-bound, short TTL)
                     │                        ▼
                     │        ② WSS ─────────────────► Gemini Live
                     │                        │         (native audio duplex)
                     │                        │
                     │        ③ tool call ──► POST /api/voice/tools/:name
                     │                              (requireAuth)
                     │                                    │
                     ▼                                    ▼
           Firestore transcript              retrievalService · graphRetrieval
           + voiceSession metadata           studentContext · quiz services
```

**Key design decision:** session start injects **preloaded** student context and chapter scope into the Live system instruction, so the common tutoring turn requires **no per-turn RAG at all**.

---

## 23. Proposed Data Flow

```
 1. Student taps Voice
 2. Frontend → GET /api/voice/token  (Firebase ID token in header)
 3. Backend:  verify uid
              → studentContext.aggregateContext(uid)
              → resolve chapter/topic scope (learningTree)
              → build system instruction
              → mint ephemeral token
              → return { token, systemInstruction, voice, toolDeclarations }
 4. Browser opens WSS to Live; sends setup (audio config, tools, instruction)
 5. AudioWorklet streams PCM frames upstream continuously
 6. Live streams audio downstream → client playback queue
 7. Student speaks over the AI → Live signals interruption
       → client STOPS playback AND FLUSHES the queue
       → discards in-flight frames
 8. Model emits a function call
       → POST /api/voice/tools/:name  (server re-verifies ownership)
       → result returned into the live session
 9. Turn transcripts appended to Firestore (modality: 'voice')
10. ~10-min connection limit  → session resumption
    15-min audio limit        → context window compression
11. Session end → persist voiceSession summary + token usage + cost
```

---

## 24. Proposed Implementation Phases

### PHASE 0 — Feasibility spike *(do this before anything else)*

- **Objective:** prove the current credentials can open a Live session with a native-audio model.
- **New files:** one throwaway script (e.g. `backend-firestore/src/scripts/probe_live_api.ts`).
- **Existing reused:** `@google/genai`, service account credentials.
- **Risks:** may fail outright — which invalidates the rest of the plan.
- **Testing:** manual.
- **Acceptance:** an audio round-trip completes, and a documented list of which model IDs resolve on this endpoint.

### PHASE 1 — Voice PoC on an isolated route

- **Objective:** mic → Live → speaker, standalone page, zero chat integration.
- **New:** `useVoiceSession.ts`, `lib/voice/audioCapture.ts`, `lib/voice/audioPlayback.ts`, `public/worklets/pcm-processor.js`, `routes/voice.routes.ts`, `controllers/voice.controller.ts`.
- **Reused:** `requireAuth`, Firebase Admin.
- **Risks:** PCM/sample-rate mismatch; permission UX.
- **Acceptance:** 60-second continuous conversation; p50/p95 turn latency recorded.

### PHASE 2 — Integrate into existing AI Chat

- **Objective:** voice mode inside `Chat.tsx` without disturbing text mode.
- **Files:** `Chat.tsx` (**additive only**), new `components/chat/VoiceSessionPanel.tsx`.
- **Risks:** regressing a 1196-line component.
- **Acceptance:** all existing text-chat behaviour unchanged; voice toggles cleanly.

### PHASE 3 — Real-time interruption

- **Objective:** barge-in with buffer flush.
- **Acceptance:** AI stops within ~200 ms of student speech; **no stale buffered audio plays**.

### PHASE 4 — RAG integration

- **Objective:** grounded answers without dead air.
- **New:** `services/voice/fastRetrieval.service.ts`; RAG exposed as a tool.
- **Reused:** `retrievalService`, `graphRetrievalService`.
- **Acceptance:** p95 tool round-trip < 2 s; filler speech covers the gap; answers cite sources.

### PHASE 5 — Student personalization

- **Objective:** session-start context injection.
- **Reused:** `studentContext.aggregateContext`, `learningTree`.
- **Risks:** DI `IMemoryProvider` scope issue.
- **Acceptance:** AI knows exam, class and weak topics without being told.

### PHASE 6 — Tool calling

- **Objective:** build the tool layer.
- **New:** `services/voice/voiceTools.service.ts` + declarations + per-tool authz.
- **Risks:** highest new-code volume; authorization correctness.
- **Acceptance:** "give me five questions from my weakest physics topic" works end to end.

### PHASE 7 — Conversation persistence

- **Objective:** transcript + `voiceSession` metadata; **no raw audio**.
- **Files:** `chat.repository.ts` (add `modality`, `voiceSession`).
- **Acceptance:** voice conversations appear in history and reload correctly.

### PHASE 8 — Analytics

- **Objective:** duration, interruption count, tool usage, cost per session.
- **Reused:** `Telemetry`, `costTrackingService`, analytics service.

### PHASE 9 — Security hardening

- **Objective:** token rate limits, concurrency caps, tool authz review, consent UI, retention policy.
- **Acceptance:** an authenticated user cannot mint unbounded tokens or invoke another user's data.

### PHASE 10 — Production scalability

- **Objective:** quota planning, session resumption, context compression, load test.
- **Acceptance:** documented behaviour at 10 / 100 concurrent sessions; graceful degradation to text chat.

---

## 25. Future File-Level Change Map

Based on the **actual** repository structure.

```
frontend/src/
  pages/
    Chat.tsx                             MODIFY  (additive voice entry point)
  components/chat/
    VoiceSessionPanel.tsx                NEW
    VoiceOrb.tsx                         NEW     (listening/speaking visual)
    ReasoningTimeline.tsx                UNCHANGED
  hooks/ai/
    useVoiceSession.ts                   NEW     (state machine + transport)
    useWorkflowStream.ts                 UNCHANGED
  lib/voice/
    audioCapture.ts                      NEW     (AudioWorklet + PCM downsample)
    audioPlayback.ts                     NEW     (queue + flush-on-interrupt)
    voiceState.ts                        NEW     (reducer + transitions)
    voiceClient.ts                       NEW     (Live session wrapper)
  lib/
    learningTree.ts                      UNCHANGED (reused for scope)
  public/worklets/
    pcm-processor.js                      NEW

backend-firestore/src/
  routes/
    voice.routes.ts                      NEW
    chat.routes.ts                       UNCHANGED
  controllers/
    voice.controller.ts                  NEW     (ephemeral token minting)
  services/voice/
    liveSession.service.ts               NEW     (instruction + token assembly)
    voiceTools.service.ts                NEW     (tool declarations + dispatch)
    fastRetrieval.service.ts             NEW     (voice-tuned RAG path)
  services/ai/
    ai.provider.interface.ts             UNCHANGED (text-only by design)
    gemini.provider.ts                   UNCHANGED
    tts.service.ts                       UNCHANGED (not used by voice mode)
  services/
    studentContext.service.ts            UNCHANGED (reused as-is)
  repositories/
    chat.repository.ts                   MODIFY  (modality, voiceSession)
  config/
    featureFlags.ts                      MODIFY  (voice kill switch)
  scripts/
    probe_live_api.ts                    NEW     (Phase 0 only, throwaway)
```

---

## 26. Testing Strategy

### Unit tests

- Voice state machine transitions (all 9 states, illegal transitions rejected)
- PCM conversion and resampling correctness
- **Playback queue flush on interrupt** (asserts no residual buffer)
- Ephemeral token minting: uid binding, TTL, rate limit
- Tool dispatch authorization (rejects a mismatched uid)
- Session limit / resumption logic
- Transcript mapping to `ChatMessage`

### Integration tests

- mic → Live → playback round trip
- interrupt mid-response → AI stops → new turn accepted
- tool call → RAG → spoken answer with citations
- session-start context injection reaches the model
- token expiry mid-session → clean resumption
- transcript persisted with `modality: 'voice'`
- voice tool cannot read another user's data

### E2E scenarios

| # | Scenario | Focus |
|---|---|---|
| 1 | Student says "Hello" → AI greets | Baseline round trip |
| 2 | Student speaks **Hindi** | Recognition + native Hindi output |
| 3 | Student speaks **Hinglish** | **Highest language risk** |
| 4 | NCERT question ("Explain photosynthesis per Class 10 NCERT") | RAG via tool, citations |
| 5 | "Quiz me on my weakest topic" | `getWeakTopics` + `generateQuestion` |
| 6 | **AI speaking, student interrupts** | Barge-in + buffer flush |
| 7 | Network disconnect mid-session | Reconnect / graceful error |
| 8 | Live session drops | Resumption, context preserved |
| 9 | Tool call exceeds 3 s | Filler speech, no dead air, timeout |
| 10 | Student ends session | Persistence + cost recorded |
| 11 | 15-minute audio limit reached | Context compression |
| 12 | Same user opens two sessions | Concurrency cap enforced |

---

## 27. Production Readiness Considerations

Required before launch:

- Per-user **minute quota** with hard cutoff
- Cost dashboard per session (extend `costTrackingService`)
- Mic consent flow + visible active-recording indicator
- Transcript retention and deletion policy
- **Graceful degradation to text chat** when Live is unavailable or quota-exhausted
- Session resumption + context compression
- **Feature-flag kill switch** — reuse the existing `featureFlags` / `boolEnv` pattern
- Alerting on 429 rate and session failure rate
- Load test at target concurrency before enabling broadly

---

## 28. Feasibility Scores

| Dimension | Score | Basis |
|---|---|---|
| **Technical feasibility** | **8 / 10** | Live does exactly this; nothing structurally prevents it |
| **Architectural compatibility** | **5 / 10** | No WS, no audio layer, text-only provider interface |
| **Frontend readiness** | **3 / 10** | Zero audio infrastructure; Web Speech only; no state machine |
| **Backend readiness** | **4 / 10** | Auth/Redis/Firestore strong; no WS, no tool layer |
| **Gemini / AI compatibility** | **5 / 10** | SDK present, but endpoint serves 1 non-audio model; 429s already occurring |
| **RAG compatibility** | **3 / 10** | Functional but 4.5–7.2 s measured — unusable per turn as-is |
| **Tool-calling compatibility** | **2 / 10** | Does not exist anywhere |
| **Security readiness** | **6 / 10** | Auth solid; ephemeral tokens + tool authz still to build |
| **Scalability readiness** | **4 / 10** | Quota-bound; single instance |
| **OVERALL FEASIBILITY** | **6 / 10** | |

### Classification: 🟡 **YELLOW**

Implementable, but requires meaningful architectural additions: a client audio layer, a realtime session abstraction separate from `AIProvider`, a tool-calling layer, and a voice-tuned retrieval path. **No permanent blockers were found.**

---

## 29. Final Recommendation

**Adopt Option B (hybrid):** browser ↔ Gemini Live directly, authorised by a backend-minted ephemeral token, with the existing REST/SSE APIs serving RAG, tools and student context.

Rationale:

- Lowest audio latency (no backend hop)
- API key never leaves the server
- **Requires no WebSocket server** — only a token-minting endpoint
- **Zero changes to the existing text chat**
- Reuses the strongest existing assets: `studentContext.service`, `retrievalService`, Firebase auth, Firestore, and the chat shell

Explicitly **do not**:

- Extend `AIProvider` to carry audio — build a sibling `IRealtimeVoiceSession` instead
- Call the current RAG path synchronously inside a voice turn
- Rewrite the existing AI Chat — voice should be additive
- Persist raw audio

**However, the decisive question is unanswered:** can the current Gemini credentials open a Live session with a native-audio model? The platform's own provider code documents that this endpoint 404s every model except `gemini-2.5-flash`. Committing to a phased build before testing that means designing around an API that may not be reachable.

---

## 30. Exact Next Steps

| # | Step | Effort | Gates |
|---|---|---|---|
| 1 | **Probe Live access.** Attempt a Live connect + audio round-trip with the existing `@google/genai` and service account. Record which model IDs resolve. | ½ day | **Everything** |
| 2 | If it fails → choose between standard Vertex AI (non-Express), a separate Gemini Developer API key, or an alternative provider; then re-run this assessment. | 1 day | Architecture |
| 3 | If it succeeds → build the **Phase 1 PoC on an isolated route**; measure real p50/p95 turn latency and interruption responsiveness. | 3–5 days | Phases 2–10 |
| 4 | **In parallel:** measure a voice-tuned retrieval path (no rerank, cached embedding) to establish whether sub-2 s grounding is achievable. | 1–2 days | Phase 4 |
| 5 | Resolve the region discrepancy (`asia-southeast1` in code vs `us-central1` in `.env`). | 1 hour | Quota planning |
| 6 | Only after steps 3 and 4 produce numbers, commit to Phases 2–10. | — | — |

---

## FINAL DECISION

# PROTOTYPE REQUIRED BEFORE IMPLEMENTATION

### Why

The architecture is sound and the reuse story is genuinely strong. `studentContext.service`, `retrievalService`, Firebase auth, Firestore persistence and the chat shell all carry over. Nothing in the codebase blocks this permanently, and Option B avoids the heaviest infrastructure work entirely.

But three things must be **measured, not assumed** — and all three are cheap to test:

1. **Live model availability on this endpoint.** The platform's own code documents that it serves exactly one model and 404s the rest. Unverified, and a negative result invalidates the entire plan.
2. **Interruption quality.** The whole client audio layer is unwritten, and barge-in is where this feature succeeds or fails in the user's perception.
3. **Whether grounded answers can be made fast enough.** Measured RAG is 4,472–7,169 ms against a ~800 ms conversational budget. Preloaded context plus tool-calling *should* solve it — that needs proving, not assuming.

A one-week spike answers all three. Committing to a full build first means designing around unverified API access and an unproven latency budget.

---

## Appendix A — Evidence Index

| Claim | Source |
|---|---|
| No WebSocket anywhere | Repo-wide grep: `socket.io`, `WebSocketServer`, `express-ws`, `from 'ws'`, `require('ws')` → 0 matches |
| No audio capture | Repo-wide grep: `getUserMedia`, `MediaRecorder`, `AudioContext`, `AudioWorklet` → 0 matches |
| No tool calling | Repo-wide grep: `functionDeclarations`, `toolConfig`, `function_call`, `tools:` → 0 hits in backend `src` |
| Mic = Web Speech → textarea | `frontend/src/pages/Chat.tsx` L216-253 |
| Speak = `speechSynthesis` | `frontend/src/pages/Chat.tsx` L373-391 |
| SSE headers | `backend-firestore/src/controllers/chat.controller.ts` L68-78 |
| SSE event writes | `backend-firestore/src/services/chat.service.ts` L123-150 |
| Auth on all chat routes | `backend-firestore/src/routes/chat.routes.ts` |
| Provider interface is text-only | `backend-firestore/src/services/ai/ai.provider.interface.ts` |
| Single supported model / 404s | `backend-firestore/src/services/ai/gemini.provider.ts` L20-25 |
| Orchestrator ignores mode | `backend-firestore/src/services/ai/ai.orchestrator.ts` `getProviderForMode()` |
| Student context aggregation | `backend-firestore/src/services/studentContext.service.ts` L37 |
| TTS is file-based MP3 24 kHz | `backend-firestore/src/services/ai/tts.service.ts` |
| RAG latency 4,472–7,169 ms | Live backend logs, this session (`retrieval_total`) |
| Chat workflow 14,459 ms / TTFT 6,882 ms | Live backend logs, this session |
| 429 on shared quota | Live backend logs (`RESOURCE_EXHAUSTED`) |

## Appendix B — Official Documentation Consulted

- [Gemini Live API overview](https://ai.google.dev/gemini-api/docs/live-api)
- [Live API via raw WebSockets](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)
- [Live API via GenAI SDK](https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk)
- [Live API capabilities guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Live API WebSockets reference](https://ai.google.dev/api/live)
- [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Session management and limits (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session)
- [Live API limits and specifications (Firebase AI Logic)](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs)
- [Live API sessions (Firebase AI Logic)](https://firebase.google.com/docs/ai-logic/live-api/sessions)
- [Multimodal Live reference (Agent Platform)](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/multimodal-live)
- [Native audio in Vertex AI](https://cloud.google.com/blog/topics/developers-practitioners/how-to-use-gemini-live-api-native-audio-in-vertex-ai?hl=en)

*Documentation content was rephrased for compliance with licensing restrictions.*

## Appendix C — Items Not Determined From Codebase

1. Whether the current Vertex Express credentials can open a Live session with a native-audio model.
2. Official current Live API audio per-token pricing (not retrievable in this session).
3. Whether `frontend/src/pages/Research.tsx` implements the "Deep Research" capability (not inspected).
4. Authoritative region in use — code comment and `.env` disagree.
5. Horizontal scaling / deployment topology (no infrastructure-as-code inspected).
6. Whether audio-token-per-second (~25) matches current model behaviour.
