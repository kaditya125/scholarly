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
  | 'DOCUMENTARY_ARTICLE'
  | 'EXAM_QUESTIONS';

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

/**
 * Exam-mode questions, anchored to the NCERT page they come from.
 *
 * `ncertPageRef` is the point of this asset, not decoration. The reader already carries a page
 * reference on every section and concept, and the PDF panel is page-addressed, so anchoring the
 * questions the same way lets Exam Mode group them by page and jump the PDF to the source of any
 * question. A question with no page is still usable; one with a page is checkable.
 *
 * Grounded in the chapter text only. These are model-written practice questions about the
 * chapter — NOT previous-year questions, and the schema deliberately has no field that could be
 * mistaken for a real paper's provenance. `likelihood` is the model's estimate of what tends to
 * be asked from this material; it is a study aid, not a claim about any actual exam.
 */
const ExamQuestionSchema = z.object({
  id: z.string().optional().default(() => `q-${Math.random().toString(36).slice(2, 8)}`),
  ncertPageRef: z.coerce.number().optional().default(1),
  type: z.preprocess((v) => {
    const s = String(v || '').toLowerCase().replace(/[\s_]/g, '-');
    if (s.includes('mcq') || s.includes('multiple')) return 'mcq';
    if (s.includes('assertion')) return 'assertion-reason';
    if (s.includes('long') || s.includes('essay')) return 'long';
    return 'short';
  }, z.enum(['mcq', 'short', 'long', 'assertion-reason'])).catch('short'),
  question: z.string().min(1).catch('Question unavailable'),
  /** MCQ choices. Empty for every other type. */
  options: z.array(z.string()).optional().default([]),
  answer: z.string().catch(''),
  explanation: z.string().optional().default(''),
  marks: z.coerce.number().optional().default(1),
  /** The model's read on how often this material is examined. Not a claim about any real paper. */
  likelihood: z.preprocess((v) => {
    const s = String(v || '').toLowerCase();
    return s.includes('med') ? 'medium' : 'high';
  }, z.enum(['high', 'medium'])).catch('high'),
  /** One line on why this is worth practising — shown under the answer. */
  whyAsked: z.string().optional().default(''),
});

const ExamQuestionSetSchema = z.array(ExamQuestionSchema);

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
LANGUAGE: write the entire article — titles, intros, headings and body — in the SAME language and script as the chapter text below. If the chapter is in Hindi (Devanagari), write in Hindi. If it is in Sanskrit, write in Sanskrit. If it is in English, write in English. Do not translate the chapter into another language. Proper nouns and established technical terms may stay in their usual form. The JSON keys below stay in English exactly as written; only the values follow the chapter language.
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
  },
];

/**
 * Exam questions are generated PER SECTION, not per chapter — so this is exported as a schema and
 * a prompt builder rather than living in RICH_ASSET_SPECS with the one-shot specs.
 *
 * WHY PER SECTION. Asking for 2-4 questions across every page of a 25-minute chapter in one call
 * produces the largest structured output in the pipeline, and the whole set is lost if any part of
 * it fails to parse. Per section each call is small enough to validate reliably, one bad section
 * costs one section's questions instead of the chapter's, and — the part that actually matters —
 * the page anchor stops being a guess. A chapter-wide call has to infer which page a question came
 * from; a per-section call is told, because the article's sections and concepts already carry
 * ncertPageRef from the source document.
 */
export const ExamQuestionSet = ExamQuestionSetSchema;

/** The pages this section spans, for grounding the anchor rather than asking the model to guess. */
export interface ExamSectionContext {
  title: string;
  /** Page the section starts on. */
  pageRef: number;
  /** Every page its concepts cite — the legal range for a question's ncertPageRef. */
  pages: number[];
  /** Section prose: intro plus concept headings and bodies. */
  text: string;
}

export function examQuestionsPrompt(ctx: ExamSectionContext, chapterTitle: string): string {
  const pageList = ctx.pages.length ? ctx.pages.join(', ') : String(ctx.pageRef);
  return `You are an examiner who has set papers on this syllabus for years. Write the questions most likely to be asked from ONE SECTION of an NCERT chapter.

Chapter: ${chapterTitle}
Section: ${ctx.title}
This section covers NCERT page(s): ${pageList}

Rules:
- Write 2-5 questions. Fewer if the section is short or is only a figure caption; do not pad.
- Set "ncertPageRef" to one of these exact pages: ${pageList}. Do not use any other number.
- Mix types the way a real paper does: "mcq" (four options, exactly one correct), "short" (2-3 marks), "long" (5 marks), "assertion-reason" where the material suits it. Do not make them all MCQs.
- Every question must be answerable from the section text below alone. Do not pull in outside facts.
- LANGUAGE: write the questions, options, answers and explanations in the SAME language and script as the section text below. A Hindi section gets Hindi questions; an English section gets English questions. Do not translate. The JSON keys stay in English; only the values follow the section language.
- "answer" is the actual answer, not a restatement of the question. For an MCQ it must match one of the options character for character.
- "explanation" is why the answer is right, in one or two sentences.
- "whyAsked" is one short line on why this point tends to be examined — a definition students confuse, an exception, a process with ordered steps.
- "likelihood" is "high" for material a paper would be odd to skip, "medium" for the rest. Do not mark everything high.

These are practice questions written from the chapter. They are NOT previous-year questions and must not be described as such.

Output ONLY a JSON array:
[{"id":"q-1","ncertPageRef":${ctx.pageRef},"type":"mcq","question":"...","options":["...","...","...","..."],"answer":"...","explanation":"...","marks":1,"likelihood":"high","whyAsked":"..."}]

Section text:
${ctx.text}`;
}

/** Zod validator wrapper matching the callStructuredLLM `validate` contract. */
export function zodValidator(schema: z.ZodTypeAny) {
  return (d: any) => {
    const r = schema.safeParse(d);
    return { ok: r.success, error: r.success ? undefined : r.error.message };
  };
}
