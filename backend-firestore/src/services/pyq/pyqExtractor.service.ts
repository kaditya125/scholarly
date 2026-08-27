/**
 * PYQExtractorService — Robust Document Extraction and Normalization for PYQs
 *
 * Handles:
 * - Mathematical notation preservation (LaTeX $...$, fractions, integrals, superscripts, chemical formulas)
 * - Multiple question structures (Single MCQ, Multi-correct, Numerical, Assertion-Reason, Match the Following, Passages)
 * - Diagram and visual asset referencing
 * - Extraction Quality Scoring (0.0 to 1.0) for OCR confidence governance
 */

import * as crypto from 'crypto';
import { callStructuredLLM } from '../ai/structuredLlm';
import {
  CanonicalPYQQuestion,
  PYQQuestionType,
  PYQDifficulty,
  PYQSourceTier,
  PYQRightsStatus,
  PYQProvenanceRecord,
  PYQLanguage,
} from '../../types/pyq.types';
import { logger } from '../../utils/logger';

export interface RawExtractedQuestion {
  questionNumber: number;
  questionText: string;
  questionType: PYQQuestionType;
  options?: string[];
  correctAnswer?: string;
  solution?: string;
  explanation?: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: PYQDifficulty;
  marks?: number;
  negativeMarks?: number;
  language?: PYQLanguage;
  passageText?: string;
  matchData?: {
    leftColumn: { id: string; text: string }[];
    rightColumn: { id: string; text: string }[];
    correctMapping: Record<string, string>;
  };
  hasDiagram?: boolean;
  diagramDescription?: string;
  confidenceScore?: number; // 0.0 to 1.0
}

export class PYQExtractorService {
  /**
   * Normalizes mathematical formulas, superscripts, subscripts, and chemical formulas into clean LaTeX.
   */
  public normalizeMathAndScienceNotation(text: string): string {
    if (!text) return '';

    let normalized = text;

    // Convert Unicode superscripts: ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻
    const superscriptMap: Record<string, string> = {
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
      '⁺': '+', '⁻': '-', 'ⁿ': 'n', 'ˣ': 'x', 'ʸ': 'y'
    };
    normalized = normalized.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣʸ]+/g, (match) => {
      const converted = match.split('').map((c) => superscriptMap[c] || c).join('');
      return `^{${converted}}`;
    });

    // Convert Unicode subscripts: ₀₁₂₃₄₅₆₇₈₉₊₋
    const subscriptMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
      '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
      '₊': '+', '₋': '-'
    };
    normalized = normalized.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋]+/g, (match) => {
      const converted = match.split('').map((c) => subscriptMap[c] || c).join('');
      return `_{${converted}}`;
    });

    // Normalize common math symbols and Greek letters
    normalized = normalized
      .replace(/\bsqrt\((.*?)\)/g, '\\sqrt{$1}')
      .replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}')
      .replace(/√\((.*?)\)/g, '\\sqrt{$1}')
      .replace(/∫/g, '\\int ')
      .replace(/π|\bpi\b/g, '\\pi')
      .replace(/∑/g, '\\sum ')
      .replace(/Δ/g, '\\Delta ')
      .replace(/θ|\btheta\b/g, '\\theta')
      .replace(/λ|\blambda\b/g, '\\lambda')
      .replace(/μ|\bmu\b/g, '\\mu')
      .replace(/Ω|\bomega\b/g, '\\Omega')
      .replace(/±/g, '\\pm ')
      .replace(/≤/g, '\\le ')
      .replace(/≥/g, '\\ge ')
      .replace(/≠/g, '\\ne ')
      .replace(/×/g, '\\times ')
      .replace(/÷/g, '\\div ');

    // Normalize Chemical Formulas (e.g. H_2SO_4, Na^+, Cl^-)
    normalized = normalized
      .replace(/\bH_{2}SO_{4}\b/g, '\\text{H}_2\\text{SO}_4')
      .replace(/\bH2SO4\b/g, '\\text{H}_2\\text{SO}_4')
      .replace(/\bNa\^\+\b|\bNa\+(?!\w)/g, '\\text{Na}^+')
      .replace(/\bCl\^-\b|\bCl-(?!\w)/g, '\\text{Cl}^-')
      .replace(/\bCO2\b/g, '\\text{CO}_2')
      .replace(/\bH2O\b/g, '\\text{H}_2\\text{O}');

    return normalized.trim();
  }

  /**
   * Generates deterministic Content Hash for deduplication.
   */
  public generateQuestionHash(
    examId: string,
    questionText: string,
    options?: string[],
    questionNumber?: number
  ): string {
    const normText = questionText.trim().toLowerCase().replace(/\s+/g, ' ');
    const normOpts = (options || []).map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
    return crypto
      .createHash('sha256')
      .update(`${examId}::${normText}::${normOpts}`)
      .digest('hex');
  }

  /**
   * System Prompt for High-Precision LLM Question Extraction from Raw Paper Sections.
   */
  private extractionSystemPrompt(examName: string): string {
    return `You are a high-precision Examination Question Normalizer for Indian Competitive Exams (${examName}).
You are given a section of a Previous Year Question Paper / Answer Key document.
Your task is to extract individual questions accurately, preserving exact mathematical expressions in standard LaTeX format ($...$).

Return ONLY valid JSON with this exact structure:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Question text with LaTeX math like $x^2 + \\sqrt{2x} = 0$",
      "questionType": "MCQ_SINGLE" | "MCQ_MULTIPLE" | "NUMERICAL" | "ASSERTION_REASON" | "MATCH_FOLLOWING" | "PASSAGE_COMPREHENSION",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "A" or "24.5" or "A,C",
      "solution": "Step-by-step solution if present",
      "explanation": "Brief explanation if present",
      "subject": "Physics" | "Chemistry" | "Mathematics" | "Biology" | "General Studies" | "Quantitative Aptitude" | "Reasoning" | "English",
      "chapter": "Electrostatics",
      "topic": "Electric Potential",
      "subtopic": "Capacitance",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "marks": 4,
      "negativeMarks": 1,
      "language": "en" | "hi" | "bilingual",
      "hasDiagram": true | false,
      "diagramDescription": "Description of the required diagram/circuit/graph",
      "confidenceScore": 0.98
    }
  ]
}

RULES:
1. Preserve mathematical formulas, chemical structures, fractions, integrals, powers, and equations in clean LaTeX ($...$).
2. For Numerical questions without options, set "questionType": "NUMERICAL" and "options": [].
3. For Assertion/Reason questions, label statements clearly and set "questionType": "ASSERTION_REASON".
4. If a diagram, circuit, graph, or figure is required to answer the question, set "hasDiagram": true and describe it in "diagramDescription".
5. Calculate "confidenceScore" between 0.0 and 1.0 (reduce score if OCR had artifacts, smudged characters, or missing option text).
6. Do NOT fabricate questions. If a section contains instructions only, return {"questions": []}.`;
  }

  /**
   * Extracts structured questions from document text.
   */
  async extractQuestionsFromRawText(params: {
    examId: string;
    examName: string;
    year: number;
    session?: string;
    paper?: string;
    shift?: string;
    sourceId: string;
    sourceUrl: string;
    sourceTier: PYQSourceTier;
    sourceName: string;
    rawText: string;
    rightsStatus?: PYQRightsStatus;
  }): Promise<CanonicalPYQQuestion[]> {
    const {
      examId,
      examName,
      year,
      session,
      paper,
      shift,
      sourceId,
      sourceUrl,
      sourceTier,
      sourceName,
      rawText,
      rightsStatus = 'OFFICIAL_SOURCE_REVIEWED',
    } = params;

    logger.info(`[PYQExtractor] Extracting questions for ${examId} ${year} ${session || ''} ${shift || ''}`);

    const result = await callStructuredLLM<{ questions: RawExtractedQuestion[] }>({
      prompt: `Document text for ${examName} (${year} ${session || ''} ${shift || ''}):\n\n${rawText.slice(0, 35000)}`,
      system: this.extractionSystemPrompt(examName),
      validate: (data) =>
        Array.isArray(data?.questions)
          ? { ok: true }
          : { ok: false, error: 'Expected a "questions" array' },
      label: `extract_pyq_${examId}_${year}`,
    });

    if (!result.ok || !result.data?.questions) {
      throw new Error(`[PYQExtractor] Extraction failed for ${sourceId}: ${result.error || 'Invalid shape'}`);
    }

    const canonicalQuestions: CanonicalPYQQuestion[] = [];
    const now = Date.now();

    for (const raw of result.data.questions) {
      if (!raw.questionText || raw.questionText.trim().length === 0) continue;

      const normText = this.normalizeMathAndScienceNotation(raw.questionText);
      const normOptions = (raw.options || []).map((opt) => this.normalizeMathAndScienceNotation(opt));
      const contentHash = this.generateQuestionHash(examId, normText, normOptions, raw.questionNumber);
      
      const deterministicQId = `pyq:${examId.toLowerCase()}:${year}:${(session || 'main').toLowerCase().replace(/\s+/g, '_')}:${(shift || 'p1').toLowerCase().replace(/\s+/g, '_')}:q${raw.questionNumber}:${contentHash.slice(0, 8)}`;

      const provenance: PYQProvenanceRecord = {
        sourceTier,
        sourceName,
        sourceUrl,
        sourceDomain: new URL(sourceUrl).hostname,
        retrievedAt: now,
        isOfficial: sourceTier === 'TIER_A_OFFICIAL',
        extractedAnswer: raw.correctAnswer,
        extractedSolution: raw.solution,
        contentHash,
      };

      const qualityScore = raw.confidenceScore !== undefined ? raw.confidenceScore : 0.95;

      const canonicalQuestion: CanonicalPYQQuestion = {
        questionId: deterministicQId,
        examId,
        examName,
        year,
        session,
        paper,
        shift,
        subject: raw.subject || 'General',
        chapter: raw.chapter,
        topic: raw.topic,
        subtopic: raw.subtopic,
        questionNumber: raw.questionNumber || canonicalQuestions.length + 1,
        questionText: normText,
        questionType: raw.questionType || 'MCQ_SINGLE',
        options: normOptions.length > 0 ? normOptions : undefined,
        correctAnswer: raw.correctAnswer || 'UNVERIFIED',
        correctAnswerSource: sourceName,
        solution: raw.solution,
        solutionSource: raw.solution ? sourceName : undefined,
        explanation: raw.explanation,
        difficulty: raw.difficulty || 'MEDIUM',
        marks: raw.marks || 4,
        negativeMarks: raw.negativeMarks || 1,
        language: raw.language || 'en',
        passageText: raw.passageText,
        diagrams: raw.hasDiagram
          ? [
              {
                assetId: `diag_${deterministicQId}`,
                storagePath: `pyq_diagrams/${examId}/${year}/${deterministicQId}.png`,
                altText: raw.diagramDescription || 'Question Diagram',
                isRequiredForAnswering: true,
              },
            ]
          : undefined,
        extractionQualityScore: qualityScore,
        sourceId,
        sourceUrl,
        sourceType: sourceTier,
        provenanceRecords: [provenance],
        verificationStatus: sourceTier === 'TIER_A_OFFICIAL' ? 'OFFICIAL_CONFIRMED' : 'SECONDARY_CONFIRMED',
        rightsStatus,
        rightsSource: sourceName,
        redistributionAllowed: rightsStatus === 'OFFICIAL_SOURCE_REVIEWED' || rightsStatus === 'PUBLIC_DOMAIN_OR_CLEAR',
        contentHash,
        ingestionState: 'EXTRACTED',
        vectorIndexed: false,
        retrievalTested: false,
        createdAt: now,
        updatedAt: now,
      };

      canonicalQuestions.push(canonicalQuestion);
    }

    return canonicalQuestions;
  }
}

export const pyqExtractorService = new PYQExtractorService();
