/**
 * TimelineQualityScorer — turns the creative-review checklist into measurable checks.
 *
 * Ten dimensions, matching the review brief: scenes, emotion, voice, gender/age,
 * music, ambience, SFX, timing, learning, continuity.
 *
 * IMPORTANT about what this is and is not. These are STRUCTURAL proxies for
 * creative quality, not a substitute for listening. A timeline can score 100 and
 * still be dull; the score catches the mechanical failures (a character changing
 * voice mid-episode, music contradicting the scene's emotion, SFX density that
 * would irritate a listener) so that human review time is spent on taste rather
 * than on spotting bugs.
 *
 * Every check is PURE and offline — no I/O, no LLM. That makes the 20-timeline
 * batch run deterministic and free.
 */

import type { MasterTimeline } from '../schema/timeline.schema';
import type { Emotion } from '../schema/common.schema';
import type { Character } from '../schema/character.schema';
import { musicCategoryFor } from '../knowledge/musicMap';
import { MAX_SFX_PER_MINUTE } from '../knowledge/sfxTriggers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QualityDimension =
  | 'scenes'
  | 'emotion'
  | 'voice'
  | 'genderAge'
  | 'music'
  | 'ambience'
  | 'sfx'
  | 'timing'
  | 'learning'
  | 'continuity';

export interface DimensionScore {
  dimension: QualityDimension;
  /** 0..100. */
  score: number;
  /** Specific problems found. Empty means the dimension is clean. */
  findings: string[];
  /** What the check actually measured, for transparency. */
  measured: string;
}

export interface QualityReport {
  podcastId: string;
  /** Unweighted mean of the ten dimensions, 0..100. */
  overall: number;
  dimensions: DimensionScore[];
  /** Dimensions scoring below 70 — the review queue. */
  weakest: QualityDimension[];
  /** Counts, so the batch report can aggregate without re-reading timelines. */
  counts: {
    scenes: number;
    characters: number;
    voiceEvents: number;
    musicEvents: number;
    ambienceEvents: number;
    sfxEvents: number;
    pauseEvents: number;
    durationMs: number;
  };
}

/** Below this a dimension needs human attention. */
export const WEAK_THRESHOLD = 70;

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

export class TimelineQualityScorer {
  score(t: MasterTimeline): QualityReport {
    const dimensions: DimensionScore[] = [
      this.scoreScenes(t),
      this.scoreEmotion(t),
      this.scoreVoice(t),
      this.scoreGenderAge(t),
      this.scoreMusic(t),
      this.scoreAmbience(t),
      this.scoreSfx(t),
      this.scoreTiming(t),
      this.scoreLearning(t),
      this.scoreContinuity(t),
    ];

    const overall =
      Math.round(
        (dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length) * 10
      ) / 10;

    return {
      podcastId: t.podcastId,
      overall,
      dimensions,
      weakest: dimensions
        .filter((d) => d.score < WEAK_THRESHOLD)
        .sort((a, b) => a.score - b.score)
        .map((d) => d.dimension),
      counts: {
        scenes: t.scenes.length,
        characters: t.cast.characters.length,
        voiceEvents: t.tracks.voice.events.length,
        musicEvents: t.tracks.music.events.length,
        ambienceEvents: t.tracks.ambience.events.length,
        sfxEvents: t.tracks.sfx.events.length,
        pauseEvents: t.tracks.pause.events.length,
        durationMs: t.totalDurationMs,
      },
    };
  }

  // ── 1. Scenes ────────────────────────────────────────────────────────────

  /**
   * Scene boundaries are logical when scenes are contiguous, none is absurdly
   * short or long, and line ranges partition the script without gaps.
   *
   * A 4-second "scene" is a segmentation bug, not a scene.
   */
  private scoreScenes(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;

    const scenes = [...t.scenes].sort((a, b) => a.index - b.index);

    // Contiguity of line ranges — the script must be fully covered exactly once.
    for (let i = 1; i < scenes.length; i++) {
      const prev = scenes[i - 1];
      const cur = scenes[i];
      if (cur.lineRange.startLine !== prev.lineRange.endLine + 1) {
        findings.push(
          `scene ${cur.index} starts at line ${cur.lineRange.startLine}, ` +
            `expected ${prev.lineRange.endLine + 1}`
        );
        score -= 15;
      }
    }

    // Duration sanity. Very short scenes fragment the score and the ambience.
    const TOO_SHORT_MS = 15_000;
    const tooShort = scenes.filter((s) => s.estimatedDurationMs < TOO_SHORT_MS);
    if (tooShort.length > 0) {
      findings.push(
        `${tooShort.length} scene(s) under ${TOO_SHORT_MS / 1000}s — likely over-segmented`
      );
      score -= Math.min(25, tooShort.length * 8);
    }

    // A single scene for a long episode means segmentation did nothing.
    if (scenes.length === 1 && t.totalDurationMs > 5 * 60_000) {
      findings.push('only one scene for a 5+ minute episode — no segmentation happened');
      score -= 30;
    }

    // Too many scenes is equally suspect.
    const minutes = t.totalDurationMs / 60_000;
    if (minutes > 0 && scenes.length / minutes > 2) {
      findings.push(
        `${scenes.length} scenes across ${minutes.toFixed(1)} min — over 2 scenes/min`
      );
      score -= 15;
    }

    return {
      dimension: 'scenes',
      score: clamp(score),
      findings,
      measured: `${scenes.length} scenes, contiguity + duration sanity`,
    };
  }

  // ── 2. Emotion ───────────────────────────────────────────────────────────

  /**
   * Emotion is coherent when the curve actually varies, every scene emotion is
   * within its speaker's allowed set, and the arc doesn't flip wildly between
   * adjacent scenes.
   *
   * A flat all-neutral episode is the failure mode this catches — it means the
   * emotion planner effectively didn't run.
   */
  private scoreEmotion(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;

    const sceneEmotions = t.scenes.map((s) => s.dominantEmotion);
    const distinct = new Set(sceneEmotions);

    if (distinct.size === 1 && t.scenes.length > 2) {
      findings.push(
        `all ${t.scenes.length} scenes share emotion '${[...distinct][0]}' — flat arc`
      );
      score -= 30;
    }

    // Adjacent whiplash: valence swinging hard between neighbouring scenes reads
    // as inconsistent rather than dynamic.
    for (let i = 1; i < t.scenes.length; i++) {
      const a = emotionValence(t.scenes[i - 1].dominantEmotion);
      const b = emotionValence(t.scenes[i].dominantEmotion);
      if (Math.abs(a - b) > 1.4) {
        findings.push(
          `scene ${i - 1}→${i}: valence jump ` +
            `${t.scenes[i - 1].dominantEmotion}→${t.scenes[i].dominantEmotion}`
        );
        score -= 8;
      }
    }

    // Per-line emotions must respect the character ceiling.
    const byId = new Map(t.cast.characters.map((c) => [c.id, c]));
    let outOfRange = 0;
    for (const e of t.tracks.voice.events) {
      const character = byId.get(e.characterId);
      if (!character) continue;
      if (!character.allowedEmotions.includes(e.emotion)) outOfRange++;
    }
    if (outOfRange > 0) {
      findings.push(
        `${outOfRange} line(s) use an emotion outside the character's allowed set`
      );
      score -= Math.min(30, outOfRange * 3);
    }

    // The curve should have more than one keyframe for a multi-scene episode.
    if (t.emotionCurve.keyframes.length < 2 && t.scenes.length > 1) {
      findings.push('emotion curve has a single keyframe — no arc');
      score -= 15;
    }

    return {
      dimension: 'emotion',
      score: clamp(score),
      findings,
      measured: `${distinct.size} distinct scene emotions, ${t.emotionCurve.arcType} arc`,
    };
  }

  // ── 3. Voice ─────────────────────────────────────────────────────────────

  /**
   * Voice assignment is sound when every speaking character has a bound voice,
   * no two characters share one voice, and prosody expectations match the
   * provider's capability.
   */
  private scoreVoice(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;

    const speaking = new Set(t.tracks.voice.events.map((e) => e.characterId));

    for (const c of t.cast.characters) {
      if (!c.voice?.voiceId) {
        findings.push(`${c.displayName} has no bound voice`);
        score -= 25;
      }
    }

    // Two characters sharing a voice destroys the illusion of a conversation.
    const voiceUsers = new Map<string, string[]>();
    for (const c of t.cast.characters) {
      if (!speaking.has(c.id)) continue;
      const key = `${c.voice?.provider}:${c.voice?.voiceId}`;
      voiceUsers.set(key, [...(voiceUsers.get(key) ?? []), c.displayName]);
    }
    for (const [voice, users] of voiceUsers) {
      if (users.length > 1) {
        findings.push(`voice ${voice} shared by: ${users.join(', ')}`);
        score -= 20;
      }
    }

    // Prosody requested from a voice that rejects it means the delivery
    // direction is silently ignored at synthesis time.
    const badProsody = t.tracks.voice.events.filter(
      (e) =>
        e.delivery.prosodyUnsupported &&
        (e.delivery.pitch !== 0 || e.delivery.speakingRate !== 1)
    ).length;
    if (badProsody > 0) {
      findings.push(
        `${badProsody} line(s) set pitch/rate on a voice that ignores prosody`
      );
      score -= Math.min(20, badProsody);
    }

    return {
      dimension: 'voice',
      score: clamp(score),
      findings,
      measured: `${speaking.size} speaking character(s), ${voiceUsers.size} distinct voice(s)`,
    };
  }

  // ── 4. Gender / age ──────────────────────────────────────────────────────

  /**
   * The voice's declared gender must match the character's, and its age band
   * should be plausible. A male-labelled voice on a female character is the
   * single most jarring mismatch a listener notices.
   */
  private scoreGenderAge(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;

    for (const c of t.cast.characters) {
      const voiceGender = (c.voice as { gender?: string } | undefined)?.gender;
      if (voiceGender && c.gender !== 'neutral' && voiceGender !== 'neutral') {
        if (voiceGender !== c.gender) {
          findings.push(
            `${c.displayName}: character is ${c.gender} but voice is ${voiceGender}`
          );
          score -= 30;
        }
      }

      const voiceAge = (c.voice as { ageBand?: string } | undefined)?.ageBand;
      if (voiceAge && voiceAge !== c.ageBand) {
        // Age is a softer signal than gender — adjacent bands are acceptable.
        if (!adjacentAge(c.ageBand, voiceAge)) {
          findings.push(
            `${c.displayName}: character is ${c.ageBand} but voice is ${voiceAge}`
          );
          score -= 12;
        }
      }
    }

    return {
      dimension: 'genderAge',
      score: clamp(score),
      findings,
      measured: `${t.cast.characters.length} character(s) checked for voice/gender/age fit`,
    };
  }

  // ── 5. Music ─────────────────────────────────────────────────────────────

  /**
   * Music is correct when each bed's category is what the knowledge map would
   * choose for that scene's emotion, beds sit under the duck floor, and no bed
   * stops abruptly.
   */
  private scoreMusic(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;
    const events = t.tracks.music.events;

    if (events.length === 0) {
      return {
        dimension: 'music',
        score: 50,
        findings: ['no music events — the score is entirely absent'],
        measured: '0 music events',
      };
    }

    const sceneById = new Map(t.scenes.map((s) => [s.id, s]));
    const duckFloor = t.mastering.voiceBusGainDb + t.mastering.duckingDb;

    let mismatched = 0;
    for (const e of events) {
      if (e.role !== 'bed') continue;
      const scene = sceneById.get(e.sceneId);
      if (!scene) continue;
      const expected = musicCategoryFor(scene.dominantEmotion, t.meta.genre);
      if (e.category !== expected) {
        mismatched++;
        findings.push(
          `${e.id}: '${e.category}' under a ${scene.dominantEmotion} scene ` +
            `(expected '${expected}')`
        );
      }
    }
    if (mismatched > 0) score -= Math.min(35, mismatched * 12);

    // Loud beds fight narration.
    const tooLoud = events.filter((e) => e.role === 'bed' && e.volumeDb > duckFloor);
    if (tooLoud.length > 0) {
      findings.push(
        `${tooLoud.length} bed(s) above the duck floor (${duckFloor}dB) — will mask speech`
      );
      score -= Math.min(30, tooLoud.length * 10);
    }

    // No hard stops except the genuinely final event.
    const ordered = [...events].sort((a, b) => a.startMs - b.startMs);
    const hardStops = ordered
      .slice(0, -1)
      .filter((e) => e.crossfadeToNextMs <= 0).length;
    if (hardStops > 0) {
      findings.push(`${hardStops} non-final bed(s) end with no crossfade — abrupt`);
      score -= Math.min(20, hardStops * 10);
    }

    return {
      dimension: 'music',
      score: clamp(score),
      findings,
      measured: `${events.length} events, ${mismatched} emotion mismatch(es)`,
    };
  }

  // ── 6. Ambience ──────────────────────────────────────────────────────────

  /**
   * Ambience makes sense when each event's environment matches its scene's
   * setting, layers sit below music, and the same location doesn't restart
   * needlessly between consecutive scenes.
   */
  private scoreAmbience(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;
    const events = t.tracks.ambience.events;

    if (events.length === 0) {
      // Legitimate: 'subtle' mode and reduceBackground both suppress ambience.
      return {
        dimension: 'ambience',
        score: 75,
        findings: ['no ambience events (expected when reduceBackground or subtle mode)'],
        measured: '0 ambience events',
      };
    }

    const sceneById = new Map(t.scenes.map((s) => [s.id, s]));
    const duckFloor = t.mastering.voiceBusGainDb + t.mastering.duckingDb;

    for (const e of events) {
      const scene = sceneById.get(e.sceneId);
      if (scene && e.environmentId !== scene.setting.location) {
        findings.push(
          `${e.id}: ambience '${e.environmentId}' but scene setting is ` +
            `'${scene.setting.location}'`
        );
        score -= 15;
      }

      // Ambience is the quietest bed; it must sit clearly under the duck floor.
      const loud = e.layers.filter((l) => l.volumeDb > duckFloor - 4);
      if (loud.length > 0) {
        findings.push(`${e.id}: ${loud.length} layer(s) too loud for a background bed`);
        score -= 10;
      }

      if (e.layers.length === 0) {
        findings.push(`${e.id}: no layers`);
        score -= 20;
      }
    }

    const avgLayers =
      events.reduce((sum, e) => sum + e.layers.length, 0) / events.length;

    return {
      dimension: 'ambience',
      score: clamp(score),
      findings,
      measured: `${events.length} events, ${avgLayers.toFixed(1)} layers avg`,
    };
  }

  // ── 7. SFX ───────────────────────────────────────────────────────────────

  /**
   * SFX are appropriate when they are sparse, spaced, and anchored to a real
   * trigger word. Density is the dominant term: in educational audio, too many
   * effects is a worse failure than too few.
   */
  private scoreSfx(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;
    const events = t.tracks.sfx.events;

    if (events.length === 0) {
      // Correct behaviour in subtle mode — full marks, not a penalty.
      return {
        dimension: 'sfx',
        score: 100,
        findings: [],
        measured: '0 SFX events (correct for subtle intensity)',
      };
    }

    const minutes = Math.max(1, t.totalDurationMs / 60_000);
    const perMinute = events.length / minutes;
    if (perMinute > MAX_SFX_PER_MINUTE) {
      findings.push(
        `${perMinute.toFixed(1)} SFX/min exceeds the cap of ${MAX_SFX_PER_MINUTE}`
      );
      score -= 30;
    }

    const untriggered = events.filter((e) => !e.triggerWord).length;
    if (untriggered > 0) {
      findings.push(`${untriggered} cue(s) have no trigger word — placement is arbitrary`);
      score -= Math.min(25, untriggered * 8);
    }

    // Clustering: two cues within 800ms read as a glitch.
    const ordered = [...events].sort((a, b) => a.startMs - b.startMs);
    let clustered = 0;
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].startMs - ordered[i - 1].startMs < 800) clustered++;
    }
    if (clustered > 0) {
      findings.push(`${clustered} cue pair(s) less than 800ms apart`);
      score -= Math.min(20, clustered * 7);
    }

    return {
      dimension: 'sfx',
      score: clamp(score),
      findings,
      measured: `${events.length} events, ${perMinute.toFixed(1)}/min`,
    };
  }

  // ── 8. Timing ────────────────────────────────────────────────────────────

  /**
   * Timing is correct when voice events are strictly ordered and contiguous with
   * their line indices, nothing starts before zero, and nothing runs past the
   * declared total duration.
   */
  private scoreTiming(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;
    const voice = t.tracks.voice.events;

    // The load-bearing invariant: lineIndex order must match time order, or the
    // transcript, chapters and click-to-seek all desynchronise.
    for (let i = 1; i < voice.length; i++) {
      if (voice[i].lineIndex !== voice[i - 1].lineIndex + 1) {
        findings.push(
          `voice lineIndex not contiguous at ${i}: ` +
            `${voice[i - 1].lineIndex} → ${voice[i].lineIndex}`
        );
        score -= 25;
        break;
      }
      if (voice[i].startMs < voice[i - 1].startMs) {
        findings.push(`voice event ${i} starts before its predecessor`);
        score -= 25;
        break;
      }
    }

    const all = [
      ...t.tracks.music.events,
      ...t.tracks.ambience.events,
      ...t.tracks.sfx.events,
      ...t.tracks.pause.events,
    ];

    const negative = all.filter((e) => e.startMs < 0).length;
    if (negative > 0) {
      findings.push(`${negative} event(s) start before 0ms`);
      score -= 20;
    }

    // A small overhang is fine (music tails resolve past the last word);
    // a large one means the arithmetic is wrong.
    const overhangMs = 15_000;
    const overrun = all.filter(
      (e) => e.startMs + e.durationMs > t.totalDurationMs + overhangMs
    ).length;
    if (overrun > 0) {
      findings.push(
        `${overrun} event(s) extend more than ${overhangMs / 1000}s past the episode end`
      );
      score -= 20;
    }

    return {
      dimension: 'timing',
      score: clamp(score),
      findings,
      measured: `${voice.length} voice events, ${all.length} background events`,
    };
  }

  // ── 9. Learning ──────────────────────────────────────────────────────────

  /**
   * Audio should SUPPORT comprehension. Two concrete proxies:
   *   - comprehension pauses exist after dense material
   *   - background is quieter in high-difficulty scenes, not louder
   *
   * This is the dimension that most directly encodes "educational product, not
   * entertainment product".
   */
  private scoreLearning(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;

    const pauses = t.tracks.pause.events;
    const comprehension = pauses.filter((p) => p.pauseType === 'comprehension').length;

    if (t.scenes.length >= 3 && comprehension === 0) {
      findings.push('no comprehension pauses — dense passages get no processing time');
      score -= 20;
    }

    // Background must not get louder as difficulty rises.
    const sceneById = new Map(t.scenes.map((s) => [s.id, s]));
    const hardScenes = t.scenes.filter((s) => s.tensionLevel >= 0.7).map((s) => s.id);
    const loudInHard = t.tracks.music.events.filter(
      (e) => hardScenes.includes(e.sceneId) && e.role === 'bed' && e.volumeDb > -14
    ).length;
    if (loudInHard > 0) {
      findings.push(
        `${loudInHard} bed(s) louder than -14dB in a high-tension scene — competes with comprehension`
      );
      score -= 15;
    }

    // Every scene should have SOME pause, or the episode is wall-to-wall speech.
    const scenesWithPause = new Set(pauses.map((p) => p.sceneId));
    const silent = [...sceneById.keys()].filter((id) => !scenesWithPause.has(id));
    if (silent.length > 0 && t.scenes.length > 1) {
      findings.push(`${silent.length} scene(s) contain no pauses at all`);
      score -= Math.min(20, silent.length * 6);
    }

    return {
      dimension: 'learning',
      score: clamp(score),
      findings,
      measured: `${pauses.length} pauses (${comprehension} comprehension)`,
    };
  }

  // ── 10. Continuity ───────────────────────────────────────────────────────

  /**
   * A character must sound like the same person all the way through: one voice,
   * one personality, and an emotional range that stays inside their profile.
   */
  private scoreContinuity(t: MasterTimeline): DimensionScore {
    const findings: string[] = [];
    let score = 100;

    const byId = new Map(t.cast.characters.map((c) => [c.id, c]));

    // Unknown speaker → the voice track references a character not in the cast.
    const unknown = new Set(
      t.tracks.voice.events.map((e) => e.characterId).filter((id) => !byId.has(id))
    );
    if (unknown.size > 0) {
      findings.push(`voice events reference unknown character(s): ${[...unknown].join(', ')}`);
      score -= 35;
    }

    // Emotional range per character: a character using their entire allowed set
    // in one episode is usually a planner failing to respect the profile.
    for (const [id, character] of byId) {
      const used = new Set<Emotion>(
        t.tracks.voice.events.filter((e) => e.characterId === id).map((e) => e.emotion)
      );
      if (used.size === 0) continue;
      if (
        character.allowedEmotions.length >= 4 &&
        used.size === character.allowedEmotions.length
      ) {
        findings.push(
          `${character.displayName} uses all ${used.size} allowed emotions — ` +
            'range may be too wide to read as one person'
        );
        score -= 10;
      }
    }

    // A cast member who never speaks is dead weight in the timeline.
    const speaking = new Set(t.tracks.voice.events.map((e) => e.characterId));
    const silentCast = t.cast.characters.filter((c) => !speaking.has(c.id));
    if (silentCast.length > 0) {
      findings.push(
        `${silentCast.length} cast member(s) never speak: ` +
          silentCast.map((c) => c.displayName).join(', ')
      );
      score -= Math.min(20, silentCast.length * 10);
    }

    // Primary speaker must exist and actually speak.
    if (!byId.has(t.cast.primarySpeakerId)) {
      findings.push('primarySpeakerId is not in the cast');
      score -= 25;
    }

    return {
      dimension: 'continuity',
      score: clamp(score),
      findings,
      measured: `${byId.size} cast member(s), ${speaking.size} speaking`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Emotional valence, −1 (negative) to +1 (positive).
 *
 * Defined here rather than on EmotionProfile because it is a REVIEW concern, not
 * a synthesis parameter — EmotionProfile carries things the TTS layer needs
 * (rate, pitch, stability), and adding an unused field there would imply the
 * renderer consumes it.
 *
 * Exhaustive over the closed Emotion union, so adding an emotion is a compile
 * error here rather than a silent 0.
 */
const EMOTION_VALENCE: Record<Emotion, number> = {
  neutral: 0,
  happy: 0.9,
  sad: -0.8,
  fear: -0.9,
  excited: 0.7,
  calm: 0.3,
  hope: 0.6,
  angry: -0.7,
  curious: 0.4,
  suspense: -0.5,
  mystery: -0.2,
  romantic: 0.6,
  heroic: 0.7,
  victory: 1,
  failure: -0.9,
  wonder: 0.6,
  surprise: 0.2,
};

export function emotionValence(emotion: Emotion): number {
  return EMOTION_VALENCE[emotion] ?? 0;
}

const AGE_ORDER = ['child', 'teen', 'young_adult', 'adult', 'middle_aged', 'senior'];

/** Adjacent age bands are an acceptable voice substitution; distant ones are not. */
export function adjacentAge(a: string, b: string): boolean {
  const i = AGE_ORDER.indexOf(a);
  const j = AGE_ORDER.indexOf(b);
  if (i < 0 || j < 0) return true; // unknown band — don't penalise
  return Math.abs(i - j) <= 1;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

export const timelineQualityScorer = new TimelineQualityScorer();
