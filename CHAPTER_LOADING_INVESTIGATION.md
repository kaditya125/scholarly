# Scholarly Chapter Reader — "Stuck on Preparing your learning experience…" Investigation

**Audience:** Kiro (so it can verify + extend the fix)
**Author:** Buffy
**Phases:** 1 (frontend-only timeouts + error handlers) ✓ shipped, 2 (stuck-monitor + broadened retry + esc-hatch) ✓ shipped, 3 (validator pipeline) pending
**Status:** Phase 2 verified clean; user has action steps below to confirm in their browser.

> TL;DR — The Phase 1 fix shipped correct logic in isolation, but its auto-retry trigger explicitly excluded the long-running mid-pipeline statuses (`PROCESSING`, `GENERATING_ARTICLE`, …). When the backend genuinely stalled at one of those steps, the reader UI had **no escape path** — no Force Retry fired, the user stared at a spinner forever, and (with `DISABLE_WORKERS=true` in `.env`) the admin watchdog cron was also disabled so the backend couldn't self-recover either. Phase 2 fixes all three layers.

---

## 1. Reproduction (so anyone reading this can confirm)

Symptom (from the user): clicking a chapter lands on the reader view but the left pane stays on the spinner reading "Preparing your learning experience…". The mode toggles in the top-right work, so the PDF pane is fine. The artefact that fails to mount is `DocumentaryChapter` from `frontend/src/services/chapterDocumentaryService.ts`.

Two failure modes were reproducible from the code (no live browser repro possible — user signs in via Google Auth):

| Failure | Phase 1 status | Phase 2 status |
|---|---|---|
| Firestore `onSnapshot` never fires (permission denied / WebChannel auth failure / deleted source) | ✓ fixed: error callback + deleted-doc `else` branch set `sourceStatus = 'FAILED'` | unchanged |
| Firestore `getDocs(where type=DOCUMENTARY_ARTICLE + orderBy createdAt desc)` hangs or misses the composite index | ✓ fixed: 12s `Promise.race` timeout, `finally { clearTimeout }` so no dead-timer leak; upgraded catch to log the real reason and tag `FAILED_PRECONDITION` as a likely Firestore-index smell | unchanged |
| PDF fetch hangs | ✓ fixed: `AbortController` + 25s timeout with explicit user-facing timeout message | unchanged |
| Source status legitimately enters mid-pipeline (`PROCESSING` / `CHUNKING` / `EMBEDDING` / `INDEXING` / `BUILDING_KNOWLEDGE_GRAPH` / `GENERATING_GRAPH` / `GENERATING_ARTICLE` / … `GENERATING_PODCAST` / `INDEXING_CONTENT`) and the Firebase art icle generation stalls indefinitely | ✗ **MISSED** — previous auto-retry condition was `QUEUED || READY_DEGRADED || FAILED` only, with a `hasTriggeredGenRef.current` one-shot guard. If the backend genuinely hangs at one of the mid-pipeline statuses, no escape. | ✓ fixed — see Phase 2 below |
| Server-side watchdog swallows the source | ✗ **MISSED** — Phase 1 relied implicitly on `failStuckSources` (BullMQ) to flip truly stuck sources to `FAILED`, but the user's `.env` has `DISABLE_WORKERS=true` which short-circuits the worker dispatch (see `server.ts`). The watchdog never ran. | ✓ partly fixed — see Phase 2 `source.service.ts` heartbeat. **Active self-healing will resume when workers are re-enabled.** |

The first three rows are Phase-1 victories, durable. Rows 4 & 5 are what Phase 2 attacks.

---

## 2. Root causes (ranked, with evidence)

### RC1 — Auto-retry trigger excluded every long-running mid-pipeline status  ⚠ HIGH

**File:** `frontend/src/components/reader/ChapterReader.tsx`, line ~329 (pre-Phase-2):

```ts
} else if (
  sourceStatus !== '' &&
  (sourceStatus === 'QUEUED' || sourceStatus === 'READY_DEGRADED' || sourceStatus === 'FAILED')
) {
  if (!hasTriggeredGenRef.current && notebookId && sourceId) {
    hasTriggeredGenRef.current = true;
    api.post(`/documents/books/${notebookId}/chapters/${sourceId}/generate`).catch(console.error);
  }
}
```

**Why it's wrong:** the trigger condition needed to include every ProcessingStatus value the reader might see mid-flight — exactly the values the condition intentionally excluded (so it wouldn't spawn duplicate jobs when one was already running). The compromise "don't fire while generating" became "don't fire when genuinely stuck in a generation step", which is precisely the user-visible failure mode.

The `hasTriggeredGenRef.current` one-shot guard compounded the problem: once the first POST fired, no subsequent snapshot tick ever fired another, even if the pipeline went silent for minutes.

**Evidence reviewed (from `backend-firestore/src/types/notebook.ts`):** every ProcessingStatus value is a real pipeline step:
```
NOT_STARTED | QUEUED | PENDING | UPLOADING | PROCESSING | OCR | EXTRACTING | EXTRACTING_PDF |
CHUNKING | EMBEDDING | INDEXING | BUILDING_KNOWLEDGE_GRAPH | GENERATING_GRAPH |
GENERATING_ARTICLE | GENERATING_STUDY_MODE | GENERATING_REVISION_MODE | GENERATING_EXAM_MODE |
GENERATING_FLASHCARDS | GENERATING_PODCAST | INDEXING_CONTENT |
READY | READY_DEGRADED | FAILED | COMPLETED
```

Any value in the left column (~20 statuses) is a "we're still working on it" state — and any of them can stall.

### RC2 — DISABLE_WORKERS also disabled the admin watchdog cron  ⚠ HIGH (deferred, partly)

**File:** `backend-firestore/src/server.ts` (from earlier session boot):
```
⚠️  Workers disabled (DISABLE_WORKERS=true). Redis queue polling skipped.
```

This short-circuits `server.ts:154` *before* `BackgroundWorker / NotificationWorker / MediaWorker` constructors run. **All BullMQ-orchestrated jobs are paused**, including the cron that calls `sourceService.failStuckSources(...)`.

That means a backend-side stuck source has **no self-healing** — only client-side recovery via POST `/generate` can break the loop.

### RC3 — Article cache never invalidated on terminal transitions  ⚠ MEDIUM

**File:** `frontend/src/services/chapterDocumentaryService.ts`:

`CACHE` is populated only on successful article fetch and never cleared. So when the user hits Force Retry and the backend produces a *new* `DOCUMENTARY_ARTICLE` doc with different content, the reader keeps serving the stale pre-retry copy out of the CACHE. Looks like nothing changed → user concludes the retry didn't work.

### RC4 — Stale `lastHeartbeatAt` in `asyncGenerateAssets`  ⚠ MEDIUM (insurance)

**File:** `backend-firestore/src/services/source.service.ts`:

The main pipeline `processFileBackground` writes `lastHeartbeatAt` every 30s. `asyncGenerateAssets` (the path client-initiated retries take) **did not** — so when `failStuckSources` *does* eventually run, it couldn't tell an in-flight retry apart from a truly hung one, and would force-flip to `FAILED`. Feed-forward: this hunted non-stuck jobs.

---

## 3. Phase 2 fix — what shipped (4 files, ~120 lines, typecheck-green, reviewer "ship-ready")

### 3.1 `ChapterReader.tsx` — broadened trigger + stuck-since + cache invalidation

Three changes, each in its own useEffect so the sourceStatus dep chain stays clean:

(a) **Retry trigger — broadened + rate-limited (60s)**

```ts
// Replaces the one-shot hasTriggeredGenRef.current. Tracks the last
// POST /generate timestamp; allows up to one per minute per page load.
const lastRetryAtRef = useRef<number>(0);
…
} else if (
  sourceStatus !== '' &&
  sourceStatus !== 'READY' && sourceStatus !== 'COMPLETED'
) {
  if (notebookId && sourceId) {
    const now = Date.now();
    if (now - lastRetryAtRef.current > 60_000) {
      lastRetryAtRef.current = now;
      api.post(`/documents/books/${notebookId}/chapters/${sourceId}/generate`).catch(console.error);
    }
  }
}
```

Now fires for every `{QUEUED, PENDING, UPLOADING, PROCESSING, OCR, EXTRACTING, EXTRACTING_PDF, CHUNKING, EMBEDDING, INDEXING, BUILDING_KNOWLEDGE_GRAPH, GENERATING_GRAPH, GENERATING_ARTICLE, GENERATING_STUDY_MODE, GENERATING_REVISION_MODE, GENERATING_EXAM_MODE, GENERATING_FLASHCARDS, GENERATING_PODCAST, INDEXING_CONTENT, READY_DEGRADED, FAILED}` → i.e. every non-READY/non-COMPLETED state. The 60s `lastRetryAtRef` rate limit keeps the user from spamming the backend if status re-emits every few seconds.

(b) **stuckSinceMs tracker**

A new useEffect watches `sourceStatus`. Sets `stuckSinceMs = Date.now()` on every transition INTO an in-progress status (resets the timer when the pipeline makes forward progress, so the warning only surfaces when genuinely stalled), and clears it to `null` on every transition INTO a terminal status. `PreparingChapter` reads `stuckSinceMs` to escalate its UI.

(c) **Article cache invalidation on terminal transition**

```ts
useEffect(() => {
  if (sourceStatus !== '' && ['READY', 'READY_DEGRADED', 'COMPLETED'].includes(sourceStatus)) {
    clearArticleCache(makeArticleCacheKey(notebookId, sourceId, subject, chapterTitle));
  }
}, [sourceStatus, notebookId, sourceId, subject, chapterTitle]);
```

Force Retry now actually shows the new article, not the cached one.

### 3.2 `chapterDocumentaryService.ts` — exported cache helpers

Two new exports thread the cache through to the reader:

```ts
export function makeArticleCacheKey(notebookId?, sourceId?, subject?, chapterTitle?): string {…}
export function clearArticleCache(key: string): void {…}
```

`getDocumentaryChapter` now uses the helper internally so the writer and the lookup can't disagree on key composition.

### 3.3 `PreparingChapter.tsx` — escalation UI + escape hatch

New props `stuckSinceMs?: number | null` and `onOpenPdf?: () => void`. Two pieces of UI:

- A 5-second `setInterval` ticker that re-renders the panel only while `stuckSinceMs` is set (cheap — the panel is the only thing mounted while `docChapter` is null).
- When `elapsedMs > 60_000`:
  - **Yellow warning chip** above the hero with the stalled status name as `<code>`
  - Hero icon tints amber, header reads "Stuck while preparing…"
  - **Primary-amber "Force Retry now"** button (was tertiary border)
  - **`Open NCERT PDF instead`** button — switches the reader's `mode` state to `'ncert'`, which hides the article column and renders the right-side NCERT PDF pane at `w-full` (no auth cookie gymnastics, no extra API calls).

### 3.4 `source.service.ts` — heartbeat + insurance comment inside `asyncGenerateAssets`

```ts
const heartbeat = setInterval(() => {
  sourceRepository.updateSource(notebookId, sourceId, { lastHeartbeatAt: Date.now() })
    .catch(() => undefined);
}, 30_000);
try {
  await this.updateStatus(notebookId, sourceId, 'EXTRACTING_PDF');
  …
} finally {
  clearInterval(heartbeat);
}
```

When `DISABLE_WORKERS=true` is removed and the watchdog cron resumes, this guarantees a genuinely in-flight retry won't get false-flipped to `FAILED`.

---

## 4. Verification steps the user should run in the browser

Hard-reload the reader tab — Vite HMR sometimes keeps stale modules across edits. Either of these works:

- **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
- **DevTools** open → right-click reload button → "Empty Cache and Hard Reload"

Then re-open the chapter that was stuck. Three new behaviours to look for:

1. **Within 1 second of opening**, PreparingChapter should already show "Preparing your learning experience…" — Phase 1 still working.
2. **After ~60 seconds** of no forward progress, the panel should escalate: yellow warning chip appears with `code GENERATING_ARTICLE` (or whatever the stalled step is), the Force Retry button becomes a prominent amber CTA, and a secondary "Open NCERT PDF instead" button appears.
3. **Click `Open NCERT PDF instead`** — the article column disappears, the PDF stream becomes full-screen.

Open DevTools → Console. Healthy runs log nothing new; logged warnings are exactly the ones with actionable messages:

- `[ChapterReader] status snapshot failed … — treating as FAILED so the retry path engages:` → Firestore security rule miss (the user is in but the rule didn't accept)
- `[chapterDocumentaryService] documentary article fetch failed for notebook=… — likely a missing Firestore composite index on assets (type ASC, createdAt DESC)` → composite index not deployed; run `firebase deploy --only firestore:indexes` and try again
- `[ChapterReader] source doc … not found — treating as FAILED` → admin moderation deleted the source

---

## 5. Three loose ends Phase 3 should chase (separate PR)

- **Distinct `STATUS_UNAVAILABLE` terminal state** instead of overloading `FAILED` for permanent errors that are not retry-eligible (e.g., real Firestore-rule denials). Lets the reader hide the Force Retry CTA when it'd just hit the same denial.
- **Composable heartbeat helper in `source.service.ts`**: `processFileBackground` and `asyncGenerateAssets` now both have the same 4-line `setInterval + try/finally`. Extracting `_startHeartbeat(notebookId, sourceId): () => void` would dedupe and make the pattern impossible to forget on future sibling methods (e.g., Phase A repair flows).
- **Unit tests for the retry trigger condition + cache helpers** — the broadened trigger condition is 1-line but easy to regress; the cache-helper pair needs at least a "key collision across subjects" test.

---

## 6. Files touched (Phase 1 + Phase 2)

```
frontend/src/components/reader/ChapterReader.tsx        — added (b)+(c), updated retry trigger
frontend/src/components/reader/PreparingChapter.tsx     — added stuckSinceMs UI + onOpenPdf esc-hatch
frontend/src/services/chapterDocumentaryService.ts     — exported makeArticleCacheKey + clearArticleCache
backend-firestore/src/services/source.service.ts       — heartbeat in asyncGenerateAssets
```

Phase 1 also touched (no further changes):
```
admin-dashboard/.../... (none)
backend-firestore/... (env, queue workers — separate Redis/HELLO storm that was unrelated)
```
