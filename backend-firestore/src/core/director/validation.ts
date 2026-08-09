/**
 * MasterTimeline validation.
 *
 * Two layers, deliberately separated:
 *
 *   1. SHAPE   — Zod (`MasterTimelineSchema.safeParse`). Types and ranges.
 *   2. SEMANTIC — the invariants below, which Zod cannot express because they
 *                 are cross-field or cross-collection.
 *
 * The invariants are not stylistic preferences. Each one prevents a specific
 * production failure documented in AI_DIRECTOR_ARCHITECTURE.md:
 *
 *   - VOICE_LINE_MAPPING  → protects transcript/chapters/click-to-seek (§17.2)
 *   - MUSIC_NO_HARD_STOP  → "never stop abruptly" (§10.1)
 *   - MUSIC_DUCK_HEADROOM → narrator always intelligible (§18 risk 6)
 *   - CAST_REFS           → no orphan characterId in a voice event
 *   - SCENE_REFS          → no orphan sceneId in any event
 *
 * Severity split: `errors` block a render; `warnings` are advisory and surface
 * in the Timeline Inspector (Phase D).
 */

import {
  MasterTimelineSchema,
  type MasterTimeline,
} from './schema/timeline.schema';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ValidationCode =
  | 'SHAPE_INVALID'
  | 'VOICE_LINE_MAPPING'
  | 'VOICE_EMPTY'
  | 'MUSIC_NO_HARD_STOP'
  | 'MUSIC_DUCK_HEADROOM'
  | 'CAST_REFS'
  | 'CAST_PRIMARY_MISSING'
  | 'SCENE_REFS'
  | 'SCENE_ORDER'
  | 'SCENE_LINE_COVERAGE'
  | 'EVENT_NEGATIVE_TIME'
  | 'EVENT_EXCEEDS_DURATION'
  | 'EMOTION_NOT_ALLOWED'
  | 'STINGER_MISSING_ASSET'
  | 'RESOLVED_WITHOUT_AUDIO'
  | 'TIMELINE_SIZE';

export interface ValidationIssue {
  code: ValidationCode;
  message: string;
  /** Dot path into the timeline, where determinable. */
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Firestore hard document limit is 1 MiB; warn well before it. */
const SIZE_WARN_BYTES = 700_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an unknown value into a MasterTimeline. Returns the typed timeline on
 * success, or the shape errors. Does NOT run semantic invariants — call
 * `validateTimeline` for that.
 */
export function parseTimeline(
  input: unknown
): { ok: true; timeline: MasterTimeline } | { ok: false; issues: ValidationIssue[] } {
  const parsed = MasterTimelineSchema.safeParse(input);
  if (parsed.success) return { ok: true, timeline: parsed.data };

  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      code: 'SHAPE_INVALID' as const,
      message: i.message,
      path: i.path.join('.'),
    })),
  };
}

/**
 * Full validation: shape + semantic invariants. Safe to call on untrusted input.
 */
export function validateTimeline(input: unknown): ValidationResult {
  const shape = parseTimeline(input);
  if (!shape.ok) {
    return { valid: false, errors: shape.issues, warnings: [] };
  }
  return validateInvariants(shape.timeline);
}

/**
 * Semantic invariants only. Use when the timeline is already typed (e.g.
 * immediately after TimelineBuilder assembly, before persistence).
 */
export function validateInvariants(timeline: MasterTimeline): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const sceneIds = new Set(timeline.scenes.map((s) => s.id));
  const castIds = new Set(timeline.cast.characters.map((c) => c.id));
  const allowedByCharacter = new Map(
    timeline.cast.characters.map((c) => [c.id, new Set(c.allowedEmotions)])
  );

  // ── Cast integrity ──────────────────────────────────────────────────────
  if (!castIds.has(timeline.cast.primarySpeakerId)) {
    errors.push({
      code: 'CAST_PRIMARY_MISSING',
      message: `primarySpeakerId "${timeline.cast.primarySpeakerId}" is not in the cast`,
      path: 'cast.primarySpeakerId',
    });
  }
  if (timeline.cast.narratorId && !castIds.has(timeline.cast.narratorId)) {
    errors.push({
      code: 'CAST_REFS',
      message: `narratorId "${timeline.cast.narratorId}" is not in the cast`,
      path: 'cast.narratorId',
    });
  }

  // ── Scene ordering ──────────────────────────────────────────────────────
  for (let i = 1; i < timeline.scenes.length; i++) {
    if (timeline.scenes[i].index <= timeline.scenes[i - 1].index) {
      errors.push({
        code: 'SCENE_ORDER',
        message: `scenes must be strictly ordered by index (scene ${i} index ${timeline.scenes[i].index} <= previous ${timeline.scenes[i - 1].index})`,
        path: `scenes.${i}.index`,
      });
    }
  }

  // ── VOICE: the critical backward-compatibility invariant ────────────────
  const voice = timeline.tracks.voice.events;
  if (voice.length === 0) {
    errors.push({
      code: 'VOICE_EMPTY',
      message: 'timeline has no voice events — nothing would be spoken',
      path: 'tracks.voice.events',
    });
  }

  // lineIndex must be 0..n-1, strictly ascending, no gaps or duplicates.
  // This is what keeps TranscriptSegment[], chapters and click-to-seek valid.
  for (let i = 0; i < voice.length; i++) {
    if (voice[i].lineIndex !== i) {
      errors.push({
        code: 'VOICE_LINE_MAPPING',
        message: `voice event at position ${i} has lineIndex ${voice[i].lineIndex}; must be 1:1 and order-preserving with the script`,
        path: `tracks.voice.events.${i}.lineIndex`,
      });
      break; // one report is enough; the whole mapping is suspect
    }
  }

  // Character + emotion-range checks per line.
  for (let i = 0; i < voice.length; i++) {
    const ev = voice[i];
    if (!castIds.has(ev.characterId)) {
      errors.push({
        code: 'CAST_REFS',
        message: `voice event ${ev.id} references unknown characterId "${ev.characterId}"`,
        path: `tracks.voice.events.${i}.characterId`,
      });
      continue;
    }
    const allowed = allowedByCharacter.get(ev.characterId);
    if (allowed && !allowed.has(ev.emotion)) {
      // Advisory: the synthesizer can safely clamp to the character default.
      warnings.push({
        code: 'EMOTION_NOT_ALLOWED',
        message: `emotion "${ev.emotion}" is outside allowedEmotions for character "${ev.characterId}"; will be clamped`,
        path: `tracks.voice.events.${i}.emotion`,
      });
    }
  }

  // ── MUSIC: continuity + headroom ────────────────────────────────────────
  const music = [...timeline.tracks.music.events].sort((a, b) => a.startMs - b.startMs);
  const duckingDb = timeline.mastering.duckingDb;
  const duckFloor = timeline.mastering.voiceBusGainDb + duckingDb;

  music.forEach((ev, i) => {
    const isFinal = i === music.length - 1;

    // "Never stop abruptly": every non-final bed must overlap the next one.
    if (!isFinal && ev.crossfadeToNextMs <= 0 && ev.transitionType !== 'cut') {
      errors.push({
        code: 'MUSIC_NO_HARD_STOP',
        message: `music event ${ev.id} is not final but has crossfadeToNextMs=0 (would hard-stop)`,
        path: `tracks.music.events.${i}.crossfadeToNextMs`,
      });
    }

    // Narrator intelligibility.
    //
    // This used to warn whenever a bed exceeded the duck floor, which assumed the
    // static level was the ONLY thing protecting the narrator. It is not: the
    // mixer applies `sidechaincompress` keyed to the voice bus, so a bed above the
    // duck floor is pulled down automatically whenever anyone speaks.
    //
    // Holding beds under the floor produced music nobody could hear (measured
    // -36 LUFS, ~20 dB under narration), and the rule fired on exactly the intro
    // and outro stings that WERE audible — a warning on correct behaviour.
    //
    // What genuinely risks masking is a bed loud enough that even a full duck
    // leaves it competing, so the threshold is now the post-duck level.
    const postDuckDb = ev.volumeDb + duckingDb;
    if (postDuckDb > duckFloor) {
      warnings.push({
        code: 'MUSIC_DUCK_HEADROOM',
        message:
          `music event ${ev.id} volume ${ev.volumeDb}dB stays at ${postDuckDb.toFixed(1)}dB even after ` +
          `${duckingDb}dB of ducking, above the duck floor ${duckFloor}dB; narration may be masked`,
        path: `tracks.music.events.${i}.volumeDb`,
      });
    }
  });

  // ── Cross-track structural checks ───────────────────────────────────────
  const tracks = timeline.tracks;
  const everyEvent = [
    ...tracks.voice.events.map((e, i) => ({ e, p: `tracks.voice.events.${i}` })),
    ...tracks.music.events.map((e, i) => ({ e, p: `tracks.music.events.${i}` })),
    ...tracks.ambience.events.map((e, i) => ({ e, p: `tracks.ambience.events.${i}` })),
    ...tracks.sfx.events.map((e, i) => ({ e, p: `tracks.sfx.events.${i}` })),
    ...tracks.pause.events.map((e, i) => ({ e, p: `tracks.pause.events.${i}` })),
    ...tracks.visual.events.map((e, i) => ({ e, p: `tracks.visual.events.${i}` })),
  ];

  let sceneRefReported = false;
  let overrunReported = false;

  for (const { e, p } of everyEvent) {
    if (!sceneIds.has(e.sceneId) && !sceneRefReported) {
      errors.push({
        code: 'SCENE_REFS',
        message: `event ${e.id} references unknown sceneId "${e.sceneId}"`,
        path: `${p}.sceneId`,
      });
      sceneRefReported = true;
    }

    if (e.startMs < 0 || e.durationMs < 0) {
      errors.push({
        code: 'EVENT_NEGATIVE_TIME',
        message: `event ${e.id} has negative timing`,
        path: p,
      });
    }

    // Only meaningful once resolved — a planned timeline's totalDurationMs is an estimate.
    if (
      timeline.phase === 'resolved' &&
      timeline.totalDurationMs > 0 &&
      e.startMs + e.durationMs > timeline.totalDurationMs &&
      !overrunReported
    ) {
      warnings.push({
        code: 'EVENT_EXCEEDS_DURATION',
        message: `event ${e.id} ends at ${e.startMs + e.durationMs}ms, beyond totalDurationMs ${timeline.totalDurationMs}ms`,
        path: p,
      });
      overrunReported = true;
    }
  }

  // ── Stinger transitions need an asset OR a requirement ──────────────────
  //
  // A requirement is sufficient: the AssetResolver will satisfy it before the
  // render. Only a stinger with NEITHER is a real defect, because nothing
  // downstream can act on it and the transition silently degrades.
  timeline.scenes.forEach((s, i) => {
    for (const [key, tr] of [
      ['transitionIn', s.transitionIn],
      ['transitionOut', s.transitionOut],
    ] as const) {
      if (tr.style === 'stinger' && !tr.stingerAssetId && !tr.stingerRequirement) {
        warnings.push({
          code: 'STINGER_MISSING_ASSET',
          message:
            `scene "${s.id}" ${key} uses style 'stinger' with neither a ` +
            `stingerRequirement nor a stingerAssetId; will fall back to crossfade`,
          path: `scenes.${i}.${key}.stingerRequirement`,
        });
      }
    }
  });

  // ── A resolved timeline must carry real audio for every line ────────────
  if (timeline.phase === 'resolved') {
    const missing = voice.filter((e) => !e.audio).length;
    if (missing > 0) {
      errors.push({
        code: 'RESOLVED_WITHOUT_AUDIO',
        message: `timeline is phase 'resolved' but ${missing} voice event(s) have no synthesized audio`,
        path: 'tracks.voice.events',
      });
    }
  }

  // ── Firestore size guard ────────────────────────────────────────────────
  const approxBytes = estimateJsonBytes(timeline);
  if (approxBytes > SIZE_WARN_BYTES) {
    warnings.push({
      code: 'TIMELINE_SIZE',
      message: `timeline is ~${Math.round(approxBytes / 1024)}KB, approaching the 1MiB Firestore document limit; consider offloading to GCS`,
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Line coverage check, separated because it needs the script length — which
 * validation cannot infer from the timeline alone. Call from the Director once
 * the script is in hand.
 */
export function validateLineCoverage(
  timeline: MasterTimeline,
  scriptLineCount: number
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (timeline.tracks.voice.events.length !== scriptLineCount) {
    errors.push({
      code: 'VOICE_LINE_MAPPING',
      message: `timeline has ${timeline.tracks.voice.events.length} voice events but the script has ${scriptLineCount} lines; must be 1:1`,
      path: 'tracks.voice.events',
    });
  }

  // Every line should fall inside exactly one scene's range.
  const covered = new Set<number>();
  for (const s of timeline.scenes) {
    for (let i = s.lineRange.startLine; i <= s.lineRange.endLine; i++) covered.add(i);
  }
  const uncovered: number[] = [];
  for (let i = 0; i < scriptLineCount; i++) if (!covered.has(i)) uncovered.push(i);

  if (uncovered.length > 0) {
    warnings.push({
      code: 'SCENE_LINE_COVERAGE',
      message: `${uncovered.length} script line(s) are not covered by any scene (first: ${uncovered[0]}); they will inherit the nearest scene`,
      path: 'scenes',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Compact one-line summary for logs. */
export function formatValidationResult(r: ValidationResult): string {
  if (r.valid && r.warnings.length === 0) return 'valid';
  const parts: string[] = [];
  if (r.errors.length) parts.push(`${r.errors.length} error(s): ${r.errors.map((e) => e.code).join(', ')}`);
  if (r.warnings.length) parts.push(`${r.warnings.length} warning(s): ${r.warnings.map((w) => w.code).join(', ')}`);
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Byte estimate without paying for a second full serialization downstream. */
function estimateJsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}
