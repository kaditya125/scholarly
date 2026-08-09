# CinematicAudioRenderer Architecture

## Overview

The CinematicAudioRenderer transforms a resolved `MasterTimeline` into final podcast audio with cinematic music, atmospheric ambience, precisely-timed sound effects, and intelligible narration through automatic ducking.

**Core principle:** The Director describes WHAT audio should exist; the Renderer determines HOW to create it.

## Architecture

```
MasterTimeline
      ↓
CinematicAudioRenderer (orchestrator)
      ├──→ VoiceEngine        (TTS synthesis + emotion routing)
      ├──→ MusicEngine         (music cue resolution + looping)
      ├──→ AmbienceEngine      (layered environments + looping)
      ├──→ SFXEngine           (discrete effects + precise timing)
      └──→ AudioMixer          (multi-track mixing + ducking + mastering)
             ↓
        Final MP3
```

## Components

### 1. CinematicAudioRenderer (Orchestrator)

**Responsibility:** Coordinate all engines, manage asset resolution, drive render pipeline, provide progress callbacks, implement graceful degradation.

**Interface:**
```typescript
interface RenderOptions {
  timeline: MasterTimeline;
  tempDir: string;
  onProgress?: (stage: string, done: number, total: number) => void;
}

interface RenderResult {
  audioPath: string;
  durationMs: number;
  stats: RenderStats;
  warnings: string[];
  degraded: AssetRef[];
}

interface RenderStats {
  voiceCues: number;
  musicCues: number;
  ambienceLayers: number;
  sfxCues: number;
  synthesisTimeMs: number;
  mixTimeMs: number;
  totalTimeMs: number;
}
```

**Pipeline stages:**
1. Asset pre-warming (parallel with TTS when possible)
2. Voice synthesis (VoiceEngine)
3. Music cue preparation (MusicEngine)
4. Ambience layer preparation (AmbienceEngine)
5. SFX placement preparation (SFXEngine)
6. Multi-track mixing (AudioMixer)
7. Mastering + normalization
8. Cleanup

### 2. VoiceEngine

**Responsibility:** Synthesize voice events with emotion routing and prosody control.

**Already exists:** Current TTS synthesis happens in `AudioComposer`. This engine wraps existing synthesis with emotion-aware routing.

**Key additions:**
- Read `VoiceEvent.delivery` for emotion/intensity/rate/pitch
- Route to appropriate TTS provider (Chirp 3 HD for natural emotion, Journey for prosody control)
- Handle `prosodyUnsupported` flag gracefully
- Maintain compatibility with existing `ttsService` voice mapping

**Output:** Synthesized MP3 segments with precise duration measurements.

### 3. MusicEngine

**Already implemented:** `backend-firestore/src/services/media/assets/MusicEngine.ts`

**Provides:**
- Resolves `MusicEvent.assetId` to local files via `AssetLibrary`
- Calculates loop counts for beds shorter than scene duration
- Computes fade/crossfade geometry
- Graceful degradation (skips unresolved cues)

**Output:** `MusicCue[]` with resolved local paths + render geometry.

### 4. AmbienceEngine (NEW)

**Responsibility:** Resolve ambience events to playable layers with continuous looping.

**Parallel to MusicEngine but handles:**
- Multi-layer stacks (1 event = 1-8 simultaneous layers)
- Continuous looping with random offset jitter (prevents audible repetition)
- Layer role balancing (base/texture/detail/accent)
- Per-layer fade timing

**Interface:**
```typescript
interface AmbienceCue {
  eventId: string;
  environmentId: string;
  layers: AmbienceLayerCue[];
  startMs: number;
  durationMs: number;
}

interface AmbienceLayerCue {
  layerId: string;
  assetId: string;
  localPath: string;
  layerRole: AmbienceLayerRole;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  loopBehavior: AmbienceLoopBehavior;
  jitterMs: number;
  assetDurationMs: number;
  loopCount: number;
}
```

**Output:** `AmbienceCue[]` with all layers resolved and ready for mixer.

### 5. SFXEngine (NEW)

**Responsibility:** Resolve discrete sound effects with precise timing.

**Handles:**
- Single-shot placement (no looping)
- Sync modes (on_word, after_line, before_line, absolute)
- Timing offsets (typically negative for deliberate feel)
- Short fades (quick in, fast out)

**Interface:**
```typescript
interface SFXCue {
  eventId: string;
  assetId: string;
  localPath: string;
  effectCategory: SFXCategory;
  startMs: number;
  durationMs: number;
  assetDurationMs: number;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  triggerWord?: string;
  triggerLineIndex?: number;
}
```

**Output:** `SFXCue[]` with resolved local paths + precise timing.

### 6. AudioMixer (NEW)

**Responsibility:** Combine voice/music/ambience/sfx tracks into final podcast audio.

**Core features:**

#### a. Multi-track Layout
```
Voice Bus     ━━━━━━━ (TTS segments stitched)
Music Bus     ━━━━━━━ (cues with fades/crossfades)
Ambience Bus  ━━━━━━━ (layered environments)
SFX Bus       ━━━━━━━ (discrete effects)
```

#### b. Sidechain Ducking
- Voice bus triggers automatic gain reduction on music/ambience/sfx
- Attack: 150ms (fast enough to catch syllables)
- Release: 400ms (smooth recovery)
- Depth: -12dB default (configurable via `MasteringSpec.duckingDb`)
- **Result:** Narration remains intelligible without manual automation

#### c. Volume Balancing
- Voice: 0dB (reference level)
- Music: -16dB (underscore, not feature)
- Ambience: -24dB (textural, never distracting)
- SFX: -10dB (present but not jarring)
- All pre-duck levels — actual mix depends on voice activity

#### d. Crossfades
- Music-to-music: overlapping crossfades (configured per cue)
- Scene transitions: smooth ambience layer swaps
- Prevents abrupt cuts

#### e. Mastering
- EBU R128 loudness normalization (target: -16 LUFS)
- True peak limiting (-1dBTP)
- Optional compression (threshold/ratio from `MasteringSpec`)
- Optional EQ (high-pass, presence boost)
- Fade in/out (intro/outro)

**Implementation approach:**
Use `ffmpeg-complex-filter` to build a single ffmpeg command with:
- Multiple inputs (voice segments, music cues, ambience layers, sfx)
- Filter graph for:
  - Per-track volume adjustment
  - Crossfades (via `acrossfade` filter)
  - Sidechain compression (via `sidechaincompress` filter)
  - EQ/compression (via `equalizer`, `compand`)
  - Loudness normalization (via `loudnorm` two-pass)
- Single output pass

**Why one command?**
- Avoids intermediate file I/O
- Preserves audio quality (no repeated encode/decode)
- Enables true sidechain (requires simultaneous bus access)
- Faster for short podcasts (<20min)

**Alternative for long-form (>30min):**
- Render buses separately
- Combine with Audacity macros or sox
- Trade setup complexity for memory efficiency

**MVP uses single-command approach** — sufficient for 5-20min educational podcasts.

## Degradation Strategy

**Philosophy:** A podcast without music is acceptable; a failed podcast is not.

**Implementation:**
1. Every engine returns `{ cues, skipped }` where `skipped` lists unresolved assets
2. Mixer accepts partial inputs (e.g., music=[], ambience=[...], sfx=[...])
3. Final `RenderResult.degraded` lists all dropped assets
4. `RenderResult.warnings` explains what was skipped and why

**User-facing behavior:**
- Shadow mode logs degradation details
- Inspector shows "asset pending" status
- Final podcast plays with reduced richness but ALWAYS plays

## Feature Flag Integration

**Environment variable:**
```
CINEMATIC_AUDIO_ENABLED=false
```

**Integration point:** `podcastEngine.service.ts`

**Shadow mode behavior (CINEMATIC_AUDIO_ENABLED=false):**
- Existing `AudioComposer` runs as today
- `CinematicAudioRenderer` runs in parallel
- Timeline + render stats logged but NOT served to user
- Allows A/B comparison without risk

**Active mode (CINEMATIC_AUDIO_ENABLED=true):**
- `CinematicAudioRenderer` replaces `AudioComposer`
- Final audio served to user

## Performance Targets

**5-minute educational podcast:**
- TTS synthesis: ~30-60s (provider-dependent)
- Asset resolution: ~2-5s (cache warm)
- Mixing: ~10-20s (ffmpeg single-pass)
- **Total:** <90s (comparable to current pipeline)

**Cost estimate (with generated assets):**
- TTS: $0.50-1.50 (existing cost, unchanged)
- Music generation: $0.06/cue (one-time, amortized)
- Ambience: $0.06/layer (one-time, amortized)
- SFX: $0.06/effect (one-time, amortized)
- **Marginal cost per podcast:** $0 (assumes pre-built library)

## Testing Strategy

**Unit tests:**
- `AmbienceEngine.test.ts` — layer resolution, looping, jitter
- `SFXEngine.test.ts` — timing calculation, sync modes
- `AudioMixer.test.ts` — filter graph construction (not rendering)

**Integration tests:**
- `CinematicAudioRenderer.test.ts` — synthetic timeline → audio file
- Validates:
  - All engines coordinate correctly
  - Degradation works (missing assets)
  - Output file exists and has expected duration
  - Stats reporting accurate

**Synthetic validation:**
- Use existing 20 synthetic topics
- Render with `--dry-run` (no actual ffmpeg execution)
- Validate filter graph construction
- Measure planning time

**Real validation (requires environment):**
- Generate MVP asset library (30 clips)
- Render 5 real timelines
- Listen for quality assessment:
  - Music underscore appropriate?
  - Ambience enhances or distracts?
  - SFX timing feels deliberate?
  - Voice remains intelligible?
  - No clipping/distortion?

## Files to Create

1. **Engines:**
   - `src/services/media/rendering/AmbienceEngine.ts`
   - `src/services/media/rendering/SFXEngine.ts`
   - `src/services/media/rendering/VoiceEngine.ts`

2. **Mixer:**
   - `src/services/media/rendering/AudioMixer.ts`
   - `src/services/media/rendering/filterGraph.ts` (ffmpeg filter builder)

3. **Orchestrator:**
   - `src/services/media/rendering/CinematicAudioRenderer.ts`

4. **Tests:**
   - `tests/unit/rendering/AmbienceEngine.test.ts`
   - `tests/unit/rendering/SFXEngine.test.ts`
   - `tests/unit/rendering/AudioMixer.test.ts`
   - `tests/unit/rendering/CinematicAudioRenderer.test.ts`

5. **Integration:**
   - Update `src/services/podcast/podcastEngine.service.ts` (feature flag)
   - Barrel: `src/services/media/rendering/index.ts`

## Files to Modify

1. **Existing MusicEngine:** Already complete, no changes needed
2. **Timeline schemas:** Already complete, no changes needed  
3. **Asset providers:** Already complete, no changes needed
4. **Feature flag:** Add to `.env.example`, read in config

## Success Criteria

**Phase E Part 2 is complete when:**
1. ✅ All engines implemented and unit tested
2. ✅ AudioMixer produces valid filter graphs
3. ✅ CinematicAudioRenderer orchestrates full pipeline
4. ✅ Feature flag integration working
5. ✅ Synthetic timeline rendering succeeds (dry-run)
6. ✅ All tests pass
7. ✅ TypeScript compiles clean
8. ✅ Documentation complete

**Production-ready when (future validation):**
1. MVP asset library generated and validated
2. 5+ real timelines rendered and quality-approved
3. A/B testing confirms user value
4. Cost/performance acceptable at scale

## Next Steps After Part 2

1. **Asset Library Generation:** Execute `npm run generate:assets -- --execute`
2. **Real Timeline Validation:** Render 5 stored podcasts, listen critically
3. **Quality Tuning:** Adjust ducking depth, music volume, ambience balance
4. **Provider Optimization:** Based on listening tests, consider swapping Lyria for licensed library
5. **Production Rollout:** Enable feature flag for subset of users, monitor metrics

## Design Decisions

**Why NOT use an audio library (Tone.js, Howler)?**
- They're for browser playback, not server-side rendering
- ffmpeg is already deployed and battle-tested
- Single-command approach is simplest for short-form

**Why sidechain compression vs. manual automation?**
- Manual requires per-podcast tuning
- Sidechain adapts to actual speech patterns
- Works across different voice speeds/pauses

**Why one mixer vs. separate voice/music renderers?**
- Sidechain requires simultaneous bus access
- Crossfades need overlapping audio
- Mastering must see complete mix
- ffmpeg filter graph handles this natively

**Why graceful degradation vs. fail-fast?**
- User experience > technical purity
- Asset availability may be inconsistent during rollout
- Shadow mode needs to tolerate missing library

**Why provider abstraction at direction time?**
- Changing audio providers requires no timeline migration
- A/B testing different sources is configuration, not code
- Future video renderer can reference same asset IDs

---

**Status:** Architecture design complete. Ready for implementation.
