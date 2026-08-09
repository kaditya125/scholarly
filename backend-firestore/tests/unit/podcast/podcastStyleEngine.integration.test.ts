/**
 * Podcast Style Engine — wiring tests.
 *
 * podcastStyles.test.ts proves the six CONFIGS differ. This file proves the
 * configs actually reach the two stages that decide what the listener hears:
 *
 *   PodcastPlanner        → casts the episode and records the style on the plan
 *   ConversationGenerator → writes the dialogue from the style's format law
 *
 * The style previously died at the planner: the plan carried no style field, and
 * the generator receives ONLY the plan. These tests assert the whole chain, and
 * that ENHANCED_PODCAST_STYLES=false still produces the original behaviour.
 */

import { podcastPlanner } from '../../../src/core/workflow/podcast/PodcastPlanner';
import { conversationGenerator } from '../../../src/core/workflow/podcast/ConversationGenerator';
import { callStructuredLLM } from '../../../src/services/ai/structuredLlm';
import { StudentContextService } from '../../../src/services/studentContext.service';
import { intelligenceService } from '../../../src/core/intelligence/IntelligenceService';
import { retrievalService } from '../../../src/services/rag/retrieval.service';
import { graphRetrievalService } from '../../../src/services/rag/graphRetrieval.service';
import { pickSpeakerCount } from '../../../src/core/producer/ProducerDecisionEngine';
import {
  PODCAST_STYLES,
  PODCAST_STYLE_IDS,
  PodcastStyleId,
} from '../../../src/core/workflow/podcast/podcastStyles';

jest.mock('../../../src/services/ai/structuredLlm');
jest.mock('../../../src/services/studentContext.service');
jest.mock('../../../src/core/intelligence/IntelligenceService');
jest.mock('../../../src/services/rag/retrieval.service');
jest.mock('../../../src/services/rag/graphRetrieval.service');

const TOPIC = 'Explain Quantum Physics for Class 12';

const brief = {
  topic: TOPIC,
  titleSeed: TOPIC,
  baseText: 'Quantum physics for Class 12: photoelectric effect, de Broglie, uncertainty.',
  notebookId: '',
  focusTopics: [],
};

/** A request for one style. */
const requestFor = (podcastStyle?: PodcastStyleId) =>
  ({
    type: 'custom',
    source: { kind: 'topic', topic: TOPIC },
    durationMinutes: 10,
    ...(podcastStyle ? { podcastStyle } : {}),
  }) as any;

/** Minimal plan for the generator, with the style attached as the planner would. */
const planFor = (podcastStyle?: PodcastStyleId) => {
  const speakers = podcastStyle
    ? PODCAST_STYLES[podcastStyle].speakers.map((s) => ({
        name: s.role,
        role: s.role,
        voiceStyle: 'warm_teacher' as any,
      }))
    : [{ name: 'Teacher', role: 'Teacher', voiceStyle: 'warm_teacher' as any }];

  return {
    title: TOPIC,
    language: 'English',
    type: 'custom',
    speakers,
    segments: [
      {
        index: 0,
        title: 'Opening',
        objective: 'Introduce the idea',
        talkingPoints: ['wave-particle duality'],
        retrievalQuery: 'quantum physics class 12',
        targetWords: 150,
      },
    ],
    ...(podcastStyle ? { podcastStyle } : {}),
  } as any;
};

/** The prompt string handed to the LLM on the most recent call. */
const lastPrompt = (): string =>
  ((callStructuredLLM as jest.Mock).mock.calls.at(-1)?.[0] as { prompt: string }).prompt;

const mockPlannerLLM = () => {
  (StudentContextService.prototype.aggregateContext as jest.Mock).mockResolvedValue({
    stats: { activeExam: 'JEE', difficultyLevel: 'Advanced' },
  });
  (intelligenceService.plan as jest.Mock).mockReturnValue({
    complexity: { level: 4 },
    category: 'Physics',
  });
  (callStructuredLLM as jest.Mock).mockResolvedValue({
    ok: true,
    data: {
      title: TOPIC,
      description: 'Quantum physics, explained for Class 12.',
      difficulty: 'Advanced',
      teachingStrategy: 'analogy-first',
      learningObjectives: ['Understand wave-particle duality'],
      // Deliberately the WRONG cast: two co-hosts, whatever the style. The
      // planner must override the roles from the style.
      speakers: [
        { name: 'Aarav', role: 'Host' },
        { name: 'Meera', role: 'Host' },
      ],
      segments: [
        {
          title: 'Opening',
          objective: 'Introduce',
          talkingPoints: ['duality'],
          retrievalQuery: 'quantum class 12',
        },
      ],
    },
  });
};

const mockScriptLLM = () => {
  (retrievalService.retrieveContext as jest.Mock).mockResolvedValue([]);
  (retrievalService.retrieveCurriculumContext as jest.Mock).mockResolvedValue([]);
  (graphRetrievalService.getGraphContext as jest.Mock).mockResolvedValue(null);
  (callStructuredLLM as jest.Mock).mockResolvedValue({
    ok: true,
    data: [{ speaker: 'Teacher', text: 'Let us begin.' }],
  });
};

describe('Style Engine wiring — ENHANCED_PODCAST_STYLES=false (legacy)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENHANCED_PODCAST_STYLES = 'false';
  });

  it('does not record a style on the plan, so the generator stays in legacy mode', async () => {
    mockPlannerLLM();
    const plan = await podcastPlanner.buildPlan('u1', brief, requestFor('storytelling'));
    expect(plan.podcastStyle).toBeUndefined();
  });

  it('keeps the cast the LLM proposed instead of forcing the style roles', async () => {
    mockPlannerLLM();
    const plan = await podcastPlanner.buildPlan('u1', brief, requestFor('debate'));
    // Legacy behaviour: the LLM's two Hosts survive, so a "debate" is still not one.
    expect(plan.speakers.map((s) => s.role)).toEqual(['Host', 'Host']);
  });

  it('keeps the generic STYLE line and no format law in the script prompt', async () => {
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('storytelling'));
    const prompt = lastPrompt();

    expect(prompt).toContain('STYLE: conversational and natural');
    expect(prompt).not.toContain('PRODUCTION FORMAT');
    expect(prompt).not.toContain('FORMAT LAW');
  });

  it('still asks the first segment for a warm welcome', async () => {
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor());
    expect(lastPrompt()).toContain('open with a short, warm welcome');
  });
});

describe('Style Engine wiring — ENHANCED_PODCAST_STYLES=true', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENHANCED_PODCAST_STYLES = 'true';
  });

  afterAll(() => {
    process.env.ENHANCED_PODCAST_STYLES = 'false';
  });

  it('records the requested style on the plan so the generator can read it', async () => {
    mockPlannerLLM();
    const plan = await podcastPlanner.buildPlan('u1', brief, requestFor('documentary'));
    expect(plan.podcastStyle).toBe('documentary');
  });

  it('overrides the LLM cast with the format cast, keeping its names', async () => {
    mockPlannerLLM();
    const plan = await podcastPlanner.buildPlan('u1', brief, requestFor('documentary'));

    expect(plan.speakers.map((s) => s.role)).toEqual(['Narrator', 'Subject Expert']);
    // Names the LLM chose are still used — only the roles are corrected.
    expect(plan.speakers.map((s) => s.name)).toEqual(['Aarav', 'Meera']);
  });

  it('casts the right number of voices for every style', async () => {
    for (const id of PODCAST_STYLE_IDS) {
      jest.clearAllMocks();
      mockPlannerLLM();
      const plan = await podcastPlanner.buildPlan('u1', brief, requestFor(id));
      expect(plan.speakers).toHaveLength(PODCAST_STYLES[id].speakerCount);
      expect(plan.podcastStyle).toBe(id);
    }
  });

  it('maps a LEGACY speakerStyle onto a real format when no podcastStyle is sent', async () => {
    mockPlannerLLM();
    const req = {
      type: 'custom',
      source: { kind: 'topic', topic: TOPIC },
      durationMinutes: 10,
      speakerStyle: 'discussion',
    } as any;

    const plan = await podcastPlanner.buildPlan('u1', brief, req);
    expect(plan.podcastStyle).toBe('debate');
    expect(plan.speakers).toHaveLength(3);
  });

  it('still records the style when the planning LLM fails', async () => {
    mockPlannerLLM();
    (callStructuredLLM as jest.Mock).mockResolvedValue({ ok: false, error: 'LLM down' });

    const plan = await podcastPlanner.buildPlan('u1', brief, requestFor('debate'));
    // The fallback must not silently drop back to a generic two-hander.
    expect(plan.podcastStyle).toBe('debate');
    expect(plan.speakers.map((s) => s.role)).toEqual(['Host', 'Subject Expert', 'Teacher']);
  });

  it('injects the format law into the script prompt', async () => {
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('documentary'));
    const prompt = lastPrompt();

    expect(prompt).toContain('PRODUCTION FORMAT: DOCUMENTARY');
    expect(prompt).toContain('FORMAT LAW');
    expect(prompt).toContain('must NOT read as an interview');
    // The generic instruction it replaces must be gone.
    expect(prompt).not.toContain('STYLE: conversational and natural');
  });

  it('gives every style a different script prompt for the same segment', async () => {
    const prompts: string[] = [];
    for (const id of PODCAST_STYLE_IDS) {
      jest.clearAllMocks();
      mockScriptLLM();
      await conversationGenerator.generate('u1', brief, planFor(id));
      prompts.push(lastPrompt());
    }

    // The acceptance criterion, at the prompt level: six styles, six briefs.
    expect(new Set(prompts).size).toBe(PODCAST_STYLE_IDS.length);
  });

  it('applies each style\'s own opening rule to the first segment', async () => {
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('storytelling'));
    const story = lastPrompt();
    expect(story).toContain('OPENING RULE:');
    expect(story).toContain('Begin INSIDE the story');
    // A story must never be told to greet the listener.
    expect(story).toContain('Do NOT greet the listener at all');

    jest.clearAllMocks();
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('teacher_student'));
    const lesson = lastPrompt();
    expect(lesson).toContain('Greet the listener ONCE');
  });

  it('does not tell a lone narrator to interrupt itself', async () => {
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('solo_narration'));
    const solo = lastPrompt();

    expect(solo).toContain('One voice only');
    expect(solo).not.toContain('Speakers interrupt, react and think aloud');

    jest.clearAllMocks();
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('interview'));
    expect(lastPrompt()).toContain('Speakers interrupt, react and think aloud');
  });

  it('applies the teacher/student address rules only where they make sense', async () => {
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('teacher_student'));
    const lesson = lastPrompt();
    expect(lesson).toContain('HOW THEY TALK TO EACH OTHER');
    // The rules that matter: the label is not spoken, and there is a hard budget.
    expect(lesson).toContain('THE SPEAKER LABEL IS NOT A SPOKEN WORD');
    expect(lesson).toContain('AT MOST TWICE');

    jest.clearAllMocks();
    mockScriptLLM();
    await conversationGenerator.generate('u1', brief, planFor('debate'));
    // A debate has a Teacher role but no Student, so the block must not fire.
    expect(lastPrompt()).not.toContain('HOW THEY TALK TO EACH OTHER');
  });
});

describe('Producer speaker count', () => {
  it('derives the cast size from the style id for all six styles', () => {
    for (const id of PODCAST_STYLE_IDS) {
      expect(pickSpeakerCount({ speakerStyle: id } as any)).toBe(
        PODCAST_STYLES[id].speakerCount
      );
    }
  });

  it('still honours the legacy values', () => {
    expect(pickSpeakerCount({ speakerStyle: 'solo_narrator' } as any)).toBe(1);
    expect(pickSpeakerCount({ speakerStyle: 'discussion' } as any)).toBe(3);
    expect(pickSpeakerCount({ speakerStyle: 'teacher_student' } as any)).toBe(2);
    expect(pickSpeakerCount({ speakerStyle: undefined } as any)).toBe(2);
  });

  it('gives storytelling and solo narration a single voice, not the default two', () => {
    // Both hit `default: 2` before the registry lookup was added.
    expect(pickSpeakerCount({ speakerStyle: 'storytelling' } as any)).toBe(1);
    expect(pickSpeakerCount({ speakerStyle: 'solo_narration' } as any)).toBe(1);
  });
});
