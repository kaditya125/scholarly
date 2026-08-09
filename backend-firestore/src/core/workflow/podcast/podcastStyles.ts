/**
 * PodcastStyleConfig — the single source of truth for what each podcast style IS.
 *
 * The six styles the UI offers were previously labels only. Three of them
 * ('Storytelling', 'Documentary', 'Solo Narration') all mapped to the same
 * `speakerStyle: 'solo_narrator'`, and 'Debate' mapped to 'discussion' — which
 * the planner described as "two co-hosts". Generating one topic six times
 * therefore produced four outputs, three of them byte-for-byte identical.
 *
 * A style is not a speaker count. It is a production format: who speaks, how the
 * material is structured, whether questions drive it or narration does, how long
 * turns run, and how much music and atmosphere sit underneath. All of that lives
 * here, as DATA, so the planner, the script generator and the AI Director all
 * read the same definition instead of each inventing their own.
 *
 * Adding a style is an entry in this file plus a UI label. It is deliberately not
 * six parallel prompt systems.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** The six production formats offered in the studio. */
export type PodcastStyleId =
  | 'teacher_student'
  | 'storytelling'
  | 'documentary'
  | 'interview'
  | 'debate'
  | 'solo_narration';

export const PODCAST_STYLE_IDS: readonly PodcastStyleId[] = [
  'teacher_student',
  'storytelling',
  'documentary',
  'interview',
  'debate',
  'solo_narration',
];

/**
 * How speakers are cast. Distinct from the count: 'narrator_expert' and
 * 'host_guest' are both two voices but behave nothing alike.
 */
export type SpeakerModel =
  | 'teacher_student'
  | 'narrator'
  | 'narrator_expert'
  | 'host_guest'
  | 'two_opposing_speakers'
  | 'single_narrator';

/** What drives the episode forward. */
export type ConversationMode =
  | 'socratic'
  | 'narrative'
  | 'interview'
  | 'debate'
  | 'guided_narration';

export type QuestionFrequency = 'very_low' | 'low' | 'medium' | 'high';

/** One cast member, with the personality the script must honour. */
export interface StyleSpeakerSpec {
  /** Role label used for voice lookup — must match a tts.config.json voice key. */
  role: string;
  /** Traits the script writer must express through this speaker. */
  personality: string;
  /** What this speaker is FOR, so the writer knows when to use them. */
  purpose: string;
}

export interface PodcastStyleConfig {
  id: PodcastStyleId;
  /** The exact label shown in the studio UI. */
  label: string;
  /** One line for logs and the inspector. */
  summary: string;

  // ── Casting ──────────────────────────────────────────────────────────────
  speakerModel: SpeakerModel;
  speakerCount: number;
  speakers: StyleSpeakerSpec[];

  // ── Behaviour ────────────────────────────────────────────────────────────
  conversationMode: ConversationMode;
  questionFrequency: QuestionFrequency;

  /**
   * Director/Producer knobs, 0..1. These are the values the AI Director reads,
   * which is what makes music and atmosphere differ per style rather than being
   * a single global setting.
   */
  storytellingIntensity: number;
  emotionalVariation: number;
  cinematicIntensity: number;
  educationalInteraction: number;

  // ── Structure ────────────────────────────────────────────────────────────
  /** The beats an episode of this style moves through, in order. */
  structure: string[];
  /** How the very first line must open. */
  openingRule: string;
  /** Format-specific dialogue law. The strongest differentiator in practice. */
  dialogueRules: string[];
  /** Turn-length mix, so pacing differs audibly between styles. */
  turnLengthGuidance: string;
  /** Phrases that would break the illusion of this format. */
  avoid: string[];

  // ── Audio intent (consumed by the Director's planners) ───────────────────
  /** Free-text intent recorded on the plan for the inspector. */
  audioIntent: string;
}

// ---------------------------------------------------------------------------
// The six styles
// ---------------------------------------------------------------------------

const TEACHER_STUDENT: PodcastStyleConfig = {
  id: 'teacher_student',
  label: 'Teacher & Student',
  summary: 'A Socratic learning conversation built around misconceptions.',
  speakerModel: 'teacher_student',
  speakerCount: 2,
  speakers: [
    {
      role: 'Teacher',
      personality:
        'Knowledgeable, patient, encouraging, clear. Socratic — leads with questions rather than declarations. Willing to challenge the student.',
      purpose:
        'Explains, corrects misconceptions, sets mini challenges, gives feedback and reinforces.',
    },
    {
      role: 'Student',
      personality:
        'Curious, relatable, sometimes genuinely confused. Voices the doubt a real learner would have and occasionally makes the common mistake.',
      purpose:
        'Represents the listener. Reacts, misunderstands productively, connects ideas, attempts the challenge.',
    },
  ],
  conversationMode: 'socratic',
  questionFrequency: 'medium',
  storytellingIntensity: 0.4,
  emotionalVariation: 0.55,
  cinematicIntensity: 0.3,
  educationalInteraction: 0.9,
  structure: [
    'Teacher poses a puzzle or counter-intuitive framing',
    'Student reacts',
    'Student voices a misconception',
    'Teacher corrects it directly',
    'Concrete example or analogy',
    'Student connects it to something familiar',
    'Teacher goes deeper',
    'Mini challenge posed to the student',
    'Student attempts it (may get it partly wrong)',
    'Teacher gives feedback',
    'Concept reinforced in one line',
  ],
  openingRule:
    'Open with the Teacher posing a puzzle or a counter-intuitive question — never with a topic announcement.',
  dialogueRules: [
    'Do NOT alternate question→answer→question→answer. The spine is explanation → reaction → misconception → correction.',
    'The Student must never ask an obvious question purely to create dialogue. Every question should be one a real learner would actually have.',
    'The Student should be wrong at least once, in the way learners are actually wrong, and be corrected without being belittled.',
    'Include at least one mini challenge the Student attempts.',
    'The Teacher addresses the Student by name when checking understanding or encouraging.',
  ],
  turnLengthGuidance:
    'Teacher turns 15–30 seconds when explaining; Student turns 1–5 seconds when reacting, up to 10 when attempting a challenge.',
  avoid: ['Very good question', "That's right", 'Absolutely', 'Correct', 'Indeed'],
  audioIntent:
    'Restrained. Light educational bed, minimal effects. Clarity outranks atmosphere.',
};

const STORYTELLING: PodcastStyleConfig = {
  id: 'storytelling',
  label: 'Storytelling',
  summary: 'A narrative journey with dramatic arc and cinematic sound.',
  speakerModel: 'narrator',
  speakerCount: 1,
  speakers: [
    {
      role: 'Narrator',
      personality:
        'A storyteller. Vivid, atmospheric, emotionally adaptive. Slows for weight, quickens for action.',
      purpose:
        'Carries the entire narrative — scene, character, tension, revelation.',
    },
  ],
  conversationMode: 'narrative',
  questionFrequency: 'very_low',
  storytellingIntensity: 1.0,
  emotionalVariation: 0.9,
  cinematicIntensity: 0.95,
  educationalInteraction: 0.2,
  structure: [
    'Hook — drop the listener into a moment',
    'Setting established in sensory detail',
    'The people involved',
    'The conflict',
    'Rising tension',
    'Turning point',
    'Climax',
    'Consequences',
    'Reflection on why it mattered',
  ],
  openingRule:
    'Begin INSIDE the story — a date, a place, a moment. Never "Today we are going to talk about…". Example shape: "January 14, 1761. The sun was rising over Panipat."',
  dialogueRules: [
    'This is narration, not conversation. Sustained prose, not exchanges.',
    'Historical figures may be dramatized sparingly, but NEVER invent a quotation and never present a reconstruction as a verified quote.',
    'Write for the ear: concrete images, short sentences at moments of tension.',
    'Withhold the outcome until the climax. Do not summarise the ending in the opening.',
    'Let one beat land per paragraph rather than stacking facts.',
  ],
  turnLengthGuidance:
    'Long narrative passages of 30–60 seconds, broken by short 3–5 second lines at dramatic beats.',
  avoid: [
    'Today we are going to talk about',
    'In this episode',
    'Let us begin',
    'As we all know',
  ],
  audioIntent:
    'Full cinematic treatment. Scored throughout, environmental ambience matching each scene, effects on story events, silence before revelations.',
};

const DOCUMENTARY: PodcastStyleConfig = {
  id: 'documentary',
  label: 'Documentary',
  summary: 'Narration-led investigation with expert commentary and evidence.',
  speakerModel: 'narrator_expert',
  speakerCount: 2,
  speakers: [
    {
      role: 'Narrator',
      personality:
        'Cinematic, neutral, authoritative. Drives the investigation and frames every question.',
      purpose:
        'Owns the through-line. Introduces context, poses the mystery, delivers the conclusion.',
    },
    {
      role: 'Subject Expert',
      personality:
        'Analytical, precise, insightful. Speaks as a specialist being cited, not as a guest being interviewed.',
      purpose:
        'Supplies explanation, interpretation and the technical nuance the narrator cannot assert alone.',
    },
  ],
  conversationMode: 'narrative',
  questionFrequency: 'low',
  storytellingIntensity: 0.85,
  emotionalVariation: 0.7,
  cinematicIntensity: 0.8,
  educationalInteraction: 0.4,
  structure: [
    'Cold open on a striking fact or image',
    'The question or mystery',
    'Historical or scientific context',
    'Expert explanation',
    'Evidence',
    'Counterpoint or complication',
    'The discovery that resolves it',
    'Consequences',
    'Conclusion',
  ],
  openingRule:
    'Cold open. The Narrator states something concrete and slightly unsettling before any framing.',
  dialogueRules: [
    'This must NOT read as an interview. The Narrator never asks the Expert a question.',
    'The Expert appears as a cited voice: the Narrator sets up an idea, the Expert delivers the substance, the Narrator resumes.',
    'Narration is dominant — roughly two-thirds of the words belong to the Narrator.',
    'Every claim is attributed or evidenced. Say what is known versus what is inferred.',
    'The Expert never addresses the Narrator directly and never says "you".',
  ],
  turnLengthGuidance:
    'Narrator 20–40 seconds; Expert 10–25 seconds, entering only where authority is required.',
  avoid: ['So tell me', 'My next question', 'Welcome to the show', 'Thanks for joining'],
  audioIntent:
    'Heavy but disciplined: atmospheric bed throughout, dramatic transitions between acts, subtle effects. Narration always dominant in the mix.',
};

const INTERVIEW: PodcastStyleConfig = {
  id: 'interview',
  label: 'Interview',
  summary: 'A real conversation where each question reacts to the last answer.',
  speakerModel: 'host_guest',
  speakerCount: 2,
  speakers: [
    {
      role: 'Host',
      personality:
        'Curious, professional, well prepared. Listens and reacts rather than working through a list.',
      purpose:
        'Opens, probes, follows up, challenges gently, keeps the listener oriented.',
    },
    {
      role: 'Subject Expert',
      personality:
        'Expert with opinions and a personality. Speaks from experience, allowed to disagree.',
      purpose:
        'Supplies depth, anecdote, nuance and the occasional strong claim.',
    },
  ],
  conversationMode: 'interview',
  questionFrequency: 'high',
  storytellingIntensity: 0.35,
  emotionalVariation: 0.6,
  cinematicIntensity: 0.25,
  educationalInteraction: 0.65,
  structure: [
    'Brief opening and who the guest is',
    'One broad opening question',
    'Guest explanation',
    'Host follow-up drawn from that answer',
    'Personal insight or anecdote',
    'A gentle challenge',
    'Counterpoint',
    'Concrete example',
    'A deeper question',
    'Practical implication',
    'Close',
  ],
  openingRule:
    'A short, warm opening that establishes who the guest is and why they can speak to this — then straight into one broad question.',
  dialogueRules: [
    'CRITICAL: every Host question must react to what the Guest just said. Quote or paraphrase them before asking.',
    'Never fire independent questions in sequence — that is the scripted-interview smell this style exists to avoid.',
    'The Host may interrupt briefly to confirm understanding ("That is the idea where…?").',
    'Allow disagreement, clarification and humour where it fits.',
    'The Guest may go off on a short tangent if it illuminates the topic.',
  ],
  turnLengthGuidance:
    'Host 3–10 seconds; Guest 15–40 seconds. Occasional 1–2 second Host reactions.',
  avoid: ['My next question is', 'Moving on', 'Question number', 'Very good question'],
  audioIntent:
    'Minimal. A light bed under the intro and outro only; the conversation carries itself.',
};

const DEBATE: PodcastStyleConfig = {
  id: 'debate',
  label: 'Debate',
  summary: 'Two positions in genuine intellectual tension, with a moderator.',
  speakerModel: 'two_opposing_speakers',
  speakerCount: 3,
  speakers: [
    {
      role: 'Host',
      personality: 'Neutral moderator. Frames the question and keeps it civil.',
      purpose: 'Opens, hands over, presses for evidence, draws the nuanced conclusion.',
    },
    {
      role: 'Subject Expert',
      personality:
        'Holds position A with conviction and evidence. Concedes a fair point when one is made.',
      purpose: 'Argues one side and refines it under pressure.',
    },
    {
      role: 'Teacher',
      personality:
        'Holds position B with conviction. Grants what is true in A before showing what it misses.',
      purpose: 'Argues the opposing side and complicates the easy answer.',
    },
  ],
  conversationMode: 'debate',
  questionFrequency: 'medium',
  storytellingIntensity: 0.2,
  emotionalVariation: 0.75,
  cinematicIntensity: 0.4,
  educationalInteraction: 0.7,
  structure: [
    'Moderator frames the contested question',
    'Position A stated',
    'Position B stated',
    'Evidence for A',
    'Counterargument from B',
    'Counterargument from A',
    'Further evidence',
    'A genuine concession',
    'The strongest form of each argument',
    'Nuanced resolution — not a winner',
  ],
  openingRule:
    'The moderator states the contested question in one sentence, making clear that informed people genuinely disagree.',
  dialogueRules: [
    'Intellectual tension, never hostility. The aim is that the listener understands both sides.',
    'Each speaker must engage the ACTUAL argument just made, not a caricature of it.',
    'Each side concedes at least one legitimate point during the episode.',
    'Positions should be refined under pressure rather than repeated louder.',
    'Never "You are wrong", "Absolutely not", or "That is completely false" unless the claim is genuinely indefensible.',
  ],
  turnLengthGuidance:
    'Arguments 15–30 seconds; rebuttals 5–15 seconds; moderator 3–8 seconds.',
  avoid: ['You are wrong', 'Absolutely not', 'That is completely false', 'Nonsense'],
  audioIntent:
    'Restrained but present. A tense low bed, a short stinger between positions, no effects over speech.',
};

const SOLO_NARRATION: PodcastStyleConfig = {
  id: 'solo_narration',
  label: 'Solo Narration',
  summary: 'One voice guiding the listener directly, kept alive by variation.',
  speakerModel: 'single_narrator',
  speakerCount: 1,
  speakers: [
    {
      role: 'Narrator',
      personality:
        'Confident, natural, engaging. Speaks TO the listener, not at them. Emotionally adaptive.',
      purpose: 'Explains, illustrates and recaps entirely alone.',
    },
  ],
  conversationMode: 'guided_narration',
  questionFrequency: 'very_low',
  storytellingIntensity: 0.65,
  emotionalVariation: 0.7,
  cinematicIntensity: 0.55,
  educationalInteraction: 0.45,
  structure: [
    'Hook',
    'Why this matters to the listener',
    'Core explanation',
    'A concrete example',
    'One deeper layer',
    'Recap',
    'The single key takeaway',
  ],
  openingRule:
    'Open with a hook aimed straight at the listener — an image, a question, or something surprising.',
  dialogueRules: [
    'One voice only. The risk is monotony, so vary deliberately.',
    'Use rhetorical questions and answer them ("Simple, right? Not quite.").',
    'Address the listener directly as "you".',
    'Vary sentence length hard: follow a long explanatory sentence with a three-word one.',
    'Recap in different words than the original explanation, never verbatim.',
  ],
  turnLengthGuidance:
    'Continuous narration in 20–40 second paragraphs, punctuated by very short emphatic lines.',
  avoid: ['As I said', 'Like I mentioned', 'Again', 'To reiterate'],
  audioIntent:
    'Moderate. A steady bed with gentle scene shifts; occasional effects for emphasis only.',
};

// ---------------------------------------------------------------------------
// Registry + lookup
// ---------------------------------------------------------------------------

export const PODCAST_STYLES: Record<PodcastStyleId, PodcastStyleConfig> = {
  teacher_student: TEACHER_STUDENT,
  storytelling: STORYTELLING,
  documentary: DOCUMENTARY,
  interview: INTERVIEW,
  debate: DEBATE,
  solo_narration: SOLO_NARRATION,
};

/** The default when nothing is specified — matches the legacy default. */
export const DEFAULT_PODCAST_STYLE: PodcastStyleId = 'teacher_student';

/**
 * Resolve a style from whatever the caller has.
 *
 * Accepts the new ids, the UI labels, and the LEGACY `speakerStyle` values, so an
 * older client or a stored draft still lands somewhere sensible. Legacy
 * 'solo_narrator' maps to solo_narration — the safest of the three formats it
 * used to conflate, since it makes no cinematic or narrative promises.
 */
export function resolvePodcastStyle(input?: string | null): PodcastStyleConfig {
  if (!input) return PODCAST_STYLES[DEFAULT_PODCAST_STYLE];

  const key = String(input).trim().toLowerCase().replace(/[\s&-]+/g, '_');

  if (key in PODCAST_STYLES) {
    return PODCAST_STYLES[key as PodcastStyleId];
  }

  const aliases: Record<string, PodcastStyleId> = {
    // UI labels
    teacher___student: 'teacher_student',
    teacher_student: 'teacher_student',
    solo_narration: 'solo_narration',
    // Legacy speakerStyle values
    solo_narrator: 'solo_narration',
    discussion: 'debate',
    mentor: 'teacher_student',
    // Common variants
    story: 'storytelling',
    doc: 'documentary',
    narrative: 'storytelling',
  };

  const mapped = aliases[key];
  return PODCAST_STYLES[mapped ?? DEFAULT_PODCAST_STYLE];
}

/** True when the value names a real style. Used to validate requests. */
export function isPodcastStyleId(value: unknown): value is PodcastStyleId {
  return typeof value === 'string' && value in PODCAST_STYLES;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const QUESTION_GUIDANCE: Record<QuestionFrequency, string> = {
  very_low:
    'Almost no direct questions. Any question is rhetorical and immediately answered.',
  low: 'Questions are rare and used only to open a new act.',
  medium:
    'Questions appear regularly but never in consecutive turns, and each one must earn its place.',
  high:
    'Questions drive the episode — but each must follow from the previous answer, never from a list.',
};

/**
 * The style block injected into the script-writing prompt.
 *
 * Built from the config so there is exactly one description of each format. The
 * previous prompt said only "conversational and natural", which is why every
 * style produced the same shape of dialogue.
 */
export function buildStylePromptBlock(style: PodcastStyleConfig): string {
  const cast = style.speakers
    .map((s) => `  - ${s.role}: ${s.personality} PURPOSE: ${s.purpose}`)
    .join('\n');

  const beats = style.structure.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
  const rules = style.dialogueRules.map((r) => `  - ${r}`).join('\n');

  return `
PRODUCTION FORMAT: ${style.label.toUpperCase()} — ${style.summary}
This format is not a label. It dictates the architecture of the episode.

CAST (${style.speakerCount} speaker${style.speakerCount === 1 ? '' : 's'}):
${cast}

EPISODE ARC for this format — follow this shape, not a generic intro/body/outro:
${beats}

OPENING: ${style.openingRule}

FORMAT LAW (these are what make this style distinct — follow them exactly):
${rules}

QUESTIONS: ${QUESTION_GUIDANCE[style.questionFrequency]}

PACING: ${style.turnLengthGuidance}

NEVER WRITE THESE PHRASES: ${style.avoid.map((a) => `"${a}"`).join(', ')}
`.trim();
}

/** One-line role description for the PLANNING prompt. */
export function describeCastForPlanner(style: PodcastStyleConfig): string {
  if (style.speakerCount === 1) return `a single ${style.speakers[0].role}`;
  const roles = style.speakers.map((s) => s.role);
  const last = roles.pop();
  return `${roles.join(', ')} and ${last}`;
}

/**
 * Director/Producer parameters for a style.
 *
 * Returned as a plain object so it can be persisted on the plan and read by the
 * Director without importing this module.
 */
export function styleDirectorParams(style: PodcastStyleConfig): {
  podcastStyle: PodcastStyleId;
  speakerModel: SpeakerModel;
  conversationMode: ConversationMode;
  questionFrequency: QuestionFrequency;
  storytellingIntensity: number;
  emotionalVariation: number;
  cinematicIntensity: number;
  educationalInteraction: number;
} {
  return {
    podcastStyle: style.id,
    speakerModel: style.speakerModel,
    conversationMode: style.conversationMode,
    questionFrequency: style.questionFrequency,
    storytellingIntensity: style.storytellingIntensity,
    emotionalVariation: style.emotionalVariation,
    cinematicIntensity: style.cinematicIntensity,
    educationalInteraction: style.educationalInteraction,
  };
}

/**
 * Map the style's 0..1 cinematic dial onto the Director's three-band setting.
 *
 * The Director takes 'subtle' | 'balanced' | 'dramatic', so a storytelling
 * episode at 0.95 becomes 'dramatic' while a teacher/student one at 0.3 stays
 * 'subtle' — which is how one topic ends up with genuinely different scoring.
 */
export function cinematicBandFor(
  style: PodcastStyleConfig
): 'subtle' | 'balanced' | 'dramatic' {
  if (style.cinematicIntensity >= 0.75) return 'dramatic';
  if (style.cinematicIntensity >= 0.45) return 'balanced';
  return 'subtle';
}
