/**
 * The 20 validation topics, spanning the styles that stress different parts of
 * the Director.
 *
 * Chosen so each one probes a DIFFERENT planner decision rather than 20 variants
 * of the same shape. The `expect` fields are the reviewer's checklist, not
 * assertions — planning quality is a judgement call, and encoding it as a hard
 * test would produce a suite that passes while the audio is wrong.
 */

import type { Emotion } from '../schema/common.schema';

export interface ValidationTopic {
  id: string;
  title: string;
  /** Broad style bucket, from the review brief. */
  style:
    | 'science'
    | 'history'
    | 'biology'
    | 'physics'
    | 'space'
    | 'geography'
    | 'mystery'
    | 'documentary'
    | 'emotional_story'
    | 'educational_explanation'
    | 'multi_speaker'
    | 'interview';
  /** What the reviewer should expect to see, and why. */
  expect: {
    /** Emotions that would be reasonable for the dominant arc. */
    emotions: Emotion[];
    /** Plausible ambience environments. */
    environments: string[];
    /** Whether SFX are appropriate at all for this content. */
    sfxAppropriate: boolean;
    /** What specifically to scrutinise in this topic. */
    focus: string;
  };
}

export const VALIDATION_TOPICS: ValidationTopic[] = [
  {
    id: 'sci-01',
    title: 'How mRNA vaccines teach the immune system',
    style: 'science',
    expect: {
      emotions: ['curious', 'calm', 'neutral'],
      environments: ['laboratory', 'abstract'],
      sfxAppropriate: false,
      focus: 'Dense terminology — comprehension pauses must appear after definitions',
    },
  },
  {
    id: 'sci-02',
    title: 'Why CRISPR changed genetic engineering forever',
    style: 'science',
    expect: {
      emotions: ['curious', 'wonder', 'neutral'],
      environments: ['laboratory'],
      sfxAppropriate: false,
      focus: 'Ethical turn mid-episode should show an emotion shift, not a flat arc',
    },
  },
  {
    id: 'hist-01',
    title: 'A day in the life of ancient Rome',
    style: 'history',
    expect: {
      emotions: ['curious', 'calm'],
      environments: ['marketplace', 'city'],
      sfxAppropriate: true,
      focus: 'Layered marketplace ambience — the flagship multi-layer environment case',
    },
  },
  {
    id: 'hist-02',
    title: 'The fall of Constantinople, 1453',
    style: 'history',
    expect: {
      emotions: ['neutral', 'suspense', 'sad'],
      environments: ['city', 'battlefield'],
      sfxAppropriate: true,
      focus: 'Tension should build across scenes; music must not restart per scene',
    },
  },
  {
    id: 'hist-03',
    title: 'How the printing press rewired human knowledge',
    style: 'documentary',
    expect: {
      emotions: ['curious', 'wonder', 'calm'],
      environments: ['library', 'workshop'],
      sfxAppropriate: true,
      focus: 'Paper/printing SFX should be sparse — density cap must hold',
    },
  },
  {
    id: 'bio-01',
    title: 'How your heart pumps 2,000 gallons of blood every day',
    style: 'biology',
    expect: {
      emotions: ['curious', 'calm'],
      environments: ['abstract', 'laboratory'],
      sfxAppropriate: false,
      focus: 'Numeric content — clarity over atmosphere; ambience should stay minimal',
    },
  },
  {
    id: 'bio-02',
    title: 'The hidden intelligence of fungal networks',
    style: 'biology',
    expect: {
      emotions: ['curious', 'calm', 'wonder'],
      environments: ['forest'],
      sfxAppropriate: true,
      focus: 'Forest ambience continuity across scenes',
    },
  },
  {
    id: 'phys-01',
    title: 'What actually happens inside a black hole',
    style: 'physics',
    expect: {
      emotions: ['curious', 'calm', 'surprise'],
      environments: ['space', 'abstract'],
      sfxAppropriate: false,
      focus: 'Counter-intuitive claims should get comprehension pauses',
    },
  },
  {
    id: 'phys-02',
    title: 'Quantum entanglement explained without the maths',
    style: 'educational_explanation',
    expect: {
      emotions: ['curious', 'calm'],
      environments: ['abstract'],
      sfxAppropriate: false,
      focus: 'Highest-difficulty content — audio must be near-absent under narration',
    },
  },
  {
    id: 'space-01',
    title: 'The Voyager probes and the edge of the solar system',
    style: 'space',
    expect: {
      emotions: ['curious', 'wonder', 'hope'],
      environments: ['space'],
      sfxAppropriate: false,
      focus: 'Emotional arc should rise toward the interstellar section',
    },
  },
  {
    id: 'space-02',
    title: 'Why Mars lost its atmosphere',
    style: 'space',
    expect: {
      emotions: ['curious', 'neutral', 'calm'],
      environments: ['space', 'abstract'],
      sfxAppropriate: false,
      focus: 'Causal chain — scene boundaries should follow the causal steps',
    },
  },
  {
    id: 'geo-01',
    title: 'How monsoons shape the Indian subcontinent',
    style: 'geography',
    expect: {
      emotions: ['curious', 'neutral'],
      environments: ['rain', 'storm', 'city'],
      sfxAppropriate: true,
      focus: 'Weather ambience transitions; thunder must respect avoidStartleEffects',
    },
  },
  {
    id: 'geo-02',
    title: 'The Sahara was green 6,000 years ago',
    style: 'geography',
    expect: {
      emotions: ['surprise', 'curious', 'calm'],
      environments: ['desert', 'forest'],
      sfxAppropriate: true,
      focus: 'Environment CHANGE mid-episode — ambience crossfade quality',
    },
  },
  {
    id: 'myst-01',
    title: 'The unsolved disappearance of the Roanoke colony',
    style: 'mystery',
    expect: {
      emotions: ['suspense', 'fear', 'calm'],
      environments: ['forest', 'abstract'],
      sfxAppropriate: true,
      focus: 'Suspense must build and RESOLVE; no unresolved tension at the outro',
    },
  },
  {
    id: 'myst-02',
    title: 'What happened to the Bronze Age civilisations?',
    style: 'mystery',
    expect: {
      emotions: ['calm', 'suspense', 'neutral'],
      environments: ['abstract', 'city'],
      sfxAppropriate: false,
      focus: 'Speculation vs evidence — emotion should differ between the two',
    },
  },
  {
    id: 'doc-01',
    title: 'The race to sequence the human genome',
    style: 'documentary',
    expect: {
      emotions: ['suspense', 'excited', 'victory'],
      environments: ['laboratory', 'office'],
      sfxAppropriate: true,
      focus: 'Competitive narrative — energy should peak then resolve triumphantly',
    },
  },
  {
    id: 'emo-01',
    title: 'The letters of a WWI field nurse',
    style: 'emotional_story',
    expect: {
      emotions: ['sad', 'calm', 'hope'],
      environments: ['battlefield', 'rain'],
      sfxAppropriate: true,
      focus: 'Emotional restraint — music must not become manipulative; check volumes',
    },
  },
  {
    id: 'emo-02',
    title: 'A survivor account of the 2004 tsunami',
    style: 'emotional_story',
    expect: {
      emotions: ['fear', 'sad', 'hope'],
      environments: ['ocean', 'storm'],
      sfxAppropriate: false,
      focus: 'Sensitive content — startle effects MUST be suppressed',
    },
  },
  {
    id: 'multi-01',
    title: 'Two historians debate the causes of WWI',
    style: 'multi_speaker',
    expect: {
      emotions: ['neutral', 'calm', 'fear'],
      environments: ['office', 'library'],
      sfxAppropriate: false,
      focus: 'VOICE CONTINUITY — each historian must keep one voice throughout',
    },
  },
  {
    id: 'int-01',
    title: 'Interview with a deep-sea marine biologist',
    style: 'interview',
    expect: {
      emotions: ['curious', 'excited', 'calm'],
      environments: ['ocean', 'laboratory'],
      sfxAppropriate: true,
      focus: 'Interviewer vs guest — distinct voices, distinct line share',
    },
  },
];

/** Asserted by tests so the set cannot silently shrink. */
export const VALIDATION_TOPIC_COUNT = VALIDATION_TOPICS.length;
