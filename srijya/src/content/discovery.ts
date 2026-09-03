/**
 * The project discovery questions.
 *
 * Four questions, in the order a first conversation actually goes: what, where
 * from, what specifically, and what kind of help. Every question can be answered
 * with "Not sure yet" — someone who knows exactly what they need rarely needs
 * this form, and a required field that punishes uncertainty just filters out the
 * people the company most wants to hear from.
 *
 * Nothing here is scored, ranked or used to qualify anyone out. The answers are
 * shaped into a readable brief so the first reply can be about the problem
 * rather than about scheduling a call to find out what the problem is.
 */

export type ChoiceQuestion = {
  id: 'building' | 'stage' | 'help';
  legend: string;
  /** Several answers can be true at once. */
  multiple: boolean;
  options: readonly string[];
};

export const BUILDING: ChoiceQuestion = {
  id: 'building',
  legend: 'What are you looking to build?',
  multiple: false,
  options: [
    'Digital product',
    'AI application',
    'Web platform',
    'Mobile application',
    'Enterprise system',
    'Internal tool',
    'Something else',
    'Not sure yet',
  ],
};

export const STAGE: ChoiceQuestion = {
  id: 'stage',
  legend: 'Where are you right now?',
  multiple: false,
  options: [
    'Just an idea',
    'Requirements defined',
    'Prototype',
    'Existing product',
    'Need modernisation',
    'Scaling an existing system',
  ],
};

export const HELP: ChoiceQuestion = {
  id: 'help',
  legend: 'How can we help?',
  // Multi-select: most real engagements are more than one of these, and forcing
  // a single answer would make the brief less accurate, not simpler.
  multiple: true,
  options: [
    'Product strategy',
    'Design',
    'Engineering',
    'AI',
    'Architecture',
    'End-to-end product development',
    'Not sure yet',
  ],
};

export const DISCOVERY_STEPS = [
  { id: 'building', label: 'What' },
  { id: 'stage', label: 'Where' },
  { id: 'about', label: 'Detail' },
  { id: 'help', label: 'Help' },
  { id: 'you', label: 'You' },
] as const;

export type StepId = (typeof DISCOVERY_STEPS)[number]['id'];
