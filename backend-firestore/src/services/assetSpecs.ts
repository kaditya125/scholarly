import { z } from 'zod';

/**
 * Data-driven specs for the richer educational assets (Phase, Part 8).
 *
 * Each spec is generated from a chapter sample and stored as its own document in the notebook's
 * `assets` subcollection (same shape as the existing SUMMARY/FLASHCARDS/QUIZ assets: {type,
 * title, content, createdAt, notebookId}). Additive: these are extra asset types; the core three
 * are unchanged and remain the only ones verification requires.
 *
 *  - kind 'prose' : free-form text, stored as `content` (no JSON parsing needed).
 *  - kind 'json'  : validated JSON, stored under `content[contentKey]`.
 */

export type RichAssetType =
  | 'REVISION_NOTES'
  | 'LEARNING_OBJECTIVES'
  | 'KEY_FORMULAE'
  | 'HIGH_YIELD_FACTS'
  | 'COMMON_MISTAKES'
  | 'EXAM_TIPS'
  | 'DOCUMENTARY_ARTICLE';

interface ProseAssetSpec {
  type: RichAssetType;
  kind: 'prose';
  titleSuffix: string;
  operation: string;
  model?: string;
  prompt: (text: string) => string;
}

interface JsonAssetSpec {
  type: RichAssetType;
  kind: 'json';
  titleSuffix: string;
  operation: string;
  contentKey: string;
  model?: string;
  schema: z.ZodTypeAny;
  prompt: (text: string) => string;
}

export type AssetSpec = ProseAssetSpec | JsonAssetSpec;

// Reusable schemas. Arrays may legitimately be empty (e.g. a chapter with no formulae); the
// generator skips storing an empty asset rather than treating it as a failure.
const StringList = z.array(z.string().min(1));
const FormulaeList = z.array(z.object({ formula: z.string().min(1), meaning: z.string().min(1) }));

const ConceptBlockSchema = z.object({
  id: z.string().optional().default(() => `c-${Math.random().toString(36).slice(2, 7)}`),
  heading: z.string().catch('Key Concept'),
  ncertPageRef: z.coerce.number().optional().default(1),
  body: z.preprocess(
    (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : []),
    z.array(z.string())
  ).catch(['Concept details extracted from chapter.']),
  highlights: z.array(z.string()).optional().default([]),
  boldLines: z.array(z.string()).optional().default([]),
  numberedList: z.array(z.string()).optional().default([]),
  bulletList: z.array(z.string()).optional().default([]),
});

const DocumentarySectionSchema = z.object({
  id: z.string().optional().default(() => `sec-${Math.random().toString(36).slice(2, 7)}`),
  title: z.string().catch('Section Overview'),
  ncertPageRef: z.coerce.number().optional().default(1),
  intro: z.string().optional().default(''),
  concepts: z.array(ConceptBlockSchema).catch([]),
});

const FlashcardItemSchema = z.object({
  id: z.string().optional().default(() => `fc-${Math.random().toString(36).slice(2, 7)}`),
  front: z.string().catch('Question'),
  back: z.string().catch('Answer'),
  category: z.string().catch('General'),
});

const DocumentaryChapterSchema = z.object({
  title: z.string().catch('Chapter Article'),
  bookTitle: z.string().catch('NCERT Textbook'),
  subject: z.string().catch('Science'),
  estimatedReadingTime: z.string().catch('15 mins'),
  difficulty: z.preprocess((v) => {
    const s = String(v || '').toLowerCase();
    if (s.includes('begin') || s.includes('easy')) return 'Beginner';
    if (s.includes('adv') || s.includes('hard')) return 'Advanced';
    return 'Intermediate';
  }, z.enum(['Beginner', 'Intermediate', 'Advanced'])).catch('Intermediate'),
  leadParagraph: z.string().catch('Welcome to this structured learning experience.'),
  sections: z.array(DocumentarySectionSchema).catch([]),
  summary: z.object({
    body: z.string().catch('Summary of key chapter concepts.'),
    keyPoints: z.array(z.string()).catch(['Core topics covered in this chapter.']),
  }).catch({ body: 'Summary of key chapter concepts.', keyPoints: ['Core topics covered in this chapter.'] }),
  flashcards: z.array(FlashcardItemSchema).catch([]),
});

export const RICH_ASSET_SPECS: AssetSpec[] = [
  {
    type: 'REVISION_NOTES',
    kind: 'prose',
    titleSuffix: 'Revision Notes',
    operation: 'asset_revision_notes',
    prompt: (t) => `Write concise, high-yield revision notes for this chapter as short markdown bullet points grouped under 2-4 headings. Focus on what a student must remember for an exam.\n\n${t}`,
  },
  {
    type: 'LEARNING_OBJECTIVES',
    kind: 'json',
    titleSuffix: 'Learning Objectives',
    operation: 'asset_learning_objectives',
    contentKey: 'objectives',
    schema: StringList,
    prompt: (t) => `List the 4-7 key learning objectives a student should achieve from this chapter. Output ONLY a JSON array of strings.\n\n${t}`,
  },
  {
    type: 'KEY_FORMULAE',
    kind: 'json',
    titleSuffix: 'Key Formulae',
    operation: 'asset_key_formulae',
    contentKey: 'formulae',
    schema: FormulaeList,
    prompt: (t) => `Extract the key formulae/equations from this chapter. Output ONLY valid JSON: [{"formula": "F = ma", "meaning": "force equals mass times acceleration"}]. If the chapter has no formulae, output [].\n\n${t}`,
  },
  {
    type: 'HIGH_YIELD_FACTS',
    kind: 'json',
    titleSuffix: 'High-Yield Facts',
    operation: 'asset_high_yield_facts',
    contentKey: 'facts',
    schema: StringList,
    prompt: (t) => `List 5-10 high-yield facts from this chapter that are most frequently tested in exams. Output ONLY a JSON array of strings.\n\n${t}`,
  },
  {
    type: 'COMMON_MISTAKES',
    kind: 'json',
    titleSuffix: 'Common Mistakes',
    operation: 'asset_common_mistakes',
    contentKey: 'mistakes',
    schema: StringList,
    prompt: (t) => `List 4-8 common mistakes or misconceptions students have with this chapter's topics. Output ONLY a JSON array of strings.\n\n${t}`,
  },
  {
    type: 'EXAM_TIPS',
    kind: 'json',
    titleSuffix: 'Exam Tips',
    operation: 'asset_exam_tips',
    contentKey: 'tips',
    schema: StringList,
    prompt: (t) => `Give 4-8 practical, chapter-specific exam tips (how questions are framed, what to prioritise, time-savers). Output ONLY a JSON array of strings.\n\n${t}`,
  },
  {
    type: 'DOCUMENTARY_ARTICLE',
    kind: 'json',
    model: 'gemini-2.5-flash',
    titleSuffix: 'Documentary Article',
    operation: 'asset_documentary_article',
    contentKey: 'article',
    schema: DocumentaryChapterSchema,
    prompt: (t) => `You are a world-class educator creating a premium documentary-style article from the provided NCERT chapter text. 
Write engaging, flowing prose that feels human. Do NOT sound like an AI. Explain difficult concepts using analogies and stories.
Preserve scientific accuracy. 
Output ONLY a JSON object matching this schema:
{
  "title": string,
  "bookTitle": string,
  "subject": string,
  "estimatedReadingTime": string (e.g. "20 mins"),
  "difficulty": "Beginner" | "Intermediate" | "Advanced",
  "leadParagraph": string (engaging opening hook paragraph),
  "sections": [
    {
      "id": string (e.g. "sec-1"),
      "title": string,
      "ncertPageRef": number,
      "intro": string (optional section intro),
      "concepts": [
        {
          "id": string,
          "heading": string,
          "ncertPageRef": number,
          "body": [string, string...] (flowing prose paragraphs),
          "highlights": [string...] (optional key terms),
          "boldLines": [string...] (optional sentences worth bolding),
          "numberedList": [string...] (optional),
          "bulletList": [string...] (optional)
        }
      ]
    }
  ],
  "summary": { "body": string, "keyPoints": [string...] },
  "flashcards": [ { "id": string, "front": string, "back": string, "category": string } ]
}
Make it incredibly detailed. The 'sections' array should cover the entire chapter.
\n\nChapter Text:\n${t}`,
  }
];

/** Zod validator wrapper matching the callStructuredLLM `validate` contract. */
export function zodValidator(schema: z.ZodTypeAny) {
  return (d: any) => {
    const r = schema.safeParse(d);
    return { ok: r.success, error: r.success ? undefined : r.error.message };
  };
}
