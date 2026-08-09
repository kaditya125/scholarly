import { z } from 'zod';
import { GeminiProvider } from '../../../services/ai/gemini.provider';
import { callStructuredLLM } from '../../../services/ai/structuredLlm';
import { knowledgeService } from '../../knowledge';
import { GroundingBrief, PodcastPlan, ScriptLine } from './types';
import { featureFlags } from '../../../config/featureFlags';
import {
  PodcastStyleConfig,
  buildStylePromptBlock,
  resolvePodcastStyle,
} from './podcastStyles';

const createLinesSchema = (validSpeakers: string[]) => z
  .array(z.object({ 
    speaker: z.string().refine(s => validSpeakers.includes(s), { message: `Speaker must be one of: ${validSpeakers.join(', ')}` }), 
    text: z.string().min(1) 
  }))
  .min(1);

export interface GeneratedScript {
  lines: ScriptLine[];
  totalWords: number;
}

/**
 * Language-specific style instructions injected into the script-writing
 * prompt. Without this, `LANGUAGE: Hinglish` is ambiguous and Gemini
 * defaults to English — which mismatches the Hinglish voice (Hindi
 * Chirp 3 HD) and produces an "English-accented" listen. The rules below
 * force real code-mixed Devanagari + Latin output.
 */
function getLanguageStyleGuide(language: string): string {
  const normalized = (language || '').toLowerCase();

  if (normalized === 'hinglish') {
    return [
      'HINGLISH INSTRUCTIONS (very important):',
      '- Write in natural, conversational Hinglish — the way modern urban Indians actually talk when teaching each other.',
      '- Mix Hindi (in Devanagari script) and English (in Latin script) inside the SAME sentences. Do not write only English.',
      '- Roughly 55–65% of words should be Hindi in Devanagari; the rest English for technical/scientific/academic terms.',
      '- Use Hindi for connectors, feelings, everyday nouns, and conversational glue: तो, मतलब, यानी, चलो, देखो, समझो, अच्छा, बिल्कुल, है ना, थोड़ा, बहुत.',
      '- Keep technical terms, formulas, equations, chapter names, exam names, and modern loanwords in English (photosynthesis, oxygen, exam, syllabus, chapter, JEE, NEET, IIT).',
      '- Grammar and sentence structure should follow Hindi, with English words dropped in as vocabulary. e.g. "ये concept थोड़ा tricky है, but हम इसे simple example से समझेंगे।"',
      '- Numbers and years: write digits (2024, 12) — the voice reads them naturally in Hindi.',
      '- Do NOT transliterate Hindi words into Latin script ("kya", "hai"). Always use Devanagari (क्या, है).',
      '- Do NOT write pure English sentences. Every sentence should have at least a couple of Hindi words.',
    ].join('\n');
  }

  if (normalized === 'hindi') {
    return [
      'HINDI INSTRUCTIONS:',
      '- Write in natural, spoken Hindi in Devanagari script.',
      '- Use everyday conversational Hindi appropriate for the topic and audience.',
      '- Technical/scientific terms can stay in English (photosynthesis, oxygen, algorithm) — write them in Latin script inline where the Hindi equivalent would sound forced or unfamiliar to students.',
      '- Avoid overly Sanskritized or literary Hindi. Prefer common words a student would hear from a teacher.',
      '- Do NOT transliterate Hindi into Latin script. Always use Devanagari.',
    ].join('\n');
  }

  if (normalized === 'sanskrit') {
    return [
      'SANSKRIT INSTRUCTIONS:',
      '- Write in classical Sanskrit in Devanagari script.',
      '- Keep the phrasing clear and pedagogical rather than florid; the audio is for learners.',
    ].join('\n');
  }

  // English (default). No extra guide needed.
  return '';
}

/**
 * ConversationGenerator — the "script" stage. For each planned segment it GROUNDS on the
 * notebook (retrievalService.retrieveContext + graphRetrievalService.getGraphContext), or on
 * the shared NCERT curriculum when there's no notebook, then writes a natural multi-speaker
 * dialogue via callStructuredLLM. Every factual claim is instructed to stay within the
 * retrieved context (no hallucination beyond it). Citations are carried per line.
 */
export class ConversationGenerator {
  /**
   * How the speakers should address each other.
   *
   * Without this, a teacher/student episode reads as two disembodied voices
   * trading facts: nobody is ever named and nobody is deferred to, which is both
   * unnatural and culturally wrong for an Indian classroom. Naming the student
   * also gives the TTS voice a vocative to inflect, which breaks up flat
   * delivery at no cost.
   *
   * Returns '' for styles where this does not apply (solo narration), so the
   * prompt stays clean.
   */
  /**
   * The production format for this plan, or null to write in the legacy generic
   * style.
   *
   * Read from the PLAN, because the plan is all this stage receives. Before the
   * plan carried the style, the script writer had no idea whether it was writing
   * a documentary or a debate — which is why every format came out the same.
   */
  private resolveStyle(plan: PodcastPlan): PodcastStyleConfig | null {
    if (!featureFlags.enhancedPodcastStyles) return null;
    if (!plan.podcastStyle) return null;
    return resolvePodcastStyle(plan.podcastStyle);
  }

  /**
   * Per-segment position note.
   *
   * The legacy version told EVERY format to "open with a short, warm welcome",
   * which is exactly wrong for storytelling (must open inside the scene) and for
   * documentary (must cold-open). With a style present the format's own opening
   * rule wins.
   */
  private positionNote(
    style: PodcastStyleConfig | null,
    isFirst: boolean,
    isLast: boolean,
  ): string {
    if (!style) {
      return isFirst
        ? 'This is the FIRST segment: open with a short, warm welcome that names the episode topic.'
        : isLast
          ? 'This is the LAST segment: include a concise recap of the key points and a friendly sign-off. Sign off ONCE — do not greet again before doing so.'
          : 'This is a middle segment: transition smoothly from the previous topic.';
    }

    if (isFirst) return `This is the FIRST segment. OPENING RULE: ${style.openingRule}`;
    if (isLast) {
      return `This is the LAST segment: land the ending this format calls for — ${
        style.structure[style.structure.length - 1]
      }. Close once, cleanly, and do not greet again.`;
    }
    return 'This is a middle segment: continue the format\'s arc from where the previous segment stopped.';
  }

  /**
   * Craft rules that keep the writing from sounding like a textbook.
   *
   * Split by whether the format has multiple voices: telling a single narrator to
   * "interrupt and react" produced the fake self-interruption that made solo
   * episodes sound broken.
   */
  private craftGuide(style: PodcastStyleConfig | null): string {
    const single = style ? style.speakerCount === 1 : false;

    if (single) {
      return `SOUND LIKE A REAL PODCAST, NOT A TEXTBOOK READ ALOUD:
- One voice only. Hold attention with rhythm, not with fake dialogue — never write the narrator interrupting themselves or asking someone else a question.
- Vary sentence length hard. Follow a long explanatory sentence with a very short one.
- Use rhetorical questions sparingly and always answer them immediately.
- Never announce structure out loud ("in this section we will...", "moving on to point three").
- Never use the same stock phrase twice in the episode.`;
    }

    return `SOUND LIKE A REAL PODCAST, NOT A TEXTBOOK READ ALOUD:
- Speakers interrupt, react and think aloud: "wait, so...", "अच्छा, तो मतलब...", "hmm, that is the part I find odd".
- Vary turn length. Some turns are one short line; occasionally one runs longer.
- No filler pleasantries between every exchange. Cut straight to substance.
- Never announce structure out loud ("in this section we will...", "moving on to point three").
- Never use the same stock phrase twice in the episode.`;
  }

  /**
   * Tell this segment which openers earlier segments already used.
   *
   * Each segment is an independent LLM call with no memory of the others, so all
   * of them independently pick the single most likely acknowledgement — which is
   * how an episode ends up saying "बिल्कुल सही" eleven times. Feeding the spent
   * phrases forward is the same trick `continuityGuide` uses for greetings.
   */
  private spentOpenersGuide(usedOpeners: Set<string>): string {
    if (usedOpeners.size === 0) return '';
    const list = [...usedOpeners].slice(-14).map((p) => `"${p}"`).join(', ');
    return `
ALREADY USED EARLIER IN THIS EPISODE — do not open a turn with any of these again,
find a different way to say it: ${list}`;
  }

  private addressGuide(plan: PodcastPlan): string {
    const teacher = plan.speakers.find((s) =>
      /teacher|mentor|guru|coach|instructor/i.test(s.role)
    );
    const student = plan.speakers.find((s) => /student|learner|pupil/i.test(s.role));
    if (!teacher || !student) return '';

    const honorifics = honorificsFor(plan.language);

    // Is the "name" actually a role label? The planner often returns शिक्षक /
    // छात्र / Teacher / Student rather than a personal name, and the previous
    // version of this guide told the model to address the other speaker BY NAME —
    // which turned into "बिल्कुल छात्र", "ठीक है छात्र" on almost every line.
    const isLabel = (name: string, role: string) =>
      !name ||
      name.toLowerCase() === role.toLowerCase() ||
      ROLE_LABEL_WORDS.some((w) => name.trim() === w);

    const studentNameIsLabel = isLabel(student.name, student.role);

    return `
HOW THEY TALK TO EACH OTHER (teacher/student — follow exactly):

THE SPEAKER LABEL IS NOT A SPOKEN WORD. Each line is already attributed to a
speaker, so the words "${teacher.name}" and "${student.name}" must NOT appear inside
the dialogue as a form of address.${
      studentNameIsLabel
        ? `\n"${student.name}" is a ROLE LABEL, not a name. Never say it out loud.`
        : ''
    }

BANNED — these are the exact patterns that made earlier episodes unlistenable.
Do not write any of them, in any language:
- "बिल्कुल ${student.name}", "ठीक है ${student.name}", "बहुत अच्छे ${student.name}",
  "सही कहा ${student.name}", "हाँ ${student.name}", "अच्छा ${student.name}",
  "सोचो ${student.name}", "${student.name}, अब बताओ"
- The same for "विद्यार्थी", "बच्चों", "बेटा", "दोस्तों".
- The student opening turns with "हाँ सर", "नहीं सर", "अच्छा सर", "ठीक है सर",
  "समझ गया सर", or the equivalent in any language.

BUDGET: across the WHOLE episode, a direct form of address (${honorifics}, or the
other person's name) may appear AT MOST TWICE in total. Not twice per turn — twice
in the episode. Use pronouns and ordinary sentences the rest of the time. Two
people alone in a room do not keep saying each other's titles.

VARY THE TEACHER'S MOVES. Rotate between these rather than reaching for the same
opener. Never reuse any single phrase more than twice in the episode:
- confirm      — "बिल्कुल सही।" / "हाँ, यही बात है।" / "तुम सही दिशा में सोच रहे हो।"
- go deeper    — "इसे एक आसान उदाहरण से समझते हैं।" / "अब यहाँ असली बात सामने आती है।"
- push back    — "हाँ, लेकिन इसमें एक छोटी-सी बात और समझनी होगी।"
- ask          — "अब सोचो, अगर स्थिति उलट जाए तो क्या होगा?" / "तुम्हारे हिसाब से नतीजा क्या होगा?"
- connect      — "अब इसी विचार को अगले नियम से जोड़ते हैं।"

THE STUDENT IS CURIOUS, NOT POLITE FURNITURE. Every student turn must do real
work: clarify, challenge an assumption, ask why or what-if, connect two ideas,
raise a real-world case, or voice a genuine misconception. Never write a turn whose
only content is agreement ("अच्छा, समझ गया") — cut it or replace it with a question.
Good shapes: "तो इसका मतलब..." / "एक मिनट, यहाँ मैं थोड़ा confused हूँ।" /
"लेकिन अगर दोनों बल बराबर हैं, तो वस्तु चलती कैसे है?" /
"क्या mass बढ़ने पर acceleration कम हो जाएगा?"

DO NOT FORCE ALTERNATION. Teacher-student-teacher-student in lockstep sounds
scripted. Let the teacher run 20–40 seconds when an idea needs it, then let the
student cut in where a real learner would. Pedagogical need sets the rhythm.

KEEP THE SCIENCE EXACT. Conversational delivery must not soften the physics:
keep formulas (F = ma, p = mv), units, and distinctions such as action and
reaction acting on DIFFERENT bodies (so they never cancel in one free-body
diagram). Mention exam relevance at most once per segment, and tie it to reasoning
rather than saying "this comes in the exam".`;
  }

  /**
   * Editorial direction for the specific KIND of episode.
   *
   * Without this every podcast type produced the same generic "educational
   * dialogue", so a 3-minute doubt-clearing clip sounded identical to a 30-minute
   * crash course. Real shows have a recognisable format.
   */
  private typeStyle(type: string): string {
    switch ((type || 'custom').toLowerCase()) {
      case 'crash_course':
        return 'FORMAT: a fast, high-density crash course. Move briskly, no small talk, cover ground. Signpost progress ("that is the first of three mechanisms").';
      case 'revision':
      case 'exam_revision':
        return 'FORMAT: a revision session. Assume the listener has already studied this once. Lead with the points most often examined, state them crisply, and repeat only the genuinely high-yield facts.';
      case 'weak_topic':
        return 'FORMAT: targeted remediation of a weak topic. Slow down on the exact step learners get wrong, name the common mistake explicitly, then re-explain from a different angle.';
      case 'doubt':
        return 'FORMAT: answering one specific doubt. Get to the answer within the first few lines, then justify it. Do not deliver a general lecture.';
      case 'current_affairs':
        return 'FORMAT: a current-affairs briefing. Journalistic and factual — what happened, why it matters, what to remember for the exam. Neutral tone, no hype.';
      case 'quiz_review':
        return 'FORMAT: a quiz post-mortem. Walk question by question: what was asked, why the right answer is right, and why the tempting wrong option is wrong.';
      case 'daily':
        return 'FORMAT: a short daily episode. Warm and habitual, like a regular show the listener already follows. Compact, one idea done well.';
      case 'chapter':
        return 'FORMAT: a chapter walkthrough. Follow the chapter\'s own structure so the listener can follow along with the book.';
      default:
        return 'FORMAT: a natural educational conversation. Prioritise clarity and genuine curiosity over performance.';
    }
  }

  /**
   * Continuity rules — the fix for repeated greetings.
   *
   * Segments are written by SEPARATE LLM calls (each needs its own grounding
   * retrieval), and a call that only sees its own segment has no way to know the
   * episode already started. Every segment therefore opened with its own
   * welcome, which is why a finished episode said "नमस्ते दोस्तों" over and over.
   * Passing the running tail plus these rules makes each call CONTINUE the
   * conversation instead of restarting it.
   */
  private continuityGuide(
    isFirst: boolean,
    previousTail: string,
    style: PodcastStyleConfig | null = null,
  ): string {
    if (isFirst) {
      // A greeting is right for a lesson or an interview and completely wrong for
      // a story or a documentary, which must open inside the material.
      const greets =
        !style || style.conversationMode === 'socratic' || style.conversationMode === 'interview';

      return `
CONTINUITY:
- This is the very beginning of the episode.${
        greets
          ? ' Greet the listener ONCE, briefly, and get into the material.'
          : ' Do NOT greet the listener at all. Open straight into the material as the OPENING RULE above requires.'
      }
- Do not promise what "we will cover today" in a list; just start.`;
    }

    return `
CONTINUITY (critical — this is a CONTINUATION, not a new episode):
- The episode is already in progress. Do NOT greet the listener. No "नमस्ते", no "namaste dosto", no "hello everyone", no "welcome back", no "आज हम सीखेंगे".
- Do NOT re-introduce yourself, the speakers, the show, or the topic. The listener has been listening for several minutes already.
- Pick up mid-conversation from the last line below and move the discussion forward.
- Do not restate anything already said; add new information only.
- Vary your sentence openings — do not begin consecutive turns with the same word or phrase.

THE CONVERSATION SO FAR (the last few turns — continue naturally from here, never repeat it):
${previousTail}`;
  }

  /**
   * @param onDetail Optional sink for live progress. Receives the ACTUAL text
   *   being written, segment by segment, so the studio can show the script
   *   appearing rather than a summary of it. Never awaited and never allowed to
   *   throw into the generation path.
   */
  async generate(
    userId: string,
    brief: GroundingBrief,
    plan: PodcastPlan,
    onDetail?: (detail: string) => void
  ): Promise<GeneratedScript> {
    const lines: ScriptLine[] = [];
    const speakerList = plan.speakers.map((s) => `${s.name} (${s.role})`).join(', ');
    const style = this.resolveStyle(plan);
    // Built once — it is identical for every segment of the episode.
    const styleBlock = style ? buildStylePromptBlock(style) : '';

    // Who is who, for the address budget. Segments are separate LLM calls, so the
    // budget has to be tracked here rather than inside one prompt.
    const teacherSpeaker = plan.speakers.find((s) =>
      /teacher|mentor|guru|coach|instructor/i.test(s.role)
    );
    const studentSpeaker = plan.speakers.find((s) => /student|learner|pupil/i.test(s.role));
    let addressUsed = 0;

    /** Openers already spent, so later segments do not reuse them. */
    const usedOpeners = new Set<string>();

    /** Report a line of live detail; a broken sink must not break scripting. */
    const report = (detail: string) => {
      try {
        onDetail?.(detail);
      } catch {
        /* progress reporting is never load-bearing */
      }
    };

    for (const seg of plan.segments) {
      // ── Ground this segment (best-effort; empty grounding falls back to general knowledge) ──
      let grounding = '';
      let segCitations: { source: string; score: number }[] = [];
      try {
        const contextBundle = await knowledgeService.getSourceContext(
          seg.retrievalQuery,
          brief.notebookId,
          {
            sourceIds: brief.sourceIds,
            topK: 5,
            includeKnowledgeGraph: !!brief.notebookId,
            artifactType: 'PODCAST',
            consumerContext: 'Podcast Conversation Generator',
          }
        );
        segCitations = contextBundle.citations.map((c) => ({ source: c.source, score: c.score }));
        grounding = contextBundle.contextString;
      } catch { /* grounding is best-effort */ }

      const isFirst = seg.index === 0;
      const isLast = seg.index === plan.segments.length - 1;
      const addressGuide = this.addressGuide(plan);

      // The last few turns already written, so this call continues the episode
      // rather than starting a fresh one.
      const previousTail = lines
        .slice(-6)
        .map((l) => `${l.speaker}: ${l.text}`)
        .join('\n');
      const continuityGuide = this.continuityGuide(isFirst, previousTail, style);
      const typeStyle = this.typeStyle(plan.type);

      const roleNote = this.positionNote(style, isFirst, isLast);

      const system = 'You are a scriptwriter for a natural, engaging educational podcast. Output STRICTLY valid JSON only (an array of dialogue turns).';
      const languageGuide = getLanguageStyleGuide(plan.language);
      const prompt = `Write the spoken dialogue for ONE segment of an educational podcast.

EPISODE: ${plan.title}
SPEAKERS (use these exact names): ${speakerList}
SEGMENT: ${seg.title}
OBJECTIVE: ${seg.objective}
TALKING POINTS: ${seg.talkingPoints.join('; ')}
TARGET LENGTH: about ${seg.targetWords} words total across the turns.
LANGUAGE: ${plan.language}
${languageGuide}
${typeStyle}
${styleBlock || 'STYLE: conversational and natural, with questions, analogies and short back-and-forth exchanges (not a monologue, unless there is a single narrator).'}
${roleNote}

${this.craftGuide(style)}
${continuityGuide}
${this.spentOpenersGuide(usedOpeners)}
${addressGuide}
PUNCTUATION (this script is read aloud by a text-to-speech voice):
- End EVERY sentence with proper terminal punctuation. In Hindi or Sanskrit use the danda "।"; in English use a full stop.
- Use commas to mark the natural breathing points inside a sentence.
- Prefer two short sentences over one long one — the voice pauses at sentence boundaries, so this is what produces natural pacing.
- Do NOT write stage directions, ellipses "..." or dashes to imply a pause; only real punctuation creates one.

GROUNDING (base every factual claim ONLY on this; do not invent facts beyond it):
${grounding ? grounding.slice(0, 4000) : '(no retrieved context — use widely-accepted, syllabus-safe facts and stay general)'}

Output ONLY a JSON array of turns, EXACTLY:
[{"speaker": "<one of the speaker names above>", "text": "what they say"}]`;

      const schema = createLinesSchema(plan.speakers.map(s => s.name));
      const res = await callStructuredLLM<z.infer<typeof schema>>({
        ai: new GeminiProvider(),
        prompt,
        system,
        context: { userId, notebookId: brief.notebookId || undefined, operation: 'podcast_script' },
        validate: (d) => { const r = schema.safeParse(d); return { ok: r.success, error: r.success ? undefined : r.error.message }; },
        label: 'podcast_script',
      });

      let segLines = res.ok && res.data
        ? res.data
        : [{ speaker: plan.speakers[0].name, text: `${seg.title}. ${seg.objective}` }];

      // Deterministic backstop. The continuity rules above ask the model not to
      // greet mid-episode, but prompt compliance is probabilistic and a repeated
      // "नमस्ते दोस्तों" is glaringly obvious to a listener. Strip it outright
      // rather than hoping.
      if (!isFirst) {
        segLines = stripRedundantGreeting(segLines);
      }

      // Deterministic backstop for the address budget. The prompt asks for at
      // most a couple of vocatives per episode; this guarantees it. The budget is
      // consumed across the WHOLE episode, not per segment, which is why the
      // counters live outside the loop.
      segLines = limitDirectAddress(segLines, {
        teacherSpeaker: teacherSpeaker?.name,
        studentSpeaker: studentSpeaker?.name,
        budget: Math.max(0, ADDRESS_BUDGET - addressUsed),
      });
      addressUsed += countVocatives(segLines, studentSpeaker?.name);

      for (const l of segLines) {
        lines.push({ speaker: l.speaker, text: l.text, chapterIndex: seg.index, citations: segCitations });
      }

      // Emit the real dialogue just written for this segment. Two turns is
      // enough to see the voice and register of the script forming without
      // streaming the entire episode into Firestore.
      // Remember how these turns opened so the next segment cannot reuse them.
      // Segments are separate LLM calls, so without this every one of them reaches
      // for the same "बिल्कुल सही" and the episode develops a verbal tic.
      for (const l of segLines) {
        const opener = openerOf(l.text);
        if (opener) usedOpeners.add(opener);
      }

      const preview = segLines
        .slice(0, 2)
        .map((l) => `${l.speaker}: ${clip(l.text, 150)}`)
        .join('  ');
      report(`“${seg.title}” — ${segLines.length} turns. ${preview}`);
    }

    return {
      lines,
      totalWords: lines.reduce((a, l) => a + l.text.split(' ').length, 0),
    };
  }
}

/**
 * The opening phrase of a turn, used to stop later segments reusing it.
 *
 * Takes the first few words up to the first clause break, which is where the
 * stock acknowledgements live ("बिल्कुल सही।", "ठीक है,", "That's right,").
 */
export function openerOf(text: string): string | null {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;

  const clause = (flat.split(/[,।!?.]/)[0] ?? '').trim();
  if (!clause) return null;

  // A stock acknowledgement is a SHORT leading clause closed by punctuation
  // ("बिल्कुल सही।", "ठीक है,", "That's right,"). A long opening clause is just
  // prose — banning its first few words would forbid legitimate sentences that
  // happen to start the same way, so leave it alone.
  if (clause.length > 28) return null;
  if (clause.split(' ').filter(Boolean).length > 5) return null;

  return clause;
}

/** Truncate on a word boundary where possible, so previews read cleanly. */
function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Greeting openers, across the languages this product narrates. Anchored to the
 * start of a line and followed by optional address terms, so ordinary uses of
 * these words mid-sentence are never touched.
 */
const GREETING_PATTERNS: RegExp[] = [
  // Devanagari नमस्ते / नमस्कार, optionally followed by an address term.
  //
  // NOTE: no \b here. JavaScript's \b is defined against [A-Za-z0-9_], so it can
  // never match a boundary after a Devanagari character — using it silently made
  // every Hindi pattern here dead. A lookahead for whitespace/punctuation/end is
  // the portable equivalent.
  /^\s*(?:नमस्ते|नमस्कार)(?=[\s,!।:?—-]|$)[\s,!।:?—-]*(?:दोस्तों|दोस्तो|मित्रों|साथियों|श्रोताओं|सभी)?[\s,!।:?—-]*/u,

  // "(आपका) स्वागत है (दोस्तों)". Deliberately requires the "है" copula: bare
  // स्वागत is an ordinary noun ("स्वागत समारोह" = welcome ceremony) and must not
  // be stripped from legitimate content.
  /^\s*(?:आपका\s+|आप\s+सभी\s+का\s+|सभी\s+का\s+)?स्वागत\s+है[\s,!।:?—-]*(?:दोस्तों|दोस्तो|मित्रों|साथियों|सभी)?[\s,!।:?—-]*/u,

  // Roman Hinglish: namaste/namaskar [dosto]
  /^\s*(?:namaste|namaskar)\b[\s,!.:-]*(?:dosto+|doston|friends)?[\s,!.:-]*/iu,

  // English: hello/hi/hey [everyone/friends/all]
  /^\s*(?:hello|hi|hey)\b[\s,!.:-]*(?:everyone|everybody|friends|all|folks|guys)?[\s,!.:-]*/iu,

  // English: (and) welcome (back) (to <show name>)
  /^\s*(?:and\s+)?welcome(?:\s+back)?(?:\s+to\b[^.!?।]*)?[\s,!.:।-]*/iu,
];

/**
 * Remove a greeting that opens a continuation segment.
 *
 * Only the FIRST line of the segment is considered — a greeting later in a
 * segment is almost certainly quoted speech or legitimate content. If stripping
 * leaves nothing, the line is dropped entirely.
 */
export function stripRedundantGreeting<T extends { speaker: string; text: string }>(
  segLines: T[]
): T[] {
  if (segLines.length === 0) return segLines;

  const [first, ...rest] = segLines;
  let text = first.text;

  for (const pattern of GREETING_PATTERNS) {
    text = text.replace(pattern, '');
  }
  text = text.trim();

  // Re-capitalise Latin text if stripping removed the original sentence start.
  if (text && text !== first.text && /^[a-z]/.test(text)) {
    text = text[0].toUpperCase() + text.slice(1);
  }

  // Nothing of substance left — the whole line was a greeting.
  if (text.length < 2) return rest;

  return [{ ...first, text }, ...rest];
}

/**
 * Forms of address allowed in an entire episode, per direction.
 *
 * Two total (one each way) keeps the lesson from feeling cold without becoming
 * the tic that made earlier episodes unlistenable.
 */
const ADDRESS_BUDGET = 1;

/** How many lines in this batch still carry a form of address. */
function countVocatives(
  lines: { speaker: string; text: string }[],
  studentSpeaker?: string
): number {
  const toStudent = vocativePatterns(ROLE_LABEL_WORDS);
  const toTeacher = vocativePatterns(HONORIFIC_WORDS);
  let n = 0;
  for (const l of lines) {
    const patterns = studentSpeaker && l.speaker === studentSpeaker ? toTeacher : toStudent;
    if (
      patterns.some((p) => {
        p.lastIndex = 0;
        return p.test(l.text);
      })
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Words that are ROLE LABELS rather than personal names.
 *
 * The planner frequently returns these as a speaker's "name" — especially in
 * Hindi, where it answers शिक्षक / छात्र. Anything in this list must never be
 * spoken as a form of address.
 */
const ROLE_LABEL_WORDS = [
  'छात्र', 'विद्यार्थी', 'शिक्षक', 'अध्यापक', 'गुरु',
  'बच्चों', 'बेटा', 'बेटी', 'दोस्तों',
  'student', 'teacher', 'pupil', 'learner', 'narrator', 'host', 'expert',
];

/** Honorifics a student aims at a teacher. Stripped beyond the budget. */
const HONORIFIC_WORDS = ['सर', 'मैडम', 'गुरुजी', 'आचार्य', 'जी', 'sir', 'madam', "ma'am"];

/**
 * A Devanagari-safe vocative matcher.
 *
 * `\b` is unusable here: JavaScript's `\w` is `[A-Za-z0-9_]`, so `\b` never
 * matches beside Devanagari and every Hindi pattern would silently fail. The
 * boundary is written as an explicit character class instead.
 */
const VOCATIVE_EDGE = '[\\s,;:!?।—–-]';

function vocativePatterns(words: string[]): RegExp[] {
  const alt = words
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return [
    // Leading vocative:  "छात्र, अब बताओ" / "सर, यह क्या है"
    new RegExp(`^\\s*(?:${alt})${VOCATIVE_EDGE}+`, 'i'),
    // Acknowledgement + vocative:  "बिल्कुल छात्र।" -> "बिल्कुल।"
    new RegExp(`(${VOCATIVE_EDGE})+(?:${alt})(?=${VOCATIVE_EDGE}|$)`, 'gi'),
  ];
}

/**
 * Enforce the direct-address budget deterministically.
 *
 * The prompt asks for at most two forms of address per episode, but prompt
 * compliance is probabilistic and the failure is glaring: an episode where every
 * teacher line begins "बिल्कुल छात्र" and every student line begins "हाँ सर" is
 * unlistenable however good the physics is. So the budget is also enforced here.
 *
 * The first `budget` occurrences are LEFT ALONE — a lesson with zero address at
 * all reads cold. Everything after that is removed.
 *
 * @param budget How many address forms to allow per direction (teacher→student
 *   and student→teacher are counted separately).
 */
export function limitDirectAddress<T extends { speaker: string; text: string }>(
  lines: T[],
  opts: { teacherSpeaker?: string; studentSpeaker?: string; budget?: number } = {}
): T[] {
  const budget = opts.budget ?? 1;

  // The teacher addresses the student by role label; the student uses honorifics.
  const toStudent = vocativePatterns(ROLE_LABEL_WORDS);
  const toTeacher = vocativePatterns(HONORIFIC_WORDS);

  let usedByTeacher = 0;
  let usedByStudent = 0;

  return lines
    .map((line) => {
      const isStudent = opts.studentSpeaker && line.speaker === opts.studentSpeaker;
      const patterns = isStudent ? toTeacher : toStudent;
      const used = isStudent ? usedByStudent : usedByTeacher;

      // Does this line contain a vocative at all?
      const hasVocative = patterns.some((p) => {
        p.lastIndex = 0;
        return p.test(line.text);
      });
      if (!hasVocative) return line;

      // Within budget: keep it, and spend the allowance.
      if (used < budget) {
        if (isStudent) usedByStudent++;
        else usedByTeacher++;
        return line;
      }

      // Over budget: strip.
      let text = line.text;
      for (const p of patterns) {
        p.lastIndex = 0;
        text = text.replace(p, (match) =>
          // The acknowledgement pattern swallows the preceding separator, so put
          // a single separator back rather than gluing two words together.
          /^[\s,;:!?।—–-]/.test(match) ? ' ' : ''
        );
      }

      text = text
        .replace(/\s{2,}/g, ' ')
        // "बिल्कुल ।" -> "बिल्कुल।"
        .replace(/\s+([।,.!?])/g, '$1')
        .trim();

      // Re-capitalise Latin text if the removal took the sentence opener.
      if (text && /^[a-z]/.test(text)) text = text[0].toUpperCase() + text.slice(1);

      // Nothing meaningful left — keep the original rather than emit a stub.
      if (text.length < 2) return line;

      return { ...line, text };
    })
    .filter(Boolean) as T[];
}

/**
 * Respectful forms a student uses for a teacher, per language.
 *
 * Deliberately offers both masculine and feminine options and lets the model
 * pick one: the plan does not carry speaker gender, so hard-coding "sir" would
 * be wrong half the time. Consistency is enforced by the prompt instead.
 */
function honorificsFor(language: string): string {
  const lang = (language || 'english').trim().toLowerCase();

  if (lang.startsWith('hindi')) {
    return '"सर" or "मैडम" (or "गुरुजी" for a traditional register)';
  }
  if (lang.startsWith('hinglish')) {
    return '"sir" or "ma\'am" (Roman script, as used in Indian classrooms)';
  }
  if (lang.startsWith('sanskrit')) {
    return '"आचार्य" or "गुरुजी"';
  }
  if (lang.startsWith('english')) {
    return '"sir" or "ma\'am"';
  }
  return `the respectful form of address a student would naturally use for a teacher in ${language}`;
}

export const conversationGenerator = new ConversationGenerator();
