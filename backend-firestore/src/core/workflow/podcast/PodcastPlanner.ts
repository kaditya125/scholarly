import { z } from 'zod';
import { GeminiProvider } from '../../../services/ai/gemini.provider';
import { callStructuredLLM } from '../../../services/ai/structuredLlm';
import { StudentContextService } from '../../../services/studentContext.service';
import { intelligenceService } from '../../intelligence/IntelligenceService';
import {
  GroundingBrief,
  PodcastGenerateRequest,
  PodcastPlan,
  PlannedSegment,
  PodcastSpeaker,
  SpeakerStyle,
  DEFAULT_ROLE_VOICE,
} from './types';
import { featureFlags } from '../../../config/featureFlags';
import {
  PodcastStyleConfig,
  describeCastForPlanner,
  resolvePodcastStyle,
} from './podcastStyles';

const WORDS_PER_MIN = 150;

/**
 * Language-specific guide appended to the planning prompt so the plan
 * fields (title, description, objective, talkingPoints) are written in
 * the target language. `retrievalQuery` is exempt — those are English
 * search phrases that go to the RAG index and should not be translated.
 */
function planLanguageGuide(language: string): string {
  const normalized = (language || '').toLowerCase();

  if (normalized === 'hinglish') {
    return [
      'HINGLISH FIELDS:',
      '- title, description, objective, talkingPoints, and learningObjectives should be in natural code-mixed Hinglish (Hindi in Devanagari script + English words inline).',
      '- Grammar follows Hindi; drop in English for technical terms (photosynthesis, oxygen, exam, chapter).',
      '- Do NOT transliterate Hindi in Latin script — always use Devanagari for Hindi words.',
      '- retrievalQuery MUST remain in plain English (it goes to a search index).',
    ].join('\n');
  }

  if (normalized === 'hindi') {
    return [
      'HINDI FIELDS:',
      '- Write title, description, objective, talkingPoints, and learningObjectives in natural spoken Hindi in Devanagari script.',
      '- Technical loanwords (photosynthesis, oxygen, algorithm) can stay in English inline.',
      '- retrievalQuery MUST remain in plain English (it goes to a search index).',
    ].join('\n');
  }

  if (normalized === 'sanskrit') {
    return [
      'SANSKRIT FIELDS: title, description, objectives in classical Sanskrit (Devanagari). retrievalQuery stays in English.',
    ].join('\n');
  }

  return '';
}

const PlanSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.string().min(1),
  teachingStrategy: z.string().min(1),
  learningObjectives: z.array(z.string().min(1)).min(1),
  speakers: z.array(z.object({ name: z.string().min(1), role: z.string().min(1) })).min(1),
  segments: z
    .array(
      z.object({
        title: z.string().min(1),
        objective: z.string().min(1),
        talkingPoints: z.array(z.string()).min(1),
        retrievalQuery: z.string().min(1),
      }),
    )
    .min(1),
});

/**
 * PodcastPlanner — the "content planning" stage. Composes the Intelligence Layer
 * (intelligenceService.plan, advisory) + StudentContext (personalization) + an LLM plan call
 * into a structured PodcastPlan (title, objectives, difficulty, strategy, speakers, segments).
 * Never throws: on LLM failure it returns a deterministic fallback plan so generation proceeds.
 */
export class PodcastPlanner {
  private studentContext = new StudentContextService();

  /** LEGACY role line — used only when ENHANCED_PODCAST_STYLES is off. */
  private speakerRolesFor(style: SpeakerStyle): string {
    switch (style) {
      case 'solo_narrator': return 'a single Narrator';
      case 'interview': return 'a Host and a Subject Expert';
      case 'mentor': return 'a Mentor and a Student';
      case 'discussion': return 'two co-hosts (a Host and a Subject Expert)';
      case 'teacher_student':
      default: return 'a Teacher and a curious Student';
    }
  }

  /**
   * The production format for this request, or null to run the legacy path.
   *
   * Prefers the new `podcastStyle`; falls back to mapping the legacy
   * `speakerStyle` so an older client still gets a coherent format.
   */
  private resolveStyle(req: PodcastGenerateRequest): PodcastStyleConfig | null {
    if (!featureFlags.enhancedPodcastStyles) return null;
    return resolvePodcastStyle(req.podcastStyle || req.speakerStyle);
  }

  /**
   * Force the cast to match the format.
   *
   * The LLM invents pleasant first names, which we keep, but the ROLE decides the
   * TTS voice and must be one of the style's roles — otherwise a "Debate" could
   * come back with two co-hosts and no moderator.
   */
  private castForStyle(
    style: PodcastStyleConfig,
    llmSpeakers: { name: string; role: string }[] | undefined,
    req: PodcastGenerateRequest,
  ): PodcastSpeaker[] {
    return style.speakers.map((spec, i) => {
      const suggested = llmSpeakers?.[i];
      // Only reuse the LLM's name; never its role.
      const name = suggested?.name?.trim() || spec.role;
      return {
        name,
        role: spec.role,
        voiceStyle:
          (i === 0 ? req.voiceStyle : undefined) ||
          DEFAULT_ROLE_VOICE[spec.role] ||
          'warm_teacher',
      };
    });
  }

  /** Format-specific planning guidance so the SEGMENTS follow the format's arc. */
  private planStyleBlock(style: PodcastStyleConfig, segmentCount: number): string {
    return [
      `PRODUCTION FORMAT: ${style.label} — ${style.summary}`,
      `CAST (exactly ${style.speakerCount}): ${style.speakers.map((s) => s.role).join(', ')}`,
      `This format moves through these beats: ${style.structure.join(' -> ')}.`,
      `Distribute those beats across the ${segmentCount} segments in order. Do NOT plan a generic intro/body/outro.`,
      `The first segment must honour this opening: ${style.openingRule}`,
    ].join('\n');
  }

  /** Full plan (used by the engine). */
  async buildPlan(userId: string, brief: GroundingBrief, req: PodcastGenerateRequest): Promise<PodcastPlan> {
    const minutes = req.durationMinutes;
    const totalWords = Math.max(300, Math.round(minutes * WORDS_PER_MIN));
    const segmentCount = Math.min(12, Math.max(3, Math.round(totalWords / 280)));
    const targetWordsPer = Math.round(totalWords / segmentCount);
    const language = req.language || 'English';
    const speakerStyle: SpeakerStyle = req.speakerStyle || 'teacher_student';
    const style = this.resolveStyle(req);

    // Personalization (non-fatal).
    let persona = '';
    let personalizationSummary = 'Personalized to your profile.';
    let weakTopics: string[] = brief.focusTopics || [];
    try {
      const ctx = await this.studentContext.aggregateContext(userId);
      const exam = ctx.stats?.activeExam || 'your exam';
      const difficulty = ctx.stats?.difficultyLevel || 'Intermediate';
      const mastery = ctx.analytics?.masteryPercentage;
      if (!weakTopics.length) weakTopics = (ctx.memory?.weakTopics || []).slice(0, 5);
      persona =
        `Student is preparing for ${exam} at ${difficulty} level.` +
        (mastery != null ? ` Current mastery ~${mastery}%.` : '') +
        (weakTopics.length ? ` Known weak topics: ${weakTopics.join(', ')}.` : '');
      personalizationSummary = weakTopics.length
        ? `Personalized for ${exam}, emphasizing your weak topics: ${weakTopics.slice(0, 3).join(', ')}.`
        : `Personalized for ${exam} at ${difficulty} level.`;
    } catch { /* keep defaults */ }

    // Advisory Intelligence-Layer signal (non-fatal) — reuse, don't duplicate.
    let complexityHint = '';
    try {
      const plan = intelligenceService.plan({
        query: brief.topic, history: [], notebookId: brief.notebookId || undefined, mode: 'podcast',
      });
      complexityHint = `Estimated complexity ~${plan.complexity.level}/5 (${plan.category}).`;
    } catch { /* ignore */ }

    const system = 'You are an expert instructional designer who plans educational audio episodes. Output STRICTLY valid JSON only.';
    const prompt = `Plan an educational podcast episode.

TOPIC / SOURCE: ${brief.topic}
SOURCE NOTES: ${(brief.baseText || '').slice(0, 1500)}
PODCAST TYPE: ${req.type}
TARGET LENGTH: ${minutes} minutes (~${totalWords} words across ${segmentCount} segments)
CONVERSATION STYLE: ${style ? describeCastForPlanner(style) : this.speakerRolesFor(speakerStyle)}
LANGUAGE: ${language}
${planLanguageGuide(language)}
${style ? this.planStyleBlock(style, segmentCount) : ''}
LEARNER: ${persona || 'a general student'} ${complexityHint}

Produce a JSON object EXACTLY like:
{
  "title": "engaging episode title",
  "description": "1-2 sentence description",
  "difficulty": "Beginner|Intermediate|Advanced",
  "teachingStrategy": "how the episode teaches (e.g. analogy-first, exam-focused recap)",
  "learningObjectives": ["3-6 concrete objectives"],
  "speakers": [{"name": "short first name", "role": "Teacher|Student|Narrator|Host|Subject Expert|Mentor|Exam Coach"}],
  "segments": [
    {"title": "segment/chapter title", "objective": "what this segment achieves",
     "talkingPoints": ["2-5 points"], "retrievalQuery": "a focused search query to pull grounding facts for this segment"}
  ]
}
Rules:
- Exactly ${segmentCount} segments${style ? ', ordered along the format beats listed above' : ', logically ordered (open -> build -> recap/close)'}.
- Match the conversation style's speakers (use the roles listed above)${style ? ` — exactly ${style.speakerCount}: ${style.speakers.map((s) => s.role).join(', ')}` : ''}.
- If weak topics are provided, dedicate segments to them.
- Output ONLY the JSON object.`;

    const res = await callStructuredLLM<z.infer<typeof PlanSchema>>({
      ai: new GeminiProvider(),
      prompt,
      system,
      context: { userId, notebookId: brief.notebookId || undefined, operation: 'podcast_plan' },
      validate: (d) => { const r = PlanSchema.safeParse(d); return { ok: r.success, error: r.success ? undefined : r.error.message }; },
      label: 'podcast_plan',
    });

    if (res.ok && res.data) {
      const d = res.data;
      const segments: PlannedSegment[] = d.segments.map((s, i) => ({
        index: i,
        title: s.title,
        objective: s.objective,
        talkingPoints: s.talkingPoints,
        retrievalQuery: s.retrievalQuery,
        targetWords: targetWordsPer,
      }));
      // With the style engine on, the format owns the cast — the LLM only suggests names.
      const speakers: PodcastSpeaker[] = style
        ? this.castForStyle(style, d.speakers, req)
        : d.speakers.map((sp) => ({
            name: sp.name,
            role: sp.role,
            voiceStyle: req.voiceStyle || DEFAULT_ROLE_VOICE[sp.role] || 'warm_teacher',
          }));
      return {
        title: d.title || brief.titleSeed,
        description: d.description,
        type: req.type,
        difficulty: d.difficulty,
        teachingStrategy: d.teachingStrategy,
        learningObjectives: d.learningObjectives,
        speakers,
        segments,
        estimatedMinutes: minutes,
        personalizationSummary,
        language,
        // Carried so the ConversationGenerator (which receives only the plan) knows the format.
        ...(style ? { podcastStyle: style.id } : {}),
      };
    }

    return this.fallbackPlan(brief, req, segmentCount, targetWordsPer, minutes, language, personalizationSummary, speakerStyle, style);
  }

  /** Lightweight dry-run for the studio "personalization summary / estimate" (no scripting/audio). */
  async planPreview(userId: string, brief: GroundingBrief, req: PodcastGenerateRequest): Promise<PodcastPlan> {
    return this.buildPlan(userId, brief, req);
  }

  private fallbackPlan(
    brief: GroundingBrief,
    req: PodcastGenerateRequest,
    segmentCount: number,
    targetWordsPer: number,
    minutes: number,
    language: string,
    personalizationSummary: string,
    speakerStyle: SpeakerStyle,
    style: PodcastStyleConfig | null = null,
  ): PodcastPlan {
    const speakers: PodcastSpeaker[] = style
      ? this.castForStyle(style, undefined, req)
      : speakerStyle === 'solo_narrator'
        ? [{ name: 'Narrator', role: 'Narrator', voiceStyle: req.voiceStyle || 'calm_narrator' }]
        : speakerStyle === 'interview'
          ? [
              { name: 'Host', role: 'Host', voiceStyle: 'professional_lecturer' },
              { name: 'Expert', role: 'Subject Expert', voiceStyle: 'warm_teacher' },
            ]
          : [
              { name: 'Teacher', role: 'Teacher', voiceStyle: req.voiceStyle || 'warm_teacher' },
              { name: 'Riya', role: 'Student', voiceStyle: 'friendly_mentor' },
            ];

    // Even the fallback should follow the format's arc rather than a generic outline.
    const titles = style
      ? style.structure
      : ['Introduction', 'Core Concepts', 'Key Details', 'Examples & Applications', 'Common Mistakes', 'Recap & Exam Tips'];
    const segments: PlannedSegment[] = Array.from({ length: segmentCount }, (_, i) => ({
      index: i,
      title: (titles[Math.min(i, titles.length - 1)] || 'Segment') + (i >= titles.length ? ` ${i + 1}` : ''),
      objective: `Explain ${brief.topic} — part ${i + 1}.`,
      talkingPoints: [brief.topic],
      retrievalQuery: brief.topic,
      targetWords: targetWordsPer,
    }));

    return {
      title: brief.titleSeed || `Podcast: ${brief.topic}`,
      description: `An AI-generated podcast about ${brief.topic}.`,
      type: req.type,
      difficulty: 'Intermediate',
      teachingStrategy: style ? style.summary : 'conversational explanation with examples',
      learningObjectives: [`Understand ${brief.topic}`],
      speakers,
      segments,
      estimatedMinutes: minutes,
      personalizationSummary,
      language,
      ...(style ? { podcastStyle: style.id } : {}),
    };
  }
}

export const podcastPlanner = new PodcastPlanner();
