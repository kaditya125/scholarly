import { isGreetingMessage } from '../../config/prompts';
import { QueryCategory, IntelligenceInput } from './types';

interface Classification {
  category: QueryCategory;
  confidence: number;
  signals: string[];
}

/**
 * IntentAnalyzer — heuristic, deterministic classification of a query into one of 25 categories
 * (Task 1). Heuristic-first (no LLM call on the hot path → zero added latency/cost). Rules are
 * evaluated in a fixed PRIORITY order; the first confident match wins. An optional LLM fallback
 * can be layered later behind a flag for the ambiguous tail.
 */
export class IntentAnalyzer {
  analyze(input: IntelligenceInput): Classification {
    const raw = (input.query || '').trim();
    const q = raw.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const nonSystemHistory = (input.history || []).filter((m) => m.role !== 'system');
    const has = (re: RegExp) => re.test(q);

    // ── Priority-ordered rules ─────────────────────────────────────────
    // 1. Greeting / casual (reuses the production greeting matcher).
    if (isGreetingMessage(raw)) {
      return { category: 'greeting', confidence: 0.98, signals: ['greeting-matcher'] };
    }

    // 2. Image / attached-document questions (the controller inlines a marker).
    if (/\[file attached:/i.test(raw)) {
      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)\b/i.test(raw) || has(/\b(image|photo|diagram|figure|picture|screenshot)\b/);
      return isImage
        ? { category: 'image_explanation', confidence: 0.9, signals: ['file-marker', 'image-hint'] }
        : { category: 'document_question', confidence: 0.85, signals: ['file-marker'] };
    }

    // 3. Coding / debugging (code fences, errors, language names).
    const codeFence = /```|\bfunction\b|\bclass\b|\bdef\b|=>|console\.log|System\.out|printf/;
    const debugHint = /\b(error|exception|traceback|stack ?trace|bug|not working|won'?t (run|compile)|fix (my|this) code)\b/;
    if (has(debugHint) && (codeFence.test(raw) || has(/\bcode\b/))) {
      return { category: 'debugging', confidence: 0.85, signals: ['debug-hint'] };
    }
    if (codeFence.test(raw) || has(/\b(python|javascript|typescript|java|c\+\+|sql|html|css|algorithm|leetcode)\b.*\b(code|program|implement|write)\b/)) {
      return { category: 'coding', confidence: 0.8, signals: ['code-hint'] };
    }

    // 4. Quiz generation.
    if (has(/\b(quiz|mcqs?|test me|practice questions?|give me questions|multiple choice)\b/)) {
      return { category: 'quiz_generation', confidence: 0.9, signals: ['quiz-keyword'] };
    }

    // 5. Revision.
    if (has(/\b(revise|revision|recap|quick review|help me remember|before (my )?exam)\b/)) {
      return { category: 'revision', confidence: 0.85, signals: ['revision-keyword'] };
    }

    // 6. Summary.
    if (has(/\b(summari[sz]e|summary|tl;?dr|in short|key points|gist)\b/)) {
      return { category: 'summary', confidence: 0.85, signals: ['summary-keyword'] };
    }

    // 7. Translation.
    if (has(/\b(translate|in hindi|in english|meaning in|hindi mein|translation)\b/)) {
      return { category: 'translation', confidence: 0.85, signals: ['translation-keyword'] };
    }

    // 8. Planning.
    if (has(/\b(study plan|timetable|schedule|plan my|roadmap|how (should|do) i prepare|preparation strategy)\b/)) {
      return { category: 'planning', confidence: 0.85, signals: ['planning-keyword'] };
    }

    // 9. Career guidance.
    if (has(/\b(career|which (job|field|stream)|after (10th|12th|graduation)|job opportunities|should i (take|choose))\b/)) {
      return { category: 'career_guidance', confidence: 0.8, signals: ['career-keyword'] };
    }

    // 10. Homework / assignment.
    if (has(/\bassignment\b/)) return { category: 'assignment_help', confidence: 0.8, signals: ['assignment-keyword'] };
    if (has(/\bhomework\b|\bhw\b/)) return { category: 'homework_help', confidence: 0.8, signals: ['homework-keyword'] };

    // 11. Notebook search / document questions.
    if (has(/\b(in my (notes|notebook|material|document|pdf)|from the (chapter|document|pdf|book)|according to (my|the) (notes|document))\b/)) {
      return { category: 'notebook_search', confidence: 0.8, signals: ['notebook-scope'] };
    }
    if (input.notebookId && has(/\b(this (chapter|document|pdf|page|section)|the (uploaded|attached) (file|document))\b/)) {
      return { category: 'document_question', confidence: 0.75, signals: ['notebook-context'] };
    }

    // 12. Comparison.
    if (has(/\b(vs\.?|versus|difference between|compare|comparison|distinguish between|similarities? (and|&) differences?)\b/)) {
      return { category: 'comparison', confidence: 0.85, signals: ['comparison-keyword'] };
    }

    // 13. Numerical / problem solving.
    const mathy = /[0-9].*[+\-*/=^%]|\b\d+\s*(kg|km|m\/s|cm|mol|volts?|ohms?|joules?)\b|\bcalculate\b|\bevaluate\b/;
    if (has(/\b(solve|calculate|evaluate|find the (value|answer)|compute|derive|prove that)\b/) || mathy.test(raw)) {
      const numeric = mathy.test(raw) || has(/\b(calculate|compute|evaluate|numerical)\b/);
      return numeric
        ? { category: 'numerical', confidence: 0.8, signals: ['numeric-hint'] }
        : { category: 'problem_solving', confidence: 0.78, signals: ['problem-keyword'] };
    }

    // 14. Research / deep synthesis.
    if (has(/\b(research|latest|recent (developments|advances)|current|state of the art|literature|in ?depth analysis|comprehensive)\b/) || input.mode === 'RESEARCH') {
      return { category: 'research', confidence: 0.8, signals: ['research-keyword'] };
    }

    // 15. Definition.
    if (has(/^(what (is|are|does)|define|definition of|meaning of|who (is|was)|when (did|was))\b/)) {
      // A "what is X and how does it work" is really a concept explanation.
      if (has(/\b(how|why|explain|works?|process|mechanism)\b/)) {
        return { category: 'concept_explanation', confidence: 0.78, signals: ['what-is+how'] };
      }
      return { category: 'definition', confidence: 0.82, signals: ['definition-keyword'] };
    }

    // 16. Concept explanation.
    if (has(/\b(explain|how (does|do|to)|why (does|is|do)|describe|elaborate|help me understand|concept of)\b/)) {
      return { category: 'concept_explanation', confidence: 0.8, signals: ['concept-keyword'] };
    }

    // 17. Multi-topic (several distinct asks in one message).
    const questionMarks = (raw.match(/\?/g) || []).length;
    if (questionMarks >= 2 || (has(/\band\b/) && questionMarks >= 1 && words.length > 18)) {
      return { category: 'multi_topic', confidence: 0.7, signals: ['multi-question'] };
    }

    // 18. Follow-up (short, pronoun-led, with prior turns).
    if (nonSystemHistory.length >= 2 && words.length <= 8 && has(/^(what about|and|also|then|why|how|explain more|tell me more|continue|elaborate|it|that|this|those|these)\b/)) {
      return { category: 'follow_up', confidence: 0.72, signals: ['short+pronoun+history'] };
    }

    // 19. Casual vs general chat fallback.
    if (words.length <= 4 && !has(/[a-z]{5,}/)) {
      return { category: 'casual_conversation', confidence: 0.5, signals: ['short-non-educational'] };
    }
    if (words.length > 0) {
      return { category: 'general_chat', confidence: 0.45, signals: ['fallback-general'] };
    }

    return { category: 'unknown', confidence: 0.2, signals: ['empty-or-unclassified'] };
  }
}

export const intentAnalyzer = new IntentAnalyzer();
