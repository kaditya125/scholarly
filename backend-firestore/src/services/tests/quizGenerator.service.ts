import { GeminiProvider } from '../ai/gemini.provider';
import { UserStatsService } from '../userStats.service';
import { knowledgeService } from '../../core/knowledge';

/** A generated MCQ in the exact shape the frontend test engine consumes. */
export interface QuizQuestion {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

/** Map a model's "correctAnswer" (index, letter "A", or the option text) to an index. */
function resolveCorrectIndex(correctAnswer: any, options: string[]): number {
  if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
    return correctAnswer;
  }
  if (typeof correctAnswer === 'string') {
    const s = correctAnswer.trim();
    const letter = s.toUpperCase();
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(letter)) return letter.charCodeAt(0) - 65;
    const idx = options.findIndex((o) => String(o).trim().toLowerCase() === s.toLowerCase());
    if (idx >= 0) return idx;
  }
  return 0; // safe default (first option) rather than dropping the question
}

/**
 * Generates a real, adaptive multiple-choice quiz with Gemini, targeting the student's
 * weak topics (or an explicitly requested topic). Returns questions in the frontend
 * Question shape so the existing /test engine can render + score them directly.
 */
export class QuizGeneratorService {
  private llm = new GeminiProvider();
  private statsService = new UserStatsService();

  async generateWeakAreaQuiz(
    userId: string,
    opts: { topic?: string; count?: number; difficulty?: string; notebookId?: string } = {}
  ): Promise<{ focus: string; questions: QuizQuestion[] }> {
    const count = Math.min(Math.max(opts.count || 10, 3), 20);

    // Pull the student's real weak topics + exam context to target the quiz.
    let weak: string[] = [];
    let exam = 'a general competitive exam';
    try {
      const stats: any = await this.statsService.getUserStats(userId);
      weak = Array.isArray(stats?.weakTopics) ? stats.weakTopics : [];
      exam = stats?.activeExam || exam;
    } catch { /* fall back to defaults */ }

    const focus = opts.topic
      ? opts.topic
      : weak.length > 0
        ? weak.slice(0, 3).join(', ')
        : `core concepts for ${exam}`;
    const difficulty = opts.difficulty || 'medium';

    // When launched from a specific book/chapter ("take a test from my resources"), ground the
    // questions in the ACTUAL retrieved chunks for that notebook instead of asking the model to
    // invent questions purely from its own knowledge of the topic string.
    let groundingBlock = '';
    if (opts.notebookId) {
      try {
        const contextBundle = await knowledgeService.getSourceContext(focus, opts.notebookId, {
          topK: 8,
          includeKnowledgeGraph: false,
          artifactType: 'QUIZ',
          consumerContext: 'Adaptive Quiz Generation',
        });
        if (contextBundle.passages.length > 0) {
          groundingBlock = `\n\nBase every question STRICTLY on the following source material (do not invent facts outside it):\n${contextBundle.passages.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n')}`;
        }
      } catch (e) {
        console.warn('[QuizGenerator] Notebook-grounded retrieval failed, falling back to ungrounded quiz:', e);
      }
    }

    const system = 'You are an expert exam question writer. You output STRICTLY valid JSON only — no markdown fences, no commentary, no trailing text.';
    const prompt = `Create exactly ${count} multiple-choice questions that help a student improve on their WEAK areas.
Focus topics: ${focus}
Exam context: ${exam}. Difficulty: ${difficulty}.

Rules:
- Each question has EXACTLY 4 options.
- Exactly one option is correct.
- "correctAnswerIndex" is the 0-based index of the correct option.
- Keep each explanation to 1-2 sentences.
- Vary the questions across the focus topics; make them exam-realistic.${groundingBlock}

Output ONLY a JSON array in EXACTLY this shape (no other keys):
[{"text":"the question","topic":"specific sub-topic","options":["opt A","opt B","opt C","opt D"],"correctAnswerIndex":0,"explanation":"why the correct option is right"}]`;

    const resp = await this.llm.generateResponse(
      [{ role: 'user', content: prompt, timestamp: Date.now() }],
      system,
      { userId, operation: 'quiz_generation' }
    );

    // Strip any stray fences/prose and isolate the JSON array.
    let raw = (resp.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

    let parsed: any[] = [];
    try { parsed = JSON.parse(raw); } catch { parsed = []; }

    const questions: QuizQuestion[] = (Array.isArray(parsed) ? parsed : [])
      .filter((q) => q && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, count)
      .map((q, i) => {
        const options = q.options.map((o: any) => String(o));
        return {
          id: `q_${Date.now()}_${i}`,
          text: String(q.text || q.question || '').trim(),
          topic: String(q.topic || focus).trim(),
          options,
          correctAnswerIndex: resolveCorrectIndex(
            q.correctAnswerIndex !== undefined ? q.correctAnswerIndex : q.correctAnswer,
            options
          ),
          explanation: String(q.explanation || '').trim(),
        };
      })
      .filter((q) => q.text && q.options.length >= 2);

    return { focus, questions };
  }
}

export const quizGeneratorService = new QuizGeneratorService();
