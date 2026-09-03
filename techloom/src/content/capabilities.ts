/**
 * What Srijya does.
 *
 * One canonical list, used by both the home page (title + summary) and the
 * capabilities page (everything). Keeping it in one place is what stops the two
 * surfaces from drifting into describing slightly different companies.
 *
 * These are written as areas of capability, not as claims. Nothing here asserts a
 * certification, a vendor partnership, a team size or a delivery record, because
 * none of those are things this site can substantiate.
 */

export type Capability = {
  id: string;
  index: string;
  title: string;
  /** One line. The home page shows only this. */
  summary: string;
  /** Two or three sentences for the capabilities page. */
  detail: string;
  /** How work in this area is usually shaped. */
  engagement: string;
  helpWith: string[];
};

export const CAPABILITIES: Capability[] = [
  {
    id: 'digital-product-engineering',
    index: '01',
    title: 'Digital Product Engineering',
    summary:
      'Designing and developing modern web and software products from concept to implementation.',
    detail:
      'End-to-end product work: interface design, front-end and back-end engineering, and the integration work that sits between them. The emphasis is on products that hold up after launch — clear structure, sensible dependencies, and code someone else can read six months later.',
    engagement:
      'A defined scope with an agreed set of outcomes, or continuous product development alongside an in-house team.',
    helpWith: [
      'Web applications and internal tools',
      'Interface design and design systems',
      'Front-end architecture and performance',
      'APIs, data models and service integration',
    ],
  },
  {
    id: 'technology-consulting',
    index: '02',
    title: 'Technology Consulting',
    summary:
      'Helping organisations evaluate technology choices, architecture, digital workflows and implementation approaches.',
    detail:
      'Advisory work for teams deciding what to build, what to buy, and what to leave alone. Useful when a technology decision is expensive to reverse and the options are hard to compare from the inside.',
    engagement:
      'A short, scoped review ending in a written recommendation, or an ongoing advisory arrangement.',
    helpWith: [
      'Architecture and platform review',
      'Build, buy or integrate decisions',
      'Digital workflow and process design',
      'Implementation planning and sequencing',
    ],
  },
  {
    id: 'software-development',
    index: '03',
    title: 'Software Development',
    summary:
      'Building practical software solutions tailored to specific operational and business requirements.',
    detail:
      'Software written for a particular operation rather than a general market: the workflow that a spreadsheet has outgrown, the process that three systems half-cover, the reporting nobody can produce without a manual step.',
    engagement:
      'Usually a first working version in weeks rather than months, then refinement against real use.',
    helpWith: [
      'Operational and back-office systems',
      'Automation of manual, repeated work',
      'Data pipelines and reporting',
      'Integration between existing systems',
    ],
  },
  {
    id: 'ai-and-intelligent-experiences',
    index: '04',
    title: 'AI & Intelligent Experiences',
    summary:
      'Exploring and integrating AI-driven capabilities into useful digital experiences and workflows.',
    detail:
      'Applied AI work — retrieval over a body of source material, assistive interfaces, and automation of judgement-light steps in a process. The starting question is whether a model improves a specific outcome, and how the result is checked when it does not.',
    engagement:
      'Typically a narrow prototype against real data first, so the value is visible before anything is committed to.',
    helpWith: [
      'Retrieval-grounded assistants over your own content',
      'AI features inside existing products',
      'Evaluating where AI genuinely helps — and where it does not',
      'Guardrails, review steps and failure handling',
    ],
  },
  {
    id: 'product-discovery-and-prototyping',
    index: '05',
    title: 'Product Discovery & Prototyping',
    summary: 'Turning early ideas into validated concepts, prototypes and buildable directions.',
    detail:
      'The work before the build: framing the problem, mapping who it affects, and putting something in front of people early enough that being wrong is still cheap. The output is a direction that can be committed to, or the evidence not to.',
    engagement:
      'A fixed, short engagement ending in a prototype and a written direction, whoever builds it afterwards.',
    helpWith: [
      'Problem framing and scoping',
      'Concept and interaction prototypes',
      'Technical feasibility assessment',
      'Roadmap and phasing for a first release',
    ],
  },
];
