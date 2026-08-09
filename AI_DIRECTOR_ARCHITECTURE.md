# 🎬 AI Director — Cinematic Media Engine Architecture

> **Status:** Design only. No code written. No existing service modified.
> **Scope:** Phase 0 architecture for evolving the podcast pipeline into a
> renderer-agnostic AI media platform.
> **Companion docs:** `PODCAST_ARCHITECTURE_AUDIT_REPORT.md` (current-state audit),
> `PODCAST_AI_STUDIO_PRODUCT_SPECIFICATION.md` (product/UX spec).

---

## Executive Summary

The existing pipeline is sound and stays intact. The AI Director is introduced as a
**new creative decision layer** that slots in *after* `ConversationGenerator` and
*before* audio synthesis.

The single most important architectural decision in this document:

> **The AI Director produces one artifact — the `MasterTimeline` — and produces no media.**
> Every current and future renderer (audio, video, subtitles, avatars, shorts) is a
> *consumer* of that timeline. Adding a renderer never requires touching the Director.

This inverts the current coupling. Today, creative decisions are implicit and scattered
(voice choice lives in `tts.config.json`, pacing lives in the LLM prompt, structure lives
in `PodcastPlan.segments`). After this change, creative intent is **explicit, inspectable,
versioned, and reusable across output formats**.

Three properties make this safe to build:

| Property | How it's achieved |
| --- | --- |
| **Backward compatible** | `MasterTimeline` is optional. Absent → the existing `AudioComposer` path runs unchanged. |
| **Additive** | No existing file is rewritten. New code lives in new directories. `AudioComposer` gains a sibling, not a replacement. |
| **Reversible** | A single feature flag (`AI_DIRECTOR_ENABLED`) returns the system to today's behaviour. |

---

## Table of Contents

1. [Integration Strategy](#1-integration-strategy)
2. [AI Director Architecture](#2-ai-director-architecture)
3. [Service Responsibilities](#3-service-responsibilities)
4. [Folder Structure](#4-folder-structure)
5. [Core Interfaces](#5-core-interfaces)
6. [MasterTimeline Schema](#6-mastertimeline-schema)
7. [Character Schema & Memory](#7-character-schema--memory)
8. [Scene Schema](#8-scene-schema)
9. [Audio Schema](#9-audio-schema)
10. [Music Schema](#10-music-schema)
11. [Ambience Schema](#11-ambience-schema)
12. [Sound Effect Schema](#12-sound-effect-schema)
13. [Visual Metadata Schema](#13-visual-metadata-schema)
14. [Spatial Audio Interfaces](#14-spatial-audio-interfaces)
15. [Future Video Compatibility Report](#15-future-video-compatibility-report)
16. [Migration Strategy](#16-migration-strategy)
17. [Backward Compatibility Strategy](#17-backward-compatibility-strategy)
18. [Risk Assessment](#18-risk-assessment)
19. [Performance Analysis](#19-performance-analysis)
20. [Implementation Roadmap](#20-implementation-roadmap)

---

## 1. Integration Strategy

### 1.1 Where the Director attaches

The existing five-stage pipeline is preserved verbatim. The Director is inserted as a
**sixth stage**, and audio rendering becomes a *consumer* of its output.

```
┌──────────────────── UNCHANGED ────────────────────┐
│ User Request                                      │
│      ↓                                            │
│ SourceResolver          → GroundingBrief          │
│      ↓                                            │
│ PodcastPlanner          → PodcastPlan             │
│      ↓                                            │
│ ConversationGenerator   → GeneratedScript         │
└───────────────────────┬───────────────────────────┘
                        ↓
┌──────────────────── NEW LAYER ────────────────────┐
│              AI DIRECTOR (creative)               │
│                                                   │
│  ScenePlanner ─┐                                  │
│  CharacterPlanner ─┤                              │
│  EmotionPlanner ─┤                                │
│  MusicPlanner ─┼→ TimelineBuilder → MasterTimeline│
│  AmbiencePlanner ─┤                               │
│  SFXPlanner ─┤                                    │
│  PausePlanner ─┤                                  │
│  VisualPlanner ─┘                                 │
│                                                   │
│         ** produces NO media **                   │
└───────────────────────┬───────────────────────────┘
                        ↓
                 MasterTimeline
                        ↓
┌────────────── RENDERERS (consumers) ──────────────┐
│                                                   │
│  AudioRenderer ← built now                        │
│    ├ VoiceSynthesizer  (wraps existing ttsService)│
│    ├ MusicEngine                                  │
│    ├ AmbienceEngine                               │
│    ├ SFXEngine                                    │
│    ├ AudioMixer                                   │
│    └ MasteringChain                               │
│                                                   │
│  SubtitleRenderer ← trivial, Phase 3              │
│  WaveformRenderer ← trivial, Phase 3              │
│  VideoRenderer    ← future, no Director change    │
│  AvatarRenderer   ← future, no Director change    │
│  ShortsRenderer   ← future, no Director change    │
└───────────────────────────────────────────────────┘
```

### 1.2 The one integration point

Only **one** existing function needs a branch — `podcastEngineService.runJob()`, between
the existing SCRIPTING and SYNTHESIZING stages:

```
Stage 2: SCRIPTING  (existing, unchanged)
         ↓
Stage 2.5: DIRECTING   ← NEW, feature-flagged
         if (AI_DIRECTOR_ENABLED) {
           timeline = await aiDirector.direct(script, plan, brief)
           await timelineRepository.save(timeline)
         }
         ↓
Stage 3: SYNTHESIZING  (existing)
         if (timeline) → cinematicAudioRenderer.render(timeline)
         else          → audioComposer.composeChunks(...)   ← today's path
```

`AudioComposer` is **not modified**. `CinematicAudioRenderer` is a new sibling class.
Both satisfy the same output contract (`ComposedChunks`), so the stitch stage,
transcript generation, chapter markers, and every downstream consumer are unaffected.

### 1.3 Why insert after scripting, not during

Three reasons:

1. **Global context.** An emotion *curve* and a music *evolution* can only be planned
   once the full script exists. Per-segment decisions during scripting would produce
   locally-plausible but globally-incoherent pacing — the exact flaw the user identified
   ("do NOT detect emotions sentence by sentence only").
2. **Single LLM call.** One structured call over the whole script is cheaper and more
   coherent than N per-segment calls.
3. **Zero blast radius.** `ConversationGenerator` keeps its current prompt and Zod
   schema. If the Director is disabled, nothing upstream knows it exists.

---

## 2. AI Director Architecture

### 2.1 Composition model

The Director is an **orchestrator of specialist planners**, not a monolithic prompt. Each
planner is independently testable, independently replaceable, and independently
skippable.

```
AIDirector.direct(script, plan, brief) → MasterTimeline

  Step 1  ScenePlanner      script          → SceneSkeleton[]
  Step 2  CharacterPlanner  plan + script   → CharacterCast      (+ memory lookup)
  Step 3  EmotionPlanner    SceneSkeleton[] → EmotionCurve
  Step 4  PausePlanner      script + curve  → PauseDirective[]
  ── steps 5-8 run in parallel; all pure functions over the above ──
  Step 5  MusicPlanner      scenes + curve  → MusicPlan
  Step 6  AmbiencePlanner   scenes          → AmbiencePlan
  Step 7  SFXPlanner        script + scenes → SFXPlan
  Step 8  VisualPlanner     scenes + cast   → VisualPlan
  Step 9  TimelineBuilder   all of the above → MasterTimeline
```

### 2.2 LLM usage budget

Deliberately constrained to keep latency and cost bounded:

| Planner | LLM? | Rationale |
| --- | --- | --- |
| ScenePlanner | ✅ 1 call | Semantic boundary detection needs reasoning |
| CharacterPlanner | ✅ same call | Merged into the scene call — shares context |
| EmotionPlanner | ✅ same call | Merged — the curve depends on scene structure |
| PausePlanner | ❌ | Deterministic rules over emotion + punctuation |
| MusicPlanner | ❌ | Deterministic map: `(mood, energy) → category` |
| AmbiencePlanner | ❌ | Deterministic map: `location → layer stack` |
| SFXPlanner | ❌ | Trigger-word dictionary matched against script text |
| VisualPlanner | ❌ | Template composition from scene fields |
| TimelineBuilder | ❌ | Pure assembly |

**Net cost: one structured LLM call per episode (~3–5s).** Everything else is
deterministic lookup, which also means it's cacheable, unit-testable without mocks, and
incapable of hallucinating an invalid asset reference.

### 2.3 The two-pass timing model

A timeline needs absolute timestamps, but real durations are only known after TTS. This
is resolved with two passes:

```
Pass 1 — PLANNED timeline (before synthesis)
  Every event has estimatedStartMs / estimatedDurationMs
  Derived from word-count heuristics (~2.5 words/sec, language-adjusted)
  Purpose: tells the renderers WHAT to fetch and in what order

Pass 2 — RESOLVED timeline (after synthesis)
  TTS returns real per-line durations (ffprobe, as today)
  TimelineBuilder.resolve(timeline, actualDurations) rewrites all offsets
  Music/ambience/SFX/pause/visual events are re-anchored to real speech
  Purpose: the mix-accurate, render-accurate source of truth
```

Only the **resolved** timeline is persisted as canonical. The planned timeline is a
transient input to synthesis. This is the same pattern the current `AudioComposer`
already uses when it reconstructs linear transcript timings from probed clip
durations — we are generalising an existing, proven idea to all track types.

---

## 3. Service Responsibilities

### 3.1 Director layer (creative — decides, never renders)

| Service | Responsibility | Must NOT |
| --- | --- | --- |
| `AIDirector` | Orchestrate planners, enforce schema, own fallbacks | Touch ffmpeg, TTS, or storage |
| `ScenePlanner` | Detect scene boundaries, location, time, weather, energy, transitions | Assign audio assets |
| `CharacterPlanner` | Resolve cast; reconcile with `CharacterMemory`; assign voice profiles | Call the TTS API |
| `EmotionPlanner` | Produce a global `EmotionCurve` + per-line emotion within allowed range | Set volumes |
| `PausePlanner` | Emit pause/breath/silence/emphasis directives as timeline events | Insert audio silence |
| `MusicPlanner` | Category, intensity, tempo, transition, loop strategy, crossfade per scene | Download tracks |
| `AmbiencePlanner` | Layered environment stacks with per-layer volume/fade/spatial | Download tracks |
| `SFXPlanner` | Trigger-word → effect, timestamp, priority, spatial | Download effects |
| `VisualPlanner` | Image/video/animation prompts, camera, lighting, palette | Generate images |
| `TimelineBuilder` | Assemble + validate + resolve absolute timings | Make creative choices |

### 3.2 Renderer layer (mechanical — renders, never decides)

| Service | Responsibility |
| --- | --- |
| `CinematicAudioRenderer` | Top-level audio consumer of `MasterTimeline` |
| `VoiceSynthesizer` | Thin adapter over the **existing** `ttsService`; applies `VoiceDirection` |
| `MusicEngine` | Resolve `trackId` → cached local file via `AssetLibrary` |
| `AmbienceEngine` | Same, for layered ambience |
| `SFXEngine` | Same, for one-shots |
| `AudioMixer` | Build the ffmpeg `filter_complex` graph: delay, mix, duck, crossfade |
| `MasteringChain` | `loudnorm` (−16 LUFS), limiter (−1 dBTP), optional EQ/compression |
| `AssetLibrary` | GCS-backed catalogue + local disk cache + integrity checks |

**The hard rule:** a renderer that encounters a missing asset **degrades and continues**.
It never fails the episode. A podcast without ambience is acceptable; a failed podcast is
not.

---

## 4. Folder Structure

New directories only. No existing file relocated.

```
backend-firestore/src/
│
├── core/
│   ├── workflow/podcast/                    ← UNCHANGED (existing pipeline)
│   │   ├── SourceResolver.ts
│   │   ├── PodcastPlanner.ts
│   │   ├── ConversationGenerator.ts
│   │   ├── AudioComposer.ts                 ← legacy path, still live
│   │   └── types.ts
│   │
│   └── director/                            ← NEW: creative decision layer
│       ├── AIDirector.ts                    ← orchestrator
│       ├── TimelineBuilder.ts               ← assembly + two-pass resolve
│       ├── planners/
│       │   ├── ScenePlanner.ts
│       │   ├── CharacterPlanner.ts
│       │   ├── EmotionPlanner.ts
│       │   ├── PausePlanner.ts
│       │   ├── MusicPlanner.ts
│       │   ├── AmbiencePlanner.ts
│       │   ├── SFXPlanner.ts
│       │   └── VisualPlanner.ts
│       ├── knowledge/                       ← deterministic domain maps
│       │   ├── emotionProfiles.ts           ← emotion → prosody/voice params
│       │   ├── musicMap.ts                  ← (mood, energy) → category
│       │   ├── ambienceMap.ts               ← location → layer stack
│       │   ├── sfxTriggers.ts               ← trigger word → effectId
│       │   └── visualStyles.ts              ← genre → camera/lighting/palette
│       ├── schema/                          ← zod, single source of truth
│       │   ├── timeline.schema.ts
│       │   ├── character.schema.ts
│       │   ├── scene.schema.ts
│       │   ├── audio.schema.ts
│       │   └── visual.schema.ts
│       └── types.ts
│
├── services/media/                          ← NEW: asset + render layer
│   ├── assets/
│   │   ├── AssetLibrary.ts                  ← GCS catalogue + local cache
│   │   ├── MusicEngine.ts
│   │   ├── AmbienceEngine.ts
│   │   └── SFXEngine.ts
│   ├── render/
│   │   ├── CinematicAudioRenderer.ts        ← sibling of AudioComposer
│   │   ├── VoiceSynthesizer.ts              ← adapter over existing ttsService
│   │   ├── AudioMixer.ts                    ← ffmpeg filter_complex
│   │   └── MasteringChain.ts
│   └── future/                              ← interfaces only, no impl
│       ├── VideoRenderer.interface.ts
│       ├── AvatarRenderer.interface.ts
│       └── SubtitleRenderer.interface.ts
│
└── repositories/
    ├── character.repository.ts               ← NEW: persistent cast memory
    └── timeline.repository.ts                ← NEW: MasterTimeline persistence
```

### 4.1 Asset storage layout (GCS)

```
audio-assets/                                 ← shared, not per-user
├── music/{category}/{trackId}.mp3            ← 60–120s, clean loop points
├── ambience/{environment}/{trackId}.mp3      ← 60s seamless loops
├── sfx/{effectId}.mp3                        ← one-shots, 0.3–3s
├── stingers/{transitionId}.mp3               ← scene-transition hits
└── catalogue.json                            ← manifest: id, duration, loop, licence, tags
```

`catalogue.json` is the contract between the Director's knowledge maps and physical
files. A planner may only emit IDs present in the manifest — validated at Director build
time, which makes an invalid asset reference a **design-time** error rather than a
render-time failure.

---

## 5. Core Interfaces

```typescript
// ── The Director's only public entry point ────────────────────────────────
interface IAIDirector {
  direct(input: DirectorInput): Promise<MasterTimeline>;
}

interface DirectorInput {
  podcastId: string;
  userId: string;
  plan: PodcastPlan;          // existing type, unchanged
  script: GeneratedScript;    // existing type, unchanged
  brief: GroundingBrief;      // existing type, unchanged
  preferences?: DirectorPreferences;
}

interface DirectorPreferences {
  cinematicIntensity?: 'subtle' | 'balanced' | 'dramatic';  // default 'balanced'
  enableMusic?: boolean;
  enableAmbience?: boolean;
  enableSFX?: boolean;
  targetLoudnessLufs?: number;   // default -16
  spatialAudio?: boolean;        // reserved; ignored in v1
}

// ── Every planner shares one shape ────────────────────────────────────────
interface IPlanner<TIn, TOut> {
  readonly name: string;
  plan(input: TIn): Promise<TOut>;
  /** Deterministic degraded output. Planners must never throw. */
  fallback(input: TIn): TOut;
}

// ── Every renderer shares one shape ───────────────────────────────────────
interface ITimelineRenderer<TOutput> {
  readonly name: string;
  readonly requiredTracks: TrackKind[];
  canRender(timeline: MasterTimeline): boolean;
  render(timeline: MasterTimeline, ctx: RenderContext): Promise<TOutput>;
}

interface RenderContext {
  podcastId: string;
  userId: string;
  tempDir: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;          // cooperative cancellation, as today
}

// ── Asset resolution ──────────────────────────────────────────────────────
interface IAssetLibrary {
  resolve(kind: AssetKind, id: string): Promise<ResolvedAsset | null>;
  has(kind: AssetKind, id: string): boolean;      // sync manifest check
  validateManifest(ids: AssetRef[]): AssetRef[];  // returns missing refs
}

type AssetKind = 'music' | 'ambience' | 'sfx' | 'stinger';

interface ResolvedAsset {
  id: string;
  localPath: string;
  durationMs: number;
  loopable: boolean;
  loopStartMs?: number;
  loopEndMs?: number;
  licence: string;
}
```

---

## 6. MasterTimeline Schema

The central artifact. **Track-based**, not audio-specific — this is what makes video
support a pure addition later.

```typescript
interface MasterTimeline {
  // ── Identity & versioning ──
  id: string;
  podcastId: string;
  userId: string;
  schemaVersion: 2;                   // v1 reserved for the legacy implicit model
  phase: 'planned' | 'resolved';      // see two-pass timing model
  createdAt: number;
  resolvedAt?: number;

  // ── Global creative context ──
  meta: TimelineMeta;
  cast: CharacterCast;
  emotionCurve: EmotionCurve;
  scenes: Scene[];

  // ── Tracks: the render surface ──
  tracks: {
    voice: VoiceTrack;
    music: MusicTrack;
    ambience: AmbienceTrack;
    sfx: SFXTrack;
    pause: PauseTrack;
    visual: VisualTrack;            // populated now, consumed later
  };

  // ── Output contract ──
  mastering: MasteringSpec;
  totalDurationMs: number;
  /** Refs the AssetLibrary could not resolve. Render degrades, does not fail. */
  degradedAssets?: AssetRef[];
}

interface TimelineMeta {
  title: string;
  language: string;
  genre: MediaGenre;
  narrativeStyle: NarrativeStyle;
  cinematicIntensity: 'subtle' | 'balanced' | 'dramatic';
  estimatedMinutes: number;
}

type MediaGenre =
  | 'educational' | 'documentary' | 'storytelling' | 'interview'
  | 'debate' | 'news' | 'meditation' | 'drama';

type NarrativeStyle =
  | 'linear' | 'problem_solution' | 'chronological'
  | 'question_driven' | 'story_arc' | 'compare_contrast';

// ── Generic event: every track is a list of these ──
interface TimelineEvent {
  id: string;
  kind: TrackKind;
  startMs: number;                 // absolute, from timeline zero
  durationMs: number;
  sceneId: string;
  /** Higher wins when the mixer must resolve overlap. */
  priority: number;
  spatial?: SpatialSpec;           // designed now, ignored in v1
}

type TrackKind = 'voice' | 'music' | 'ambience' | 'sfx' | 'pause' | 'visual';
```

### 6.1 Why a track model rather than a scene tree

A scene tree ("scene contains its audio") is intuitive but breaks for anything that
**crosses** scene boundaries — a music bed that crossfades across a transition, an
ambience layer that persists while the narrator moves rooms, a stinger that overlaps two
scenes. Tracks with absolute timestamps and explicit `sceneId` back-references handle
those natively, which is precisely how NLE and DAW timelines are modelled.

---

## 7. Character Schema & Memory

```typescript
interface Character {
  // ── Identity ──
  id: string;                       // stable: `char_{slug}_{hash}`
  displayName: string;
  role: string;                     // Teacher | Student | Narrator | King | ...

  // ── Demographics (drive voice selection) ──
  gender: 'male' | 'female' | 'neutral';
  ageBand: 'child' | 'teen' | 'young_adult' | 'adult' | 'elderly';
  estimatedAge?: number;
  accent: string;                   // 'indian_english' | 'neutral' | 'british' | ...
  language: string;

  // ── Voice binding ──
  voice: VoiceProfile;

  // ── Personality (drives emotion range + delivery) ──
  personality: PersonalityProfile;
  defaultEmotion: Emotion;
  allowedEmotions: Emotion[];       // EmotionPlanner may not exceed this set

  // ── Future rendering ──
  avatar?: AvatarMetadata;

  // ── Memory bookkeeping ──
  createdAt: number;
  lastUsedAt: number;
  episodeCount: number;
}

interface VoiceProfile {
  provider: 'google' | 'elevenlabs' | 'gemini';
  voiceId: string;                  // provider-native id
  baseSpeakingRate: number;         // 0.8–1.25
  basePitch: number;                // semitones, -4..+4
  baseEnergy: number;               // 0..1
  /** ElevenLabs-specific expressiveness knobs. */
  stability?: number;
  similarityBoost?: number;
  styleExaggeration?: number;
  /** Whether the bound voice can accept prosody at all (Chirp 3 HD cannot). */
  supportsProsody: boolean;
}

interface PersonalityProfile {
  warmth: number;         // 0..1
  authority: number;      // 0..1
  energy: number;         // 0..1
  humour: number;         // 0..1
  formality: number;      // 0..1
  speakingStyle: 'conversational' | 'lecturing' | 'storytelling'
               | 'interviewing' | 'dramatic' | 'calm';
  verbalTics?: string[];  // future: "you know", "right?"
}

interface AvatarMetadata {
  appearancePrompt: string;    // for future image/video generation
  outfitPrompt?: string;
  referenceImageUrl?: string;  // for character consistency across scenes
  lipSyncModel?: string;
}

interface CharacterCast {
  characters: Character[];
  narratorId?: string;
  primarySpeakerId: string;
}
```

### 7.1 Memory strategy — the consistency guarantee

Firestore: `users/{userId}/characters/{characterId}`

Resolution order when `CharacterPlanner` encounters a speaker:

```
1. Exact match on (displayName + role)         → reuse; bump lastUsedAt
2. Fuzzy match on role + gender + ageBand      → reuse voice, update name
3. No match                                    → create; assign from VoiceRegistry
4. Persist the cast on the timeline itself
```

Step 4 is the durability guarantee: even if the memory document is later deleted or
mutated, **re-rendering an old episode reproduces the original voices**, because the
timeline embeds a full snapshot of the cast. Memory is an optimisation for cross-episode
consistency, never a render dependency.

### 7.2 Voice registry — deterministic assignment

```typescript
type VoiceKey = `${Gender}_${AgeBand}_${VoiceCharacter}`;
// e.g. 'female_adult_warm', 'male_elderly_authoritative', 'female_child_curious'

const VOICE_REGISTRY: Record<VoiceKey, VoiceProfile[]>;
```

Multiple profiles per key, chosen round-robin by character-ID hash so two adult female
characters in one episode never collide on the same voice. This directly addresses the
current defect where `Host` and `Student` both resolve to Sarah
(`EXAVITQu4vr4xnSDxMaL`) and are therefore indistinguishable.

---

## 8. Scene Schema

```typescript
interface Scene {
  id: string;
  index: number;
  title: string;

  // ── Narrative position ──
  chapterIndex: number;             // maps to existing PodcastPlan.segments
  lineRange: { startLine: number; endLine: number };

  // ── Setting ──
  setting: SceneSetting;

  // ── Mood ──
  dominantEmotion: Emotion;
  energyLevel: number;              // 0..1
  tensionLevel: number;             // 0..1 — drives music intensity

  // ── Timing ──
  estimatedDurationMs: number;
  startMs: number;                  // resolved in pass 2
  endMs: number;

  // ── Transitions ──
  transitionIn: SceneTransition;
  transitionOut: SceneTransition;

  // ── Future rendering (populated now, unused now) ──
  visual: SceneVisualMetadata;
}

interface SceneSetting {
  location: LocationId;             // 'classroom' | 'ancient_rome' | 'space' | ...
  locationDescription: string;      // free text → future image prompt
  timeOfDay: 'dawn' | 'morning' | 'midday' | 'afternoon'
           | 'evening' | 'night' | 'neutral';
  environment: 'indoor' | 'outdoor' | 'abstract' | 'space';
  weather?: 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind';
  era?: string;                     // 'ancient' | 'medieval' | 'modern' | 'future'
  crowdDensity?: 'empty' | 'sparse' | 'moderate' | 'crowded';
}

interface SceneTransition {
  style: 'cut' | 'crossfade' | 'fade_through_silence'
       | 'stinger' | 'whoosh' | 'musical_resolve';
  durationMs: number;
  stingerAssetId?: string;
}
```

`LocationId` is a closed union validated against `ambienceMap.ts`, so a planner cannot
invent a location with no ambience stack behind it.

---

## 9. Audio Schema

### 9.1 Voice track

```typescript
interface VoiceTrack { events: VoiceEvent[]; }

interface VoiceEvent extends TimelineEvent {
  kind: 'voice';
  lineIndex: number;                // ← joins back to GeneratedScript.lines
  characterId: string;
  text: string;
  emotion: Emotion;
  delivery: DeliveryDirection;
  /** Filled by VoiceSynthesizer after TTS. */
  audio?: { storagePath: string; localPath?: string; actualDurationMs: number };
}

interface DeliveryDirection {
  emotion: Emotion;
  intensity: number;                // 0..1 — how strongly to express it
  speakingRate: number;             // absolute, post-modulation
  pitch: number;                    // semitones
  volumeDb: number;
  emphasisWords?: string[];         // future SSML / expressive-TTS
  whisper?: boolean;
  breathBefore?: boolean;
  /** Set when the bound voice rejects prosody — mixer compensates instead. */
  prosodyUnsupported?: boolean;
}
```

### 9.2 Emotion model

```typescript
type Emotion =
  | 'neutral'  | 'happy'    | 'sad'      | 'fear'    | 'excited'
  | 'calm'     | 'hope'     | 'angry'    | 'curious' | 'suspense'
  | 'mystery'  | 'romantic' | 'heroic'   | 'victory' | 'failure'
  | 'wonder'   | 'surprise';

interface EmotionCurve {
  /** Coarse arc across the episode — the "shape" of the listen. */
  keyframes: EmotionKeyframe[];
  arcType: 'rising' | 'falling' | 'arc' | 'wave' | 'steady' | 'twist';
}

interface EmotionKeyframe {
  atProgress: number;               // 0..1 through the episode
  emotion: Emotion;
  intensity: number;                // 0..1
  sceneId: string;
}

/** Deterministic emotion → delivery mapping. Lives in knowledge/emotionProfiles.ts */
interface EmotionProfile {
  emotion: Emotion;
  rateMultiplier: number;           // × character base rate
  pitchOffset: number;              // semitones
  volumeOffsetDb: number;
  pauseAfterMs: number;
  elevenLabsStyle: number;          // 0..1 expressiveness
  elevenLabsStability: number;      // low = more variable
  musicIntensityBias: number;       // -1..+1 nudge to scene music
}
```

The curve is authored **globally** by `EmotionPlanner`, then each line's emotion is
selected as a local deviation constrained by `Character.allowedEmotions`. This satisfies
the requirement that lines "reference the global emotional progression" rather than being
classified in isolation — and it prevents a Student character from suddenly delivering a
`heroic` line.

### 9.3 Pause track

Pauses become first-class events rather than hardcoded silence.

```typescript
interface PauseTrack { events: PauseEvent[]; }

interface PauseEvent extends TimelineEvent {
  kind: 'pause';
  pauseType: 'breath' | 'beat' | 'dramatic' | 'suspense'
           | 'scene_gap' | 'emphasis' | 'comprehension';
  /** Whether music/ambience continue through the silence. */
  holdBackground: boolean;
}
```

`comprehension` pauses are an education-specific type: a deliberate beat after a dense
definition. This is the kind of decision that belongs to a Director and cannot emerge
from a TTS engine.

### 9.4 Mastering spec

```typescript
interface MasteringSpec {
  targetLufs: number;               // -16 (podcast standard)
  truePeakDb: number;               // -1.0
  voiceBusGainDb: number;
  duckingDb: number;                // how far background drops under speech (-12)
  duckAttackMs: number;             // 150
  duckReleaseMs: number;            // 400
  compression?: { threshold: number; ratio: number };
  eq?: { highPassHz?: number; presenceBoostDb?: number };
  fadeInMs: number;
  fadeOutMs: number;
}
```

**Ducking is sidechain-driven**, keyed off the voice bus — not static volume automation.
This is what keeps the narrator intelligible without manual per-scene tuning, and it is
the single highest-impact item in the whole mixing chain.

---

## 10. Music Schema

```typescript
interface MusicTrack { events: MusicEvent[]; }

interface MusicEvent extends TimelineEvent {
  kind: 'music';
  assetId: string;
  category: MusicCategory;
  role: 'intro' | 'bed' | 'transition' | 'accent' | 'outro';

  // ── Evolution controls ──
  intensity: number;                // 0..1 → picks a stem/variant
  tempo: 'slow' | 'moderate' | 'upbeat' | 'driving';
  volumeDb: number;                 // pre-duck, typically -14..-20

  // ── Continuity ──
  loopStrategy: 'none' | 'seamless' | 'crossfade_self';
  fadeInMs: number;
  fadeOutMs: number;
  crossfadeToNextMs: number;        // > 0 ⇒ never a hard stop
  transitionType: 'cut' | 'crossfade' | 'resolve' | 'swell' | 'drop';
}

type MusicCategory =
  | 'documentary' | 'adventure' | 'epic'        | 'sad'
  | 'mystery'     | 'horror'    | 'fantasy'     | 'science'
  | 'educational' | 'meditation'| 'victory'     | 'inspirational'
  | 'historical'  | 'calm_piano'| 'strings'     | 'ambient_synth'
  | 'space'       | 'nature';
```

### 10.1 Soundtrack evolution

`MusicPlanner` walks scenes in order and maintains continuity state, so the score
*evolves* instead of restarting per scene:

```
For each scene:
  category  = musicMap[(dominantEmotion, genre)]
  intensity = clamp(tensionLevel + emotionProfile.musicIntensityBias)

  if category == previous.category:
      → continue the same asset, automate intensity   (no restart)
  else:
      → crossfade previous → new over transitionOut.durationMs
```

Invariant: **`crossfadeToNextMs > 0` for every non-final music event.** Enforced in
`TimelineBuilder` validation, which structurally guarantees the "never stop abruptly"
requirement rather than leaving it to the mixer.

---

## 11. Ambience Schema

Layered, not single-track — this is what produces a believable environment.

```typescript
interface AmbienceTrack { events: AmbienceEvent[]; }

interface AmbienceEvent extends TimelineEvent {
  kind: 'ambience';
  /** Stack of simultaneous layers forming one environment. */
  layers: AmbienceLayer[];
  environmentId: LocationId;
}

interface AmbienceLayer {
  assetId: string;
  layerRole: 'base' | 'texture' | 'detail' | 'accent';
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  loopBehavior: 'seamless' | 'crossfade' | 'random_offset';
  /** Randomise loop start so repetition isn't perceptible. */
  jitterMs?: number;
  spatial?: SpatialSpec;
}
```

Example stack for `ancient_rome` from `ambienceMap.ts`:

| Layer | Asset | Role | Volume |
| --- | --- | --- | --- |
| 1 | `wind_soft` | base | −26 dB |
| 2 | `marketplace_crowd` | texture | −22 dB |
| 3 | `horse_cart_distant` | detail | −28 dB |
| 4 | `temple_bell` | accent | −24 dB |
| 5 | `birds_mediterranean` | detail | −30 dB |

`random_offset` + `jitterMs` is the mechanism that prevents the "obvious loop" artefact
called out in the requirements — each layer restarts at a different random point, so the
composite never repeats audibly.

---

## 12. Sound Effect Schema

```typescript
interface SFXTrack { events: SFXEvent[]; }

interface SFXEvent extends TimelineEvent {
  kind: 'sfx';
  assetId: string;
  effectCategory: SFXCategory;

  // ── Synchronisation ──
  triggerWord?: string;             // the word that caused this cue
  triggerLineIndex?: number;
  syncMode: 'on_word' | 'after_line' | 'before_line' | 'absolute';
  /** Negative = fire slightly early, which reads as more natural. */
  offsetMs: number;

  // ── Mix ──
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** When cues collide, lower priority is dropped. */
  priority: number;
  spatial?: SpatialSpec;
}

type SFXCategory =
  | 'door' | 'footsteps' | 'typing' | 'phone'    | 'explosion'
  | 'animal'| 'weapon'   | 'weather'| 'glass'    | 'vehicle'
  | 'fire' | 'body'      | 'time'   | 'crowd'    | 'water'
  | 'wind' | 'paper'     | 'bell'   | 'magic'    | 'ui';
```

### 12.1 Word-level synchronisation

The requirement is to sync effects to spoken words. Full word-level timing needs forced
alignment, which we do not have today. The design therefore uses a **three-tier accuracy
ladder** so the feature ships now and improves later without a schema change:

| Tier | Method | Accuracy | Available |
| --- | --- | --- | --- |
| 1 | Proportional estimate: `lineStart + (wordIndex / wordCount) × lineDuration` | ±300 ms | **Now** |
| 2 | TTS timepoints (Google SSML `<mark>`) | ±50 ms | When on a prosody-capable voice |
| 3 | Forced alignment (Whisper/Gentle) | ±20 ms | Future |

`syncMode` and `offsetMs` are unchanged across tiers — only the resolver improves. Tier 1
is honest about its limits: cues bias slightly early (`offsetMs` negative), because a
sound landing just before its word reads as intentional, whereas landing late reads as a
bug.

---

## 13. Visual Metadata Schema

Populated from day one, consumed by nothing yet. **This is the core of the extensibility
claim** — the expensive part of video generation is deciding *what to show*, and that
decision is made here, for free, alongdside the audio.

```typescript
interface VisualTrack { events: VisualEvent[]; }

interface VisualEvent extends TimelineEvent {
  kind: 'visual';
  visualType: 'establishing_shot' | 'character_shot' | 'detail_shot'
            | 'diagram' | 'text_overlay' | 'transition';
  sceneVisual: SceneVisualMetadata;
  characterId?: string;             // for avatar/lip-sync targeting
}

interface SceneVisualMetadata {
  // ── Generation prompts ──
  imagePrompt: string;              // still frame
  videoPrompt: string;              // motion clip (Veo)
  animationPrompt?: string;         // 2D/educational animation

  // ── Cinematography ──
  cameraAngle: 'eye_level' | 'low' | 'high' | 'birds_eye'
             | 'close_up' | 'medium' | 'wide' | 'extreme_wide';
  cameraMovement: 'static' | 'pan_left' | 'pan_right' | 'zoom_in'
                | 'zoom_out' | 'dolly' | 'orbit' | 'handheld';
  focalLength?: '24mm' | '35mm' | '50mm' | '85mm' | '135mm';
  depthOfField?: 'shallow' | 'medium' | 'deep';

  // ── Look ──
  lighting: 'natural' | 'golden_hour' | 'blue_hour' | 'harsh'
          | 'soft' | 'dramatic' | 'low_key' | 'high_key' | 'neon';
  visualStyle: 'photorealistic' | 'cinematic' | 'documentary'
             | 'illustration' | 'anime' | '3d_render' | 'watercolour';
  colorPalette: { primary: string; secondary: string; accent: string; mood: string };

  // ── Editing ──
  transitionType: 'cut' | 'dissolve' | 'fade_black' | 'wipe'
                | 'zoom_blur' | 'match_cut';
  aspectRatioHint?: '16:9' | '9:16' | '1:1';   // shorts vs long-form
}
```

The `aspectRatioHint` is what lets a future Shorts renderer reuse the *same* timeline —
it selects `9:16` visual events and the highest-`priority` 60 seconds of the emotion
curve, with no Director involvement.

---

## 14. Spatial Audio Interfaces

**Designed only. Not implemented. Ignored by the v1 mixer.**

```typescript
interface SpatialSpec {
  pan: number;                      // -1 (L) .. 0 (C) .. +1 (R)
  distance: number;                 // 0 (close) .. 1 (far)
  elevation?: number;               // -1 .. +1
  movement?: SpatialMovement;
  reverb?: ReverbSpec;
}

interface SpatialMovement {
  fromPan: number; toPan: number;
  fromDistance: number; toDistance: number;
  durationMs: number;
  easing: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
}

interface ReverbSpec {
  roomSize: 'tiny' | 'small' | 'medium' | 'large' | 'hall' | 'cathedral' | 'outdoor';
  wetLevel: number;                 // 0..1
  decayMs: number;
  earlyReflectionsMs?: number;
  environment?: LocationId;         // derive an impulse response from the scene
}
```

Every `TimelineEvent` already carries `spatial?: SpatialSpec`. The v1 mixer discards it.
When binaural rendering is added, no schema migration is required — timelines authored
today simply have `undefined`, which the future mixer treats as centre/dry.

---

## 15. Future Video Compatibility Report

### 15.1 What already works

| Requirement | Provided by | Ready? |
| --- | --- | --- |
| Scene list with timings | `scenes[].startMs/endMs` | ✅ |
| Image generation prompts | `SceneVisualMetadata.imagePrompt` | ✅ |
| Video generation prompts | `SceneVisualMetadata.videoPrompt` | ✅ |
| Camera direction | `cameraAngle` / `cameraMovement` / `focalLength` | ✅ |
| Lighting & palette | `lighting` / `colorPalette` | ✅ |
| Shot transitions | `transitionType` | ✅ |
| Character appearance | `Character.avatar.appearancePrompt` | ✅ |
| Character consistency | `avatar.referenceImageUrl` | ✅ |
| Lip-sync timing | `VoiceEvent.startMs/durationMs` + `characterId` | ✅ |
| Subtitles | `VoiceEvent.text` + timings | ✅ |
| Shorts extraction | `emotionCurve` + `priority` + `aspectRatioHint` | ✅ |

### 15.2 What a VideoRenderer would add

Purely additive — no Director or schema change:

```
VideoRenderer.render(timeline):
  1. for each scene → generate still from imagePrompt          (Imagen/Gemini)
  2. for high-priority scenes → generate clip from videoPrompt (Veo)
  3. for each character → generate avatar from appearancePrompt
  4. drive lip-sync from VoiceEvent timings
  5. assemble with ffmpeg using transitionType
  6. burn subtitles from VoiceEvent.text
  7. mux the AudioRenderer's mastered output
```

### 15.3 The compatibility guarantee

Because the timeline is **track-based with absolute timestamps**, adding a renderer means
adding a *consumer* of existing data. The Director's contract is
`script → creative decisions`; it has no knowledge of, and no dependency on, output
format. That is the structural property that makes the "no major redesign" requirement
achievable rather than aspirational.

---

## 16. Migration Strategy

Five stages, each independently shippable and independently revertible.

### Stage 0 — Shadow mode (no user impact)
- Build Director + schemas.
- Run it after scripting, persist the timeline, **render nothing from it**.
- Existing `AudioComposer` continues to produce every podcast.
- **Value:** validate timeline quality against real scripts at zero risk.
- **Exit criteria:** ≥95% of episodes produce a schema-valid timeline; manual review of 20 timelines reads as sensible direction.

### Stage 1 — Music + ducking only
- `CinematicAudioRenderer` consumes only `tracks.music` and `tracks.voice`.
- Ambience/SFX/visual planners still populate the timeline but are not rendered.
- Enable for internal users via `AI_DIRECTOR_ENABLED` + `CINEMATIC_TRACKS=music`.
- **Value:** ~80% of the perceived production-quality jump (intro/outro, bed, ducking, mastering) for ~25% of the work.
- **Exit criteria:** A/B preference vs legacy; no regression in generation success rate.

### Stage 2 — Ambience + transitions
- Add layered ambience and scene crossfades.
- `CINEMATIC_TRACKS=music,ambience`.

### Stage 3 — SFX + pause direction
- Add tier-1 word-sync SFX and `PauseTrack` rendering.
- `CINEMATIC_TRACKS=music,ambience,sfx,pause`.

### Stage 4 — Emotion-aware voices
- Route emotional lines to ElevenLabs (expressive), keep neutral lines on Chirp 3 HD (cheap, high quality).
- Highest cost-risk stage; gate on per-user quota. See §18.

### Stage 5 — Legacy retirement (optional)
- Only once Stage 1–4 have run at 100% for 30 days.
- `AudioComposer` may then be marked deprecated. **Not deleted** — old episodes may need re-rendering on the legacy path.

---

## 17. Backward Compatibility Strategy

### 17.1 Guarantees

| Guarantee | Mechanism |
| --- | --- |
| Existing episodes keep playing | Nothing about stored audio/transcript changes |
| Existing API contracts unchanged | `CinematicAudioRenderer` returns the same `ComposedChunks` shape |
| Transcript/chapters unchanged | Derived from `tracks.voice`, which mirrors `script.lines` 1:1 via `lineIndex` |
| Frontend needs no change to work | New UI reads optional fields; absent ⇒ current behaviour |
| Instant rollback | `AI_DIRECTOR_ENABLED=false` |
| Partial rollback | `CINEMATIC_TRACKS` subsets which tracks render |
| Old jobs mid-flight survive deploy | Timeline is optional on the job checkpoint |

### 17.2 The critical invariant

```
tracks.voice.events[i].lineIndex === script.lines[i] (1:1, order-preserving)
```

Enforced by `TimelineBuilder` validation. This is what keeps `TranscriptSegment[]`,
`PodcastChapter[]`, click-to-seek, the transcript panel, and the existing
`podcastAssets.service` (quiz/flashcards/mindmap) all working untouched. The Director may
add events to *other* tracks freely, but it may never add, drop, reorder, or reword a
voice line.

### 17.3 Firestore compatibility

- Timelines live in a **new** collection (`podcast_timelines/{podcastId}`), not inside `podcasts`. Keeps documents under the 1 MB limit and avoids the nested-array constraint that already forced `scriptComplete` to be a boolean rather than the script itself.
- `PodcastMetadata` gains exactly one optional field: `timelineId?: string`.
- Characters live under `users/{userId}/characters/{id}` — a new subcollection, no impact on existing reads.

---

## 18. Risk Assessment

| # | Risk | Sev | Prob | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Asset licensing** — music/SFX require clear commercial rights | High | Med | Curate from CC0 only (Freesound CC0, Pixabay). Record `licence` per asset in `catalogue.json`. Consider generating beds with Lyria 2 on Vertex for full ownership. Legal review before Stage 1 ships publicly. |
| 2 | **ElevenLabs cost explosion** at Stage 4 | High | Med | Hybrid routing: neutral lines → Google (cheap), emotional lines → ElevenLabs. Per-user monthly cap reusing the existing `costTrackingService`. Cap distinct emotional variants per episode. |
| 3 | **ffmpeg `filter_complex` fragility** — a 6-track graph is hard to debug | Med | High | Build incrementally per migration stage. Emit the generated filtergraph to logs. Golden-file tests on a fixed timeline. Fall back to plain concatenation on mixer error. |
| 4 | **Generation latency growth** | Med | Med | Director adds ~4s (one LLM call). Asset fetch is parallel + cached. Mixing adds ~10–20s on MediaWorker. Budget: +30s on a 3–5 min job. Mitigate by starting asset prefetch concurrently with TTS. |
| 5 | **LLM emits invalid enums/asset ids** | Med | Med | Zod validation + `AssetLibrary.validateManifest()`. Any unknown value coerces to a safe default (`neutral`, `educational`, `cut`). Planners implement `fallback()` and never throw. |
| 6 | **Music drowning narration** | High | Low | Sidechain ducking (not static gain) + `loudnorm` on the voice bus + a hard invariant that `music.volumeDb ≤ voiceBusGainDb + duckingDb`. Validated in `TimelineBuilder`. |
| 7 | **Audible ambience looping** | Low | Med | `random_offset` + `jitterMs` per layer; ≥60s source loops; multiple assets per environment. |
| 8 | **Timeline document size** | Low | Med | Separate collection. A 30-min episode ≈ 400 lines × ~6 events ≈ 2400 events ≈ 400 KB JSON. If it approaches 1 MB, store the timeline in GCS and keep only a pointer in Firestore (same pattern as `transcriptPath`). |
| 9 | **Character voice drift across episodes** | Med | Low | Cast snapshot embedded in the timeline (§7.1) — memory is an optimisation, never a render dependency. |
| 10 | **Storage/bandwidth for the asset library** | Low | Low | ~60 assets × 2 MB ≈ 120 MB total, shared across all users, cached on the worker. Negligible. |
| 11 | **Redis/Upstash quota** — the audit notes the 500k daily limit is already hit sometimes | Med | Med | Do **not** add new queues. Reuse `media-jobs` for the render step. Director runs in-process during the existing `podcast.generate` job. |
| 12 | **Chirp 3 HD cannot do prosody** — undermines emotion at Stage 4 | Med | High | Already modelled: `VoiceProfile.supportsProsody` + `DeliveryDirection.prosodyUnsupported`. Mixer applies gain/pacing compensation; router prefers ElevenLabs for high-intensity lines. |

---

## 19. Performance Analysis

### 19.1 Latency budget (10-minute episode, ~400 lines)

| Stage | Today | With Director | Δ |
| --- | --- | --- | --- |
| SourceResolver | ~1s | ~1s | — |
| PodcastPlanner | ~6s | ~6s | — |
| ConversationGenerator | ~45s | ~45s | — |
| **AI Director** | — | **~4s** | **+4s** |
| Asset prefetch | — | **~0s** (parallel w/ TTS) | 0 |
| TTS synthesis | ~90s | ~90s | — |
| Stitch / **Mix** | ~8s | **~25s** | **+17s** |
| Mastering | — | **~5s** | **+5s** |
| Upload | ~5s | ~6s | +1s |
| **Total** | **~155s** | **~182s** | **+27s (+17%)** |

A 17% latency increase for a categorical quality change is a good trade. The job is
already async with live progress streaming, so the user experience cost is a slightly
longer progress bar, not a blocking wait.

### 19.2 Optimisations designed in

| Technique | Where |
| --- | --- |
| **Parallel planners** | Steps 5–8 are pure functions over steps 1–4 → `Promise.all` |
| **Single LLM call** | Scene + character + emotion merged into one structured call |
| **Deterministic planners** | Music/ambience/SFX/visual are map lookups — microseconds, no network |
| **Asset prefetch during TTS** | Assets are known from the *planned* timeline, before synthesis finishes |
| **Persistent asset cache** | Static files on the worker's local disk; cache key = `assetId` |
| **Reuse existing TTS parallelism** | `VoiceSynthesizer` keeps the current batch-of-10 concurrency |
| **Mix on MediaWorker** | ffmpeg stays off the API process — the existing queue split already handles this |
| **Two-pass timing** | Avoids re-planning after synthesis; pass 2 is arithmetic only |

### 19.3 Cost per episode (10 min, estimated)

| Item | Today | With Director |
| --- | --- | --- |
| LLM (plan + script) | ~$0.02 | ~$0.02 |
| LLM (Director) | — | ~$0.01 |
| TTS (Google Chirp 3 HD) | ~$0.19 | ~$0.19 |
| TTS (ElevenLabs, Stage 4 partial) | — | ~$0.00–0.40 |
| Assets | — | $0 (static, amortised) |
| Compute (ffmpeg) | negligible | negligible |
| **Total** | **~$0.21** | **~$0.22** (Stages 1–3) / **~$0.62** (Stage 4 heavy) |

Stages 1–3 are effectively free. **Stage 4 is the only cost-significant decision** and is
therefore gated separately behind its own flag and quota.

---

## 20. Implementation Roadmap

### Phase A — Foundations (3–4 days) · *no behaviour change*
1. `core/director/types.ts` + all Zod schemas
2. `knowledge/` maps: emotion profiles, music map, ambience map, SFX triggers, visual styles
3. `AssetLibrary` + `catalogue.json` format + manifest validator
4. Curate and upload ~40 CC0 assets (15 music, 15 ambience, 10 SFX)
5. `timeline.repository.ts`, `character.repository.ts`

### Phase B — Director (4–5 days) · *shadow mode*
6. `ScenePlanner` + `CharacterPlanner` + `EmotionPlanner` (the one merged LLM call)
7. `PausePlanner`, `MusicPlanner`, `AmbiencePlanner`, `SFXPlanner`, `VisualPlanner`
8. `TimelineBuilder` — assembly, validation, invariants, two-pass resolve
9. `AIDirector` orchestrator + per-planner fallbacks
10. Wire into `runJob()` behind `AI_DIRECTOR_ENABLED`, persist only
11. **Gate:** review 20 real timelines before proceeding

### Phase C — Audio renderer, music only (3–4 days) · *Stage 1 ships*
12. `VoiceSynthesizer` adapter over existing `ttsService`
13. `MusicEngine` + `AudioMixer` (voice + music + sidechain duck)
14. `MasteringChain` (`loudnorm`, limiter, fades)
15. `CinematicAudioRenderer` returning `ComposedChunks`
16. Branch in the synthesis stage; golden-file mixer tests
17. **Gate:** internal A/B vs legacy

### Phase D — Ambience & SFX (3–4 days) · *Stages 2–3*
18. `AmbienceEngine` with layered stacks + jittered loops
19. `SFXEngine` with tier-1 proportional word sync
20. Scene transition crossfades + `PauseTrack` rendering

### Phase E — Frontend (2–3 days)
21. Scene / emotion / speaker indicators on the transcript panel
22. Music + ambience "now playing" indicator
23. Waveform from the timeline
24. Optional: timeline inspector for debugging direction quality

### Phase F — Emotion-aware voices (2–3 days) · *Stage 4, separately gated*
25. `VoiceRegistry` with gender/age/character keys
26. Hybrid provider routing + per-user cost caps

### Phase G — Future-proofing (1–2 days) · *interfaces only*
27. `VideoRenderer.interface.ts`, `AvatarRenderer.interface.ts`, `SubtitleRenderer.interface.ts`
28. `SubtitleRenderer` implementation (trivial, immediate value: VTT/SRT export)

**Total: ~18–25 days.** Phases A–C (~11 days) deliver the bulk of the perceptual
improvement; D–G are incremental.

---

## Appendix A — Decision Log

| Decision | Alternative rejected | Why |
| --- | --- | --- |
| Director after scripting | Direction during scripting | Needs whole-script context for a coherent emotion curve |
| Track-based timeline | Scene-nested audio | Cross-scene music/ambience/stingers are first-class, not special cases |
| One LLM call, rest deterministic | An LLM per planner | 8× cost/latency, and non-determinism where none is needed |
| New sibling renderer | Modify `AudioComposer` | Zero regression risk on the live path |
| Cast snapshot on timeline | Memory lookup at render time | Re-renders must be reproducible |
| Separate timeline collection | Embed in `podcasts` doc | 1 MB limit + the known nested-array constraint |
| Spatial designed, not built | Build binaural now | No demand yet; interfaces cost nothing and prevent migration later |
| Visual metadata populated now | Add it when video ships | The expensive decision is *what to show*; capture it while context is hot |

## Appendix B — Feature Flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `AI_DIRECTOR_ENABLED` | `false` | Master switch — run the Director at all |
| `AI_DIRECTOR_SHADOW_MODE` | `true` | Persist timelines but render via the legacy path |
| `CINEMATIC_TRACKS` | `''` | CSV subset: `music,ambience,sfx,pause` |
| `CINEMATIC_INTENSITY` | `balanced` | `subtle` \| `balanced` \| `dramatic` |
| `EMOTION_VOICES_ENABLED` | `false` | Stage 4 — expressive-TTS routing (cost gate) |
| `TARGET_LUFS` | `-16` | Mastering loudness target |

## Appendix C — Open Questions for Review

1. **Asset sourcing** — curate CC0 manually, licence a commercial pack, or generate beds with Lyria 2 on Vertex? Affects Phase A duration and the §18.1 legal risk.
2. **Stage 4 budget** — what monthly ElevenLabs ceiling per user is acceptable? Determines how aggressively emotional routing can be applied.
3. **Language coverage** — do Hindi/Hinglish episodes need distinct music/ambience palettes, or is the library culture-neutral for v1?
4. **Re-render policy** — should existing episodes be offered a "remaster with the new engine" action, or is the Director new-episodes-only?
5. **Intensity default** — is `balanced` right for an educational product, or should `subtle` be the default so audio never competes with comprehension?
