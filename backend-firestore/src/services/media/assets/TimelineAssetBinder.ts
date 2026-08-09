/**
 * TimelineAssetBinder — the missing link between the Director and the renderer.
 *
 *     AI Producer → AI Director → MasterTimeline → [BINDER] → Audio Renderer
 *
 * The Director emits SEMANTIC requirements (`{kind:'music', category:'epic',
 * emotion:'heroic', intensity:0.85}`) and deliberately never names a file. The
 * render engines, however, only consume `event.assetId`. Nothing was populating
 * that field, so every music/ambience/SFX cue was skipped with the reason
 * "awaiting asset resolver" and every episode came out voice-only despite a
 * fully-generated asset library.
 *
 * This binder closes the gap: for each requirement it finds the best available
 * asset in the registry and stamps its id onto the event.
 *
 * MATCHING STRATEGY, cheapest and most exact first:
 *   1. Exact requirement fingerprint — a previous identical request.
 *   2. Same category (or a documented alias) scored on emotion, intensity,
 *      tempo and loopability.
 *   3. For MUSIC only, a neutral general-purpose bed.
 *
 * Step 2 exists because the Director draws categories from a much wider closed
 * union than any finite library covers — it legitimately asks for `ambient_synth`
 * when the library holds `science`. Without aliasing, valid cues resolve to
 * nothing and the mix is silent.
 *
 * COST: this binder NEVER generates audio. It only matches what already exists,
 * so binding is free and adds no per-episode spend. Generation stays an explicit
 * offline step (`scripts/generateAssetLibrary.ts`).
 *
 * Never throws. An unbindable cue is left without an assetId and the renderer
 * omits that layer — silence is acceptable, a failed episode is not.
 */

import { logger } from '../../../utils/logger';
import { assetRegistry, type AssetRegistry } from '../../../core/assets/AssetRegistry';
import {
  requirementFingerprint,
  type AssetProvenance,
  type AssetRequirement,
} from '../../../core/director/schema/requirement.schema';
import type { AssetKind } from '../../../core/director/schema/common.schema';
import type { MasterTimeline } from '../../../core/director/schema/timeline.schema';

// ---------------------------------------------------------------------------
// Category aliases
// ---------------------------------------------------------------------------

/**
 * Director music category → equivalent categories present in a typical library,
 * best match first. Only sonically defensible substitutions: a listener should
 * not be able to tell the difference in context.
 */
const MUSIC_ALIASES: Record<string, string[]> = {
  ambient_synth: ['science', 'educational', 'mystery'],
  calm_piano: ['educational', 'sad', 'inspirational'],
  strings: ['inspirational', 'sad', 'historical'],
  space: ['science', 'mystery'],
  nature: ['educational', 'science'],
  documentary: ['historical', 'educational'],
  meditation: ['educational', 'sad'],
  victory: ['epic', 'inspirational'],
  horror: ['mystery'],
  fantasy: ['adventure', 'epic'],
  epic: ['epic', 'adventure'],
  adventure: ['adventure', 'epic'],
  historical: ['historical', 'educational'],
  educational: ['educational', 'science'],
  science: ['science', 'educational'],
  mystery: ['mystery'],
  sad: ['sad'],
  inspirational: ['inspirational'],
};

/**
 * Ambience is the least forgiving layer — the wrong environment is immediately
 * audible as a mistake (ocean waves under a classroom). Aliases here are
 * therefore only true physical neighbours.
 */
const AMBIENCE_ALIASES: Record<string, string[]> = {
  // ── Non-physical scenes ─────────────────────────────────────────────────
  //
  // 'neutral' and 'abstract' are the locations the Director assigns to any topic
  // without a physical setting — which is MOST educational content (quantum
  // physics, algebra, grammar). They had no alias, so ambience bound 0/N and was
  // dropped from the mix with "missingCategories: [ambience:abstract]".
  //
  // These are safe in a way the physical aliases are not: with no real place to
  // contradict, the only requirement is that the bed be placeless. 'space' reads
  // as open and atmospheric; 'library' is quiet room tone.
  abstract: ['space', 'library'],
  neutral: ['library', 'classroom'],

  // ── Education ───────────────────────────────────────────────────────────
  school: ['classroom'],
  lecture_hall: ['classroom'],
  study: ['library'],
  study_room: ['library'],
  lab: ['laboratory'],
  observatory: ['laboratory', 'space'],

  // ── Water ───────────────────────────────────────────────────────────────
  ship: ['ocean'],
  harbour: ['ocean'],
  harbor: ['ocean'],
  beach: ['ocean'],
  river: ['ocean', 'rain'],
  underwater: ['ocean'],

  // ── Green space ─────────────────────────────────────────────────────────
  jungle: ['forest'],
  woods: ['forest'],
  mountain: ['forest'],
  garden: ['forest'],
  cave: ['forest'],

  // ── Built environment ───────────────────────────────────────────────────
  village: ['marketplace', 'city'],
  street: ['city'],
  city_street: ['city'],
  town: ['city'],
  bazaar: ['marketplace'],
  office: ['library'],
  cafe: ['marketplace', 'city'],
  train_station: ['city', 'marketplace'],
  airport: ['city', 'marketplace'],
  hospital: ['library'],
  temple: ['library'],
  medieval_town: ['marketplace', 'city'],
  ancient_rome: ['marketplace', 'city'],
  ancient_egypt: ['marketplace'],
  industrial_era: ['city'],

  // ── Weather / dramatic ──────────────────────────────────────────────────
  cosmos: ['space'],
  thunderstorm: ['storm', 'rain'],
  battlefield: ['storm'],
};

/** SFX substitutions that read as the same event to a listener. */
const SFX_ALIASES: Record<string, string[]> = {
  explosion: ['weather'],
  glass: ['paper'],
  vehicle: ['crowd'],
  phone: ['bell'],
  ui: ['bell'],
  magic: ['bell'],
  fire: ['wind'],
  animal: ['crowd'],
};

/**
 * Music categories safe to drop in when nothing else matches: unobtrusive beds
 * that suit any educational subject. Used only as a last resort for music.
 */
const NEUTRAL_MUSIC = ['educational', 'historical', 'science'];

function aliasesFor(kind: AssetKind, category: string): string[] {
  const key = category.toLowerCase();
  const table =
    kind === 'music'
      ? MUSIC_ALIASES
      : kind === 'ambience'
        ? AMBIENCE_ALIASES
        : SFX_ALIASES;
  return table[key] ?? [];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface TrackBindStats {
  total: number;
  bound: number;
  exact: number;
  aliased: number;
  unbound: number;
}

export interface BindResult {
  music: TrackBindStats;
  ambience: TrackBindStats;
  sfx: TrackBindStats;
  /** Categories nothing could satisfy — the coverage gap to generate next. */
  missingCategories: string[];
  elapsedMs: number;
}

function emptyStats(): TrackBindStats {
  return { total: 0, bound: 0, exact: 0, aliased: 0, unbound: 0 };
}

// ---------------------------------------------------------------------------
// Binder
// ---------------------------------------------------------------------------

export class TimelineAssetBinder {
  /** kind → all registry rows of that kind, loaded once per bind pass. */
  private pool = new Map<AssetKind, AssetProvenance[]>();

  constructor(private readonly registry: AssetRegistry = assetRegistry) {}

  /**
   * Stamp `assetId` onto every music event, ambience layer and SFX event that
   * can be matched. Mutates the timeline in place; the caller persists it.
   */
  async bind(timeline: MasterTimeline): Promise<BindResult> {
    const started = Date.now();
    const result: BindResult = {
      music: emptyStats(),
      ambience: emptyStats(),
      sfx: emptyStats(),
      missingCategories: [],
      elapsedMs: 0,
    };
    const missing = new Set<string>();

    try {
      this.pool = new Map();

      const tracks = timeline.tracks;

      // ── Music ──────────────────────────────────────────────────────────
      for (const event of tracks.music?.events ?? []) {
        result.music.total++;
        if (event.assetId) {
          result.music.bound++;
          result.music.exact++;
          continue;
        }
        const match = await this.findBest('music', event.requirement);
        if (match) {
          event.assetId = match.assetId;
          result.music.bound++;
          if (match.exact) result.music.exact++;
          else result.music.aliased++;
        } else {
          result.music.unbound++;
          missing.add(`music:${event.requirement?.category ?? event.category}`);
        }
      }

      // ── Ambience (one requirement per LAYER, not per event) ────────────
      for (const event of tracks.ambience?.events ?? []) {
        for (const layer of event.layers ?? []) {
          result.ambience.total++;
          if (layer.assetId) {
            result.ambience.bound++;
            result.ambience.exact++;
            continue;
          }
          const match = await this.findBest('ambience', layer.requirement);
          if (match) {
            layer.assetId = match.assetId;
            result.ambience.bound++;
            if (match.exact) result.ambience.exact++;
            else result.ambience.aliased++;
          } else {
            result.ambience.unbound++;
            missing.add(`ambience:${layer.requirement?.category ?? 'unknown'}`);
          }
        }
      }

      // ── SFX ────────────────────────────────────────────────────────────
      for (const event of tracks.sfx?.events ?? []) {
        result.sfx.total++;
        if (event.assetId) {
          result.sfx.bound++;
          result.sfx.exact++;
          continue;
        }
        const match = await this.findBest('sfx', event.requirement);
        if (match) {
          event.assetId = match.assetId;
          result.sfx.bound++;
          if (match.exact) result.sfx.exact++;
          else result.sfx.aliased++;
        } else {
          result.sfx.unbound++;
          missing.add(`sfx:${event.requirement?.category ?? event.effectCategory}`);
        }
      }

      result.missingCategories = [...missing];
      result.elapsedMs = Date.now() - started;

      logger.info('[TimelineAssetBinder] Bind complete', {
        podcastId: timeline.podcastId,
        music: `${result.music.bound}/${result.music.total}`,
        ambience: `${result.ambience.bound}/${result.ambience.total}`,
        sfx: `${result.sfx.bound}/${result.sfx.total}`,
        aliased:
          result.music.aliased + result.ambience.aliased + result.sfx.aliased,
        missingCategories: result.missingCategories,
        elapsedMs: result.elapsedMs,
      });
    } catch (err: any) {
      // Binding is an enhancement. If it fails the render still runs, just
      // without background layers.
      logger.warn('[TimelineAssetBinder] Bind failed; layers will be skipped', {
        podcastId: timeline?.podcastId,
        error: err?.message,
      });
      result.elapsedMs = Date.now() - started;
    }

    return result;
  }

  // ── Matching ─────────────────────────────────────────────────────────────

  /**
   * Best available asset for a requirement, or null.
   *
   * `exact` distinguishes a true fingerprint hit from a substitution, purely so
   * the log can show how much of the mix is approximated.
   */
  private async findBest(
    kind: AssetKind,
    requirement: AssetRequirement | undefined
  ): Promise<{ assetId: string; exact: boolean } | null> {
    if (!requirement) return null;

    // ── 1. Exact fingerprint ───────────────────────────────────────────────
    try {
      const fp = requirementFingerprint(requirement);
      const hit = await this.registry.findByFingerprint(fp);
      if (hit) return { assetId: hit.assetId, exact: true };
    } catch {
      // Fall through to scoring — a cache lookup failure is not fatal.
    }

    // ── 2. Score the pool ──────────────────────────────────────────────────
    const candidates = await this.load(kind);
    if (candidates.length === 0) return null;

    const wantedCategory = (requirement.category ?? '').toLowerCase();
    const aliases = aliasesFor(kind, wantedCategory);

    let best: AssetProvenance | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      const score = this.score(candidate, requirement, wantedCategory, aliases, kind);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    // A negative score means "no defensible match" (see `score`).
    if (!best || bestScore < 0) return null;
    return { assetId: best.assetId, exact: false };
  }

  /**
   * Score a candidate. Returns -1 to REJECT.
   *
   * Rejection matters most for ambience and SFX: an unrelated environment or
   * effect is worse than silence because it sounds like a bug. Music is
   * different — a neutral bed under any subject is unobjectionable, so music
   * falls back to a general-purpose category rather than dropping out.
   */
  private score(
    candidate: AssetProvenance,
    requirement: AssetRequirement,
    wantedCategory: string,
    aliases: string[],
    kind: AssetKind
  ): number {
    const candidateCategory = (candidate.category ?? '').toLowerCase();
    let score = 0;

    if (candidateCategory === wantedCategory) {
      score += 100;
    } else if (aliases.includes(candidateCategory)) {
      // Earlier aliases are better matches.
      score += 60 - aliases.indexOf(candidateCategory) * 5;
    } else if (kind === 'music' && NEUTRAL_MUSIC.includes(candidateCategory)) {
      score += 10;
    } else {
      return -1;
    }

    // Loopability is a hard requirement for beds: a non-looping file under a
    // four-minute scene leaves most of the scene silent.
    if (requirement.loopable) {
      if (candidate.loopable) score += 15;
      else score -= 25;
    }

    if (requirement.emotion && candidate.emotion === requirement.emotion) score += 20;

    if (typeof requirement.intensity === 'number' && typeof candidate.intensity === 'number') {
      score += (1 - Math.abs(requirement.intensity - candidate.intensity)) * 10;
    }

    if (requirement.layerRole && candidate.category) {
      // Ambience layer roles are not stored on provenance; treat a base-role
      // request as neutral rather than penalising every candidate.
      score += 0;
    }

    // Prefer assets already proven in other episodes — they are likely warm in
    // the local disk cache, which shaves download time off the render.
    score += Math.min(candidate.useCount ?? 0, 5) * 0.5;

    return score;
  }

  /** Load and memoise all registry rows of a kind for this pass. */
  private async load(kind: AssetKind): Promise<AssetProvenance[]> {
    const cached = this.pool.get(kind);
    if (cached) return cached;
    const rows = await this.registry.listByKind(kind, 500);
    this.pool.set(kind, rows);
    return rows;
  }
}

export const timelineAssetBinder = new TimelineAssetBinder();
