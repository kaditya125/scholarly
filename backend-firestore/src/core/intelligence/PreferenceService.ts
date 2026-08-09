import { PersonalizationPlan } from './types';

/** Learned, continuously-updated student preferences (Task 7). All optional — absence = default. */
export interface StudentPreferences {
  language?: string;                       // 'English' | 'Hindi' | 'Hinglish' | …
  depth?: 'brief' | 'standard' | 'deep';
  preferExamples?: boolean;
  preferDiagrams?: boolean;
  preferTables?: boolean;
  preferShortAnswers?: boolean;
  visualLearner?: boolean;
  // Phase 3 (Task 7) — additional inferred preferences.
  preferAnalogies?: boolean;
  preferFormulas?: boolean;
  preferPractice?: boolean;
  /**
   * Per-signal running confidence (0..1) accumulated via EMA from behavioral observations. A
   * boolean preference only flips once its confidence crosses the threshold, so one interaction
   * never changes how the student is taught.
   */
  signalConfidence?: Record<string, number>;
  updatedAt?: number;
}

/** Behavioral signals the tutor can infer from a student's implicit behavior over time. */
export type InferredSignal = 'diagrams' | 'concise' | 'detailed' | 'examples' | 'analogies' | 'formulas' | 'visual' | 'practice';

/** EMA weight — small so preferences move gradually (needs ~7 consistent observations to cross). */
const INFERENCE_ALPHA = 0.15;
/** Confidence at which an inferred signal becomes an active preference. */
const INFERENCE_THRESHOLD = 0.65;
/** Competing signals — observing one erodes its opposite. */
const OPPOSITE: Partial<Record<InferredSignal, InferredSignal>> = { concise: 'detailed', detailed: 'concise' };

/** Persistence seam so the service is unit-testable without Firestore. */
export interface PreferenceStore {
  get(userId: string): Promise<StudentPreferences | null>;
  set(userId: string, prefs: StudentPreferences): Promise<void>;
}

/** Firestore-backed store (guarded — never throws; a failure degrades to "no preferences"). */
class FirestorePreferenceStore implements PreferenceStore {
  async get(userId: string): Promise<StudentPreferences | null> {
    try {
      const { db } = require('../../config/firebase');
      const snap = await db.collection('users').doc(userId).collection('intelligence').doc('preferences').get();
      return snap.exists ? (snap.data() as StudentPreferences) : null;
    } catch { return null; }
  }
  async set(userId: string, prefs: StudentPreferences): Promise<void> {
    try {
      const { db } = require('../../config/firebase');
      await db.collection('users').doc(userId).collection('intelligence').doc('preferences').set(prefs, { merge: true });
    } catch { /* non-fatal */ }
  }
}

/**
 * StudentPreferenceService (Task 7) — continuously learns how a student likes to be taught
 * (language, depth, examples/diagrams/tables, short vs long) from their messages + feedback, and
 * updates preferences automatically (never asks repeatedly).
 *
 * NOTE (behavior preservation): this increment only LEARNS + STORES preferences and exposes them
 * as a PersonalizationPlan. Injecting them into prompts (which would change output) is a separate,
 * flagged consumption step — so nothing about the current answers changes yet.
 */
export class StudentPreferenceService {
  constructor(private readonly store: PreferenceStore = new FirestorePreferenceStore()) {}

  async get(userId: string): Promise<StudentPreferences> {
    return (await this.store.get(userId)) || {};
  }

  async update(userId: string, partial: StudentPreferences): Promise<void> {
    if (Object.keys(partial).length === 0) return;
    await this.store.set(userId, { ...partial, updatedAt: Date.now() });
  }

  /**
   * Detect explicit preference cues in a student message. Pure — returns only the deltas that
   * were clearly expressed (empty object if none), so we never guess.
   */
  detectFromMessage(message: string): StudentPreferences {
    const m = (message || '').toLowerCase();
    const delta: StudentPreferences = {};
    if (/\b(in hindi|hindi mein|हिंदी)\b/.test(m)) delta.language = 'Hindi';
    else if (/\b(in english)\b/.test(m)) delta.language = 'English';
    else if (/\b(hinglish)\b/.test(m)) delta.language = 'Hinglish';

    if (/\b(briefly|in short|short answer|keep it short|concise|tl;?dr|one line)\b/.test(m)) { delta.depth = 'brief'; delta.preferShortAnswers = true; }
    else if (/\b(in detail|detailed|explain (fully|thoroughly)|deep dive|elaborate|comprehensive)\b/.test(m)) { delta.depth = 'deep'; delta.preferShortAnswers = false; }

    if (/\b(with (an? )?examples?|give examples?|for example)\b/.test(m)) delta.preferExamples = true;
    if (/\b(diagram|draw|visual|figure|illustrat)/.test(m)) { delta.preferDiagrams = true; delta.visualLearner = true; }
    if (/\b(in a table|tabular|table form|as a table)\b/.test(m)) delta.preferTables = true;
    return delta;
  }

  /** Learn from a message and persist any detected cues (guarded, fire-and-forget friendly). */
  async learnFromMessage(userId: string, message: string): Promise<void> {
    const delta = this.detectFromMessage(message);
    if (Object.keys(delta).length > 0) await this.update(userId, delta);
  }

  /**
   * Map an interaction to the implicit behavioral signals it weakly supports (pure). These are
   * softer than the explicit cues in `detectFromMessage` — they accumulate over time rather than
   * setting a preference immediately.
   */
  observationsFromMessage(message: string): InferredSignal[] {
    const m = (message || '').toLowerCase();
    const obs = new Set<InferredSignal>();
    if (/\b(draw|diagram|figure|chart|visuali[sz]e|show me a|picture|sketch)\b/.test(m)) { obs.add('diagrams'); obs.add('visual'); }
    if (/\b(example|for instance|e\.?g\.?)\b/.test(m)) obs.add('examples');
    if (/\b(analogy|like a|similar to|real[- ]world|intuition)\b/.test(m)) obs.add('analogies');
    if (/[=+^]|\bformula|\bequation|\bderivation\b/.test(m)) obs.add('formulas');
    if (/\b(practice|quiz me|questions to solve|exercises?|problems? to solve)\b/.test(m)) obs.add('practice');
    if (/\b(too long|shorter|briefly|in short|concise|just tell me|get to the point)\b/.test(m)) obs.add('concise');
    if (/\b(more detail|elaborate|in ?depth|explain more|thoroughly|expand on)\b/.test(m)) obs.add('detailed');
    return Array.from(obs);
  }

  /** Map a feedback signal to implicit style observations (pure). */
  observationsFromFeedback(signal: string): InferredSignal[] {
    if (signal === 'regenerated') return ['concise'];  // answer likely missed / was too long
    if (signal === 'followup') return ['detailed'];     // student needed more depth
    return [];
  }

  /**
   * PURE weighted-confidence inference. Nudges each observed signal's confidence up via EMA (and
   * decays its opposite), then flips a boolean preference only once confidence crosses the
   * threshold. Returns the next preferences object; never overreacts to a single observation.
   */
  applyInference(prev: StudentPreferences, observations: InferredSignal[], now = Date.now()): StudentPreferences {
    const conf: Record<string, number> = { ...(prev.signalConfidence || {}) };
    for (const s of new Set(observations)) {
      conf[s] = (conf[s] ?? 0) + INFERENCE_ALPHA * (1 - (conf[s] ?? 0));
      const opp = OPPOSITE[s];
      if (opp) conf[opp] = (conf[opp] ?? 0) * (1 - INFERENCE_ALPHA);
    }
    const out: StudentPreferences = { ...prev, signalConfidence: conf, updatedAt: now };
    const on = (s: InferredSignal) => (conf[s] ?? 0) > INFERENCE_THRESHOLD;
    if (on('diagrams') || on('visual')) { out.preferDiagrams = true; out.visualLearner = true; }
    if (on('examples')) out.preferExamples = true;
    if (on('analogies')) out.preferAnalogies = true;
    if (on('formulas')) out.preferFormulas = true;
    if (on('practice')) out.preferPractice = true;
    if (on('concise')) { out.depth = 'brief'; out.preferShortAnswers = true; }
    else if (on('detailed')) { out.depth = 'deep'; out.preferShortAnswers = false; }
    return out;
  }

  /** Accumulate implicit observations and persist (guarded, background-friendly). */
  async learnImplicit(userId: string, observations: InferredSignal[]): Promise<void> {
    if (!userId || observations.length === 0) return;
    const prev = await this.get(userId);
    const next = this.applyInference(prev, observations);
    await this.store.set(userId, next);
  }

  /** Map preferences to the ExecutionPlan's personalization block (pure). */
  toPersonalizationPlan(prefs: StudentPreferences): PersonalizationPlan {
    return {
      language: prefs.language,
      depth: prefs.depth,
      preferExamples: prefs.preferExamples,
      preferDiagrams: prefs.preferDiagrams,
      preferTables: prefs.preferTables,
    };
  }
}

export const studentPreferenceService = new StudentPreferenceService();
