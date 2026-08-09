/**
 * Sound-effect trigger dictionary.
 *
 * Deterministic word/phrase → effect mapping. No LLM: matching a trigger word is
 * exactly the kind of task where a dictionary beats a model on cost, latency and
 * predictability.
 *
 * Multilingual by design. The pipeline already supports English, Hindi,
 * Hinglish and Sanskrit, so Devanagari triggers sit alongside English ones —
 * a Hindi episode would otherwise get no effects at all.
 *
 * Restraint is deliberate. An educational podcast peppered with effects is
 * worse than one with none, so `MAX_SFX_PER_MINUTE` caps density and `priority`
 * decides which cues survive when they collide.
 */

import type { SFXCategory } from '../schema/audio.schema';

export interface SFXTrigger {
  /** Lowercase words/phrases that fire this effect. */
  patterns: string[];
  /**
   * Require a whole-word match, disallowing the usual inflections.
   *
   * Most patterns are deliberately stems ('door clos', 'fire crackl', 'footstep')
   * and must accept -s/-ed/-ing. But for a few short words an inflection changes
   * the meaning entirely: 'train' + 'ing' matches "training", which would put a
   * passing locomotive under a sentence about astronaut training. Set this for
   * those.
   */
  exactWord?: boolean;
  assetId: string;
  category: SFXCategory;
  /** Higher survives collision resolution. */
  priority: number;
  volumeDb: number;
  /**
   * Negative fires slightly EARLY, which reads as deliberate. Landing late
   * reads as a bug — see the accuracy-ladder note in the architecture doc.
   */
  offsetMs: number;
}

export const SFX_TRIGGERS: SFXTrigger[] = [
  // ── Doors & movement ──────────────────────────────────────────────────
  {
    patterns: ['door open', 'opened the door', 'door creak', 'दरवाज़ा खुल', 'दरवाजा खुल'],
    assetId: 'sfx_door_open',
    category: 'door',
    priority: 60,
    volumeDb: -14,
    offsetMs: -120,
  },
  {
    patterns: ['door clos', 'door shut', 'slammed', 'दरवाज़ा बंद', 'दरवाजा बंद'],
    assetId: 'sfx_door_close',
    category: 'door',
    priority: 60,
    volumeDb: -14,
    offsetMs: -120,
  },
  {
    patterns: ['footstep', 'walked in', 'walking', 'क़दम', 'कदम', 'चलते'],
    assetId: 'sfx_footsteps',
    category: 'footsteps',
    priority: 40,
    volumeDb: -18,
    offsetMs: -100,
  },

  // ── Weather ───────────────────────────────────────────────────────────
  {
    patterns: ['thunder', 'lightning', 'बिजली', 'गरज'],
    assetId: 'sfx_thunder',
    category: 'weather',
    priority: 80,
    volumeDb: -12,
    offsetMs: -150,
  },
  {
    patterns: ['rain', 'downpour', 'बारिश', 'वर्षा'],
    assetId: 'sfx_rain_start',
    category: 'weather',
    priority: 55,
    volumeDb: -18,
    offsetMs: -100,
  },
  {
    patterns: ['gust of wind', 'wind howl', 'तेज़ हवा', 'तेज हवा'],
    assetId: 'sfx_wind_gust',
    category: 'wind',
    priority: 45,
    volumeDb: -18,
    offsetMs: -120,
  },

  // ── Impacts ───────────────────────────────────────────────────────────
  {
    patterns: ['explosion', 'exploded', 'blast', 'धमाका', 'विस्फोट'],
    assetId: 'sfx_explosion',
    category: 'explosion',
    priority: 90,
    volumeDb: -10,
    offsetMs: -150,
  },
  {
    patterns: ['glass break', 'shattered', 'कांच टूट', 'काँच टूट'],
    assetId: 'sfx_glass_break',
    category: 'glass',
    priority: 75,
    volumeDb: -13,
    offsetMs: -120,
  },
  {
    patterns: ['sword', 'blade clash', 'तलवार'],
    assetId: 'sfx_sword_clash',
    category: 'weapon',
    priority: 70,
    volumeDb: -13,
    offsetMs: -130,
  },

  // ── Animals & vehicles ────────────────────────────────────────────────
  {
    patterns: ['horse', 'gallop', 'घोड़ा', 'घोड़े'],
    assetId: 'sfx_horse_gallop',
    category: 'animal',
    priority: 55,
    volumeDb: -16,
    offsetMs: -120,
  },
  {
    patterns: ['rocket', 'launch', 'liftoff', 'रॉकेट'],
    assetId: 'sfx_rocket_launch',
    category: 'vehicle',
    priority: 75,
    volumeDb: -12,
    offsetMs: -150,
  },
  {
    // Exact: 'train' + 'ing' would otherwise fire on "training".
    patterns: ['train', 'ट्रेन', 'रेलगाड़ी'],
    exactWord: true,
    assetId: 'sfx_train_pass',
    category: 'vehicle',
    priority: 50,
    volumeDb: -17,
    offsetMs: -130,
  },

  // ── Objects ───────────────────────────────────────────────────────────
  {
    patterns: ['bell rang', 'bell ring', 'घंटी'],
    assetId: 'sfx_bell',
    category: 'bell',
    priority: 60,
    volumeDb: -15,
    offsetMs: -110,
  },
  {
    patterns: ['clock tick', 'ticking', 'घड़ी'],
    assetId: 'sfx_clock_tick',
    category: 'time',
    priority: 45,
    volumeDb: -19,
    offsetMs: -100,
  },
  {
    patterns: ['turned the page', 'page turn', 'पन्ना पलट', 'पेज पलट'],
    assetId: 'sfx_paper_turn',
    category: 'paper',
    priority: 35,
    volumeDb: -20,
    offsetMs: -90,
  },
  {
    patterns: ['typing', 'keyboard', 'टाइप'],
    assetId: 'sfx_typing',
    category: 'typing',
    priority: 35,
    volumeDb: -20,
    offsetMs: -100,
  },
  {
    patterns: ['phone rang', 'phone ring', 'फ़ोन बज', 'फोन बज'],
    assetId: 'sfx_phone_ring',
    category: 'phone',
    priority: 60,
    volumeDb: -15,
    offsetMs: -110,
  },
  {
    patterns: ['fire crackl', 'flames', 'आग'],
    assetId: 'sfx_fire_crackle',
    category: 'fire',
    priority: 45,
    volumeDb: -18,
    offsetMs: -110,
  },
  {
    patterns: ['water splash', 'splash', 'छपाक', 'पानी'],
    assetId: 'sfx_water_splash',
    category: 'water',
    priority: 50,
    volumeDb: -16,
    offsetMs: -110,
  },
  {
    patterns: ['heartbeat', 'heart pound', 'धड़कन'],
    assetId: 'sfx_heartbeat',
    category: 'body',
    priority: 65,
    volumeDb: -16,
    offsetMs: -100,
  },
  {
    patterns: ['applause', 'clapping', 'तालियाँ', 'तालियां'],
    assetId: 'sfx_applause',
    category: 'crowd',
    priority: 55,
    volumeDb: -15,
    offsetMs: -100,
  },

  // ── Narrative events (added after a real episode planned ZERO effects) ────
  //
  // A 5-minute Apollo 11 storytelling episode matched exactly one trigger, and
  // that one was the false positive ter-RAIN. Meanwhile the script was full of
  // moments that obviously want sound: "the Eagle landed", "the engine fired",
  // "the alarm sounded", "radio static", "the hatch opened". None of those had a
  // trigger, so the whole SFX layer stayed empty.
  //
  // These cover the events that actually recur in historical, scientific and
  // exploration narratives — the material this platform generates most.
  {
    patterns: ['touchdown', 'touched down', 'landed', 'landing gear', 'उतर गया', 'लैंड'],
    assetId: 'sfx_landing_thud',
    category: 'vehicle',
    priority: 80,
    volumeDb: -12,
    offsetMs: -120,
  },
  {
    patterns: ['engine roar', 'engines fired', 'engine ignit', 'ignition', 'thrust', 'इंजन'],
    assetId: 'sfx_engine_rumble',
    category: 'vehicle',
    priority: 78,
    volumeDb: -13,
    offsetMs: -140,
  },
  {
    patterns: ['countdown', 'three, two, one', 'ten, nine', 'काउंटडाउन'],
    assetId: 'sfx_countdown_beep',
    category: 'ui',
    priority: 72,
    volumeDb: -16,
    offsetMs: -100,
  },
  {
    patterns: ['alarm sound', 'alarm blar', 'alarm went off', 'siren', 'अलार्म'],
    assetId: 'sfx_alarm',
    category: 'ui',
    priority: 76,
    volumeDb: -15,
    offsetMs: -110,
  },
  {
    patterns: ['radio static', 'crackled over the radio', 'transmission', 'रेडियो'],
    assetId: 'sfx_radio_static',
    category: 'phone',
    priority: 70,
    volumeDb: -17,
    offsetMs: -110,
  },
  {
    patterns: ['machine hum', 'computer', 'instrument panel', 'switch flick', 'मशीन'],
    assetId: 'sfx_machine_beep',
    category: 'ui',
    priority: 60,
    volumeDb: -18,
    offsetMs: -100,
  },
  {
    // Exact: 'hatch' + 'ed' would fire on "a plan hatched" / "the eggs hatched".
    // Devanagari forms included so a Hindi episode is not silently English-only —
    // this was the last trigger in the table with no Hindi pattern at all.
    patterns: ['hatch open', 'airlock', 'hatch', 'हैच', 'एयरलॉक'],
    exactWord: true,
    assetId: 'sfx_hatch',
    category: 'door',
    priority: 62,
    volumeDb: -15,
    offsetMs: -110,
  },
  {
    patterns: ['bubbl', 'beaker', 'test tube', 'chemical reaction', 'प्रयोगशाला'],
    assetId: 'sfx_lab_bubble',
    category: 'water',
    priority: 55,
    volumeDb: -18,
    offsetMs: -100,
  },
  {
    patterns: ['earthquake', 'rumbl', 'tremor', 'भूकंप'],
    assetId: 'sfx_rumble',
    category: 'explosion',
    priority: 74,
    volumeDb: -14,
    offsetMs: -130,
  },
  {
    patterns: ['whoosh', 'swept past', 'rushed past', 'सरसराहट'],
    assetId: 'sfx_whoosh',
    category: 'magic',
    priority: 52,
    volumeDb: -17,
    offsetMs: -100,
  },
];

/**
 * Density cap. Above roughly two effects a minute an educational podcast starts
 * to feel like a radio drama, which distracts from the content.
 */
export const MAX_SFX_PER_MINUTE = 2;

/** Minimum gap between two cues so they never stack into mush. */
export const MIN_SFX_GAP_MS = 4000;

export interface SFXMatch {
  trigger: SFXTrigger;
  /** Word index where the match started — drives tier-1 proportional sync. */
  wordIndex: number;
  matchedPattern: string;
}

/**
 * Find the FIRST trigger match in a line. One effect per line at most: the cap
 * exists so a vivid sentence doesn't fire four cues at once.
 *
 * Returns null when nothing matches, which is the common case.
 */
/** Regex-special characters that could appear in a pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cache of compiled matchers. Patterns are static, so compile once.
 */
const matcherCache = new Map<string, RegExp>();

/**
 * Build a word-aware matcher for one pattern.
 *
 * Plain `indexOf` matched inside words, so "rough terrain" fired a RAIN effect
 * (ter-RAIN) — a Moon landing with rainfall under it. `\b` cannot fix this: in
 * JavaScript `\w` is `[A-Za-z0-9_]`, so `\b` never matches beside Devanagari and
 * every Hindi trigger would break.
 *
 * So the boundary is expressed as an explicit ASCII-letter guard:
 *
 *   LEADING  — the pattern must not continue a Latin word. Devanagari and
 *              punctuation both satisfy this, so Hindi and Hinglish still match.
 *   TRAILING — allow the common inflections, because many patterns are
 *              deliberately stems ('footstep', 'door clos', 'fire crackl',
 *              'bell ring'). Anything else must be a non-letter, which is what
 *              rejects "rainbow" while accepting "raining".
 */
function matcherFor(pattern: string, exactWord = false): RegExp {
  const key = `${exactWord ? 'x:' : 's:'}${pattern}`;
  const cached = matcherCache.get(key);
  if (cached) return cached;

  const inflections = exactWord ? '' : '(?:s|es|ed|d|ing|e)?';
  const re = new RegExp(
    `(?<![a-z0-9])${escapeRegex(pattern)}${inflections}(?![a-z0-9])`,
    'i'
  );
  matcherCache.set(key, re);
  return re;
}

export function matchTriggers(text: string): SFXMatch | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  let best: SFXMatch | null = null;

  for (const trigger of SFX_TRIGGERS) {
    for (const pattern of trigger.patterns) {
      const found = matcherFor(pattern, trigger.exactWord).exec(lower);
      if (!found) continue;
      const at = found.index;

      // Word index of the match, for proportional timing.
      const wordIndex = lower.slice(0, at).split(/\s+/).filter(Boolean).length;
      const candidate: SFXMatch = { trigger, wordIndex, matchedPattern: pattern };

      // Prefer the higher-priority effect when a line matches several.
      if (!best || trigger.priority > best.trigger.priority) best = candidate;
    }
  }

  return best;
}

/**
 * Tier-1 word synchronisation: estimate when a word is spoken by interpolating
 * through the line's duration.
 *
 * Accuracy ~±300ms. Tier 2 (TTS timepoints) and tier 3 (forced alignment) can
 * replace this without any schema change — only the resolver improves.
 */
export function estimateWordOffsetMs(
  wordIndex: number,
  totalWords: number,
  lineDurationMs: number
): number {
  if (totalWords <= 0 || lineDurationMs <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, wordIndex / totalWords));
  return Math.round(ratio * lineDurationMs);
}
