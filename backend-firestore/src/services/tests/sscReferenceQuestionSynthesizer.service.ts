import { referenceBooksService } from '../rag/referenceBooks.service';
import { pyqRepository } from '../../repositories/pyq.repository';
import { GeminiProvider } from '../ai/gemini.provider';
import { Question, Difficulty } from '../../types/tests.types';
import { CanonicalPYQQuestion } from '../../types/pyq.types';
import { logger } from '../../utils/logger';

export interface ReferenceTopicTarget {
  subject: string;
  topic: string;
  bookCodes: string[];
  bookTitle: string;
  count: number;
  difficulty?: Difficulty;
}

const llm = new GeminiProvider();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCorrectIndex(correctAnswer: any, options: string[]): number {
  if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
    return correctAnswer;
  }
  if (typeof correctAnswer === 'string') {
    const s = correctAnswer.trim();
    const letter = s.toUpperCase();
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(letter)) {
      return letter.charCodeAt(0) - 65;
    }
    const idx = options.findIndex((o) => String(o).trim().toLowerCase() === s.toLowerCase());
    if (idx >= 0) return idx;
    const num = parseInt(s, 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      return num - 1;
    }
  }
  return 0;
}

export class SscReferenceQuestionSynthesizerService {
  /**
   * Generates authentic SSC CGL-pattern MCQs based strictly on standard reference book passages,
   * conditioned on actual SSC CGL past-year questions as style & difficulty exemplars.
   */
  async synthesizeQuestionsForTopic(target: ReferenceTopicTarget): Promise<Question[]> {
    logger.info(`[ReferenceSynthesizer] Synthesizing for ${target.subject} -> ${target.topic}`);

    // 1. Retrieve authoritative textbook passages
    const passages = await referenceBooksService
      .retrieveReferenceContext(`${target.subject} ${target.topic}`, {
        topK: 4,
        book: target.bookCodes,
        examCode: 'SSC_CGL',
      })
      .catch(() => []);

    const groundingPassage = passages.map((p, i) => `[Textbook Excerpt ${i + 1}]\n${p.text}`).join('\n\n');

    // 2. Retrieve 3-4 real SSC CGL PYQ exemplars to condition formatting and difficulty
    let pyqExemplars: CanonicalPYQQuestion[] = await pyqRepository
      .listQuestions({
        examId: 'SSC_CGL',
        topic: target.topic,
        limit: 4,
      })
      .catch(() => []);

    if (pyqExemplars.length < 2) {
      const broader = await pyqRepository
        .listQuestions({
          examId: 'SSC_CGL',
          subject: target.subject,
          limit: 4,
        })
        .catch(() => []);
      pyqExemplars = [...pyqExemplars, ...broader].slice(0, 4);
    }

    const pyqExemplarText = pyqExemplars
      .map(
        (q, i) =>
          `[PYQ Exemplar ${i + 1}] (Exam: SSC CGL, Year: ${q.year || '2024'}, Shift: ${q.shift || '1'})\n` +
          `Question: ${q.questionText}\n` +
          `Options: ${q.options?.join(' | ')}\n` +
          `Correct: Option ${(q.options || [])[resolveCorrectIndex(q.correctAnswer, q.options || [])] || q.correctAnswer}`
      )
      .join('\n\n');

    // 3. Prompt Gemini with textbook grounding + PYQ pattern conditioning
    const systemPrompt =
      'You are a senior exam paper creator for the Staff Selection Commission (SSC) Combined Graduate Level (CGL) examination. ' +
      'You write authentic multiple-choice questions grounded in standard reference textbooks that match the exact difficulty, concise phrasing, option traps, and pattern of official SSC CGL PYQs. ' +
      'You output STRICTLY valid JSON only — no commentary, no markdown ticks, no preamble.';

    const userPrompt = `You must create exactly ${target.count} multiple-choice question(s) for SSC CGL Tier 1.
Subject: ${target.subject}
Topic: ${target.topic}
Difficulty: ${target.difficulty || 'Medium'}
Reference Source: ${target.bookTitle}

==================================================
AUTHORITATIVE REFERENCE TEXTBOOK MATERIAL:
==================================================
${groundingPassage || `Core principles, formulas, and rules of ${target.subject} - ${target.topic} as covered in ${target.bookTitle}.`}

==================================================
OFFICIAL SSC CGL PYQ EXAM PATTERN & STYLE EXEMPLARS:
==================================================
${pyqExemplarText || 'Official SSC CGL Tier 1 questions are concise, conceptual, tested with 4 options, and have 1 clear unambiguous answer.'}

==================================================
CRITICAL DESIGN RULES:
==================================================
1. Base the factual question, theorem, vocabulary rule, or problem directly on the Reference Textbook material.
2. Mirror the EXACT formatting, concise phrasing style, and difficulty level of the Official SSC CGL PYQ Exemplars.
3. Provide EXACTLY 4 options (A, B, C, D) with plausible distractors common in SSC exams.
4. "correctAnswerIndex" MUST be the 0-based integer index (0, 1, 2, or 3) of the correct option.
5. Provide a crisp, educational explanation (2-3 sentences) referencing the textbook rule or step-by-step formula.

Output ONLY a JSON array with this exact structure:
[
  {
    "text": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswerIndex": 0,
    "explanation": "Step-by-step reasoning or textbook rule reference."
  }
]`;

    try {
      const resp = await llm.generateResponse(
        [{ role: 'user', content: userPrompt, timestamp: Date.now() }],
        systemPrompt,
        { userId: 'ssc-reference-synthesizer', operation: 'ssc_reference_question_gen' }
      );

      let clean = (resp.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      const sIdx = clean.indexOf('[');
      const eIdx = clean.lastIndexOf(']');
      if (sIdx >= 0 && eIdx > sIdx) {
        clean = clean.slice(sIdx, eIdx + 1);
      }

      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) return [];

      const questions: Question[] = parsed
        .filter((q: any) => q && Array.isArray(q.options) && q.options.length >= 4 && q.text)
        .slice(0, target.count)
        .map((q: any, i: number) => {
          const options = q.options.map((o: any) => String(o).trim());
          const primaryPassage = passages[0]?.metadata || {};
          return {
            id: `ref_${target.bookCodes[0]}_${target.topic.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}_${i}`,
            subject: target.subject,
            topic: target.topic,
            difficulty: target.difficulty || 'Medium',
            text: String(q.text).trim(),
            options,
            correctAnswerIndex: resolveCorrectIndex(q.correctAnswerIndex, options),
            explanation: String(q.explanation || '').trim(),
            marks: 2.0,
            negativeMarks: 0.5,
            examId: 'SSC_CGL',
            section: target.subject,
            questionOrigin: 'REFERENCE_BOOK' as const,
            sourcePaper: target.bookTitle,
            sourceShift: primaryPassage.chapter ? String(primaryPassage.chapter) : undefined,
          };
        });

      // Rate limit delay to safeguard Vertex AI quotas
      await sleep(1200);
      return questions;
    } catch (err: any) {
      logger.error(`[ReferenceSynthesizer] Failed generating for ${target.topic}: ${err?.message}`);
      await sleep(1200);
      return [];
    }
  }
}

export const sscReferenceQuestionSynthesizerService = new SscReferenceQuestionSynthesizerService();