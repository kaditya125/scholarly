/**
 * KnowledgeRouterService — Multi-Corpus Knowledge Router
 *
 * Implements intelligent corpus routing:
 * Analyzes the student's prompt and educational context to decide WHICH knowledge
 * bases (NCERT, Official Syllabus, PYQs, Reference Books, Study Materials, User Notes)
 * participate in a given turn, and at what priority.
 *
 * Zero vector quarantine — connects every valid corpus appropriately.
 */

import { CorpusRoutingDecision, EducationalIntent } from './knowledgeModel.types';
import { logger } from '../../utils/logger';

export interface RouteRequest {
  query: string;
  notebookId?: string;
  examId?: string;
  subject?: string;
  classGrade?: string;
  topic?: string;
  mode?: string; // 'chat' | 'revision' | 'exam' | 'test' | 'podcast'
}

/** Subjects the curriculum and official syllabus already cover completely. */
const STEM_SUBJECTS = new Set(['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Science']);

export class KnowledgeRouterService {
  /**
   * Plans which corpora to consult for this request.
   * Deterministic logic leads; regex/keyword intent analysis resolves intent without extra LLM cost.
   */
  public route(req: RouteRequest): CorpusRoutingDecision {
    const qLower = (req.query || '').toLowerCase();
    const mode = (req.mode || 'chat').toLowerCase();

    // 1. Detect Intent
    let intent: EducationalIntent = 'GENERAL_LEARNING';
    if (mode === 'revision' || /(revise|revision|summary|formulae|key facts|quick review)/i.test(qLower)) {
      intent = 'REVISION';
    } else if (mode === 'test' || /(test|quiz|mock|assessment|mcq)/i.test(qLower)) {
      intent = 'TEST_GENERATION';
    } else if (/(practice|solve|attempt)\s+(previous year|pyq|past paper)|pyq practice/i.test(qLower)) {
      // `PYQ_PRACTICE` was in the intent union and handled in the switch below, but nothing ever
      // produced it — the EXAM_PREPARATION branch matched "pyq" first, leaving its case
      // unreachable. Routing for the two is identical; this just makes the distinction real.
      intent = 'PYQ_PRACTICE';
    } else if (mode === 'exam' || /(exam|paper|pattern|cutoff|previous year|pyq|question paper)/i.test(qLower)) {
      intent = 'EXAM_PREPARATION';
    } else if (/(syllabus|weightage|marking scheme|blueprint|curriculum topics)/i.test(qLower)) {
      intent = 'SYLLABUS_INQUIRY';
    } else if (/(explain|what is|how does|define|concept|derive|why is)/i.test(qLower)) {
      intent = 'CONCEPT_EXPLANATION';
    } else if (/(who|where|when|fact|capital|currency|born|founded)/i.test(qLower)) {
      intent = 'FACTUAL_QUERY';
    }

    // 2. Normalise Exam ID if present
    let targetExamId = req.examId ? req.examId.toUpperCase().replace(/[\s-]+/g, '_') : undefined;
    if (!targetExamId) {
      if (/(jee|iit|jee main|jee advanced)/i.test(qLower)) targetExamId = 'JEE_MAIN';
      else if (/(ssc cgl|cgl|combined graduate)/i.test(qLower)) targetExamId = 'SSC_CGL';
      else if (/(ssc chsl|chsl)/i.test(qLower)) targetExamId = 'SSC_CHSL';
      else if (/(upsc|civil services|cse|ias|ips)/i.test(qLower)) targetExamId = 'UPSC_CSE';
      else if (/(bpsc|bihar public service)/i.test(qLower)) targetExamId = 'BPSC_CCE';
      else if (/(neet|pmt|medical entrance)/i.test(qLower)) targetExamId = 'NEET_UG';
    }

    // 3. Normalise Subject
    let targetSubject = req.subject;
    if (!targetSubject) {
      if (/(physics|mechanics|optics|thermodynamics|kinematics)/i.test(qLower)) targetSubject = 'Physics';
      else if (/(chemistry|organic|inorganic|chemical reactions|elements)/i.test(qLower)) targetSubject = 'Chemistry';
      else if (/(mathematics|math|calculus|algebra|geometry|trigonometry|integers)/i.test(qLower)) targetSubject = 'Mathematics';
      else if (/(biology|photosynthesis|cell|reproduction|zoology|botany)/i.test(qLower)) targetSubject = 'Biology';
      else if (/(history|ancient|medieval|modern india|nationalism|mughal)/i.test(qLower)) targetSubject = 'History';
      else if (/(geography|climate|rivers|soil|earth|drainage)/i.test(qLower)) targetSubject = 'Geography';
      else if (/(polity|constitution|parliament|fundamental rights|judiciary)/i.test(qLower)) targetSubject = 'Political Science';
      else if (/(reasoning|syllogism|analogy|puzzle|blood relation)/i.test(qLower)) targetSubject = 'reasoning';
      else if (/(quantitative aptitude|percentage|profit and loss|ratio|average|time and work)/i.test(qLower)) targetSubject = 'quantitative_aptitude';
      else if (/(general knowledge|lucent|static gk|capitals|awards)/i.test(qLower)) targetSubject = 'General Knowledge';
    }

    // 4. Determine Active Corpora
    const hasNotebook = Boolean(req.notebookId);
    let useCurriculum = true;
    let useOfficialSyllabus = false;
    let usePYQs = false;
    let useReferenceBooks = false;
    let useStudyMaterials = true;
    let useUserNotebook = hasNotebook;

    const reasons: string[] = [];

    switch (intent) {
      case 'EXAM_PREPARATION':
      case 'PYQ_PRACTICE':
        useOfficialSyllabus = Boolean(targetExamId);
        usePYQs = true;
        useCurriculum = true;
        useReferenceBooks = true; // Lucent / S. Chand for shortcuts & facts
        reasons.push('Exam/PYQ intent: activating Authentic PYQs, Official Syllabus, and Reference Books.');
        break;

      case 'SYLLABUS_INQUIRY':
        useOfficialSyllabus = true;
        useCurriculum = true;
        usePYQs = true; // For showing topic weightage
        reasons.push('Syllabus inquiry: prioritizing Official Syllabus nodes and high-yield PYQ patterns.');
        break;

      case 'REVISION':
        useCurriculum = true;
        useOfficialSyllabus = Boolean(targetExamId);
        usePYQs = true; // High-yield PYQ reminders
        useReferenceBooks = true; // Quick tables & formula summaries
        reasons.push('Revision intent: fusing Chapter text with Reference shortcuts and PYQ recurring themes.');
        break;

      case 'TEST_GENERATION':
        useOfficialSyllabus = Boolean(targetExamId);
        usePYQs = true; // Pattern profile
        useCurriculum = true;
        useReferenceBooks = true;
        reasons.push('Test generation: routing to Exam Blueprint, Syllabus, and PYQ Pattern Intelligence.');
        break;

      case 'CONCEPT_EXPLANATION':
      case 'FACTUAL_QUERY':
      case 'GENERAL_LEARNING':
      default:
        useCurriculum = true;
        // If query asks for GK, reasoning, or quantitative tricks, route to reference books
        if (targetSubject === 'General Knowledge' || targetSubject === 'reasoning' || targetSubject === 'quantitative_aptitude' || /gk|lucent|trick|shortcut/i.test(qLower)) {
          useReferenceBooks = true;
          reasons.push('Concept/GK query: consulting NCERT curriculum alongside Lucent / S. Chand reference material.');
        } else {
          reasons.push('Conceptual query: grounding in primary NCERT curriculum.');
        }
        if (targetExamId) {
          useOfficialSyllabus = true;
          reasons.push(`Target exam ${targetExamId} identified: including Official Syllabus context.`);
        }
        break;
    }

    // Configure Reference Book filters: Subject and Intent specific augmentation
    let referenceBookFilters: CorpusRoutingDecision['referenceBookFilters'] = undefined;
    if (useReferenceBooks) {
      if (targetSubject === 'General Knowledge' || (/gk|lucent|static gk|dynasty|battle|capital|governor|amendment/i.test(qLower) && !/(physics|chemistry|biology|calculus|thermodynamics|optics|integration)/i.test(qLower))) {
        referenceBookFilters = { books: ['lucent_gk'] };
      } else if (targetSubject === 'reasoning' || /reasoning|puzzle|analogy|syllogism|blood relation|direction sense/i.test(qLower)) {
        referenceBookFilters = { books: ['schand_reasoning'] };
      } else if (targetSubject === 'quantitative_aptitude' || /quant|math shortcut|speed math|trachtenberg|vedic math|cube root trick/i.test(qLower)) {
        referenceBookFilters = { books: ['schand_quant'] };
      } else if (/trick|shortcut|mnemonic|formula sheet/i.test(qLower)) {
        // Broad shortcut request: allow reference books
        referenceBookFilters = undefined;
      } else if (STEM_SUBJECTS.has(String(targetSubject))) {
        // Physics, Chemistry, Biology and Mathematics are covered by NCERT and the official
        // syllabus; Lucent GK and the S. Chand reasoning/quant volumes have nothing to add and
        // would only dilute the context.
        useReferenceBooks = false;
      } else if (intent === 'TEST_GENERATION' || intent === 'EXAM_PREPARATION' || intent === 'REVISION') {
        /*
         * These three intents switch reference books ON above, and this block used to switch them
         * straight back OFF for any subject that was not explicitly GK, reasoning or quant —
         * including the common case of no subject at all. A blueprint request would announce
         * "routing to Exam Blueprint, Syllabus, and PYQ Pattern Intelligence" and then generate
         * with no reference material at all.
         *
         * The router's stated decision now survives: books stay on, with no book filter, so the
         * whole reference corpus is eligible and relevance decides which of it is used.
         */
        referenceBookFilters = undefined;
      } else {
        // Any other unclassified subject: no reason to reach for a reference book.
        useReferenceBooks = false;
      }
    }

    return {
      useCurriculum,
      useOfficialSyllabus,
      usePYQs,
      useReferenceBooks,
      useStudyMaterials,
      useUserNotebook,
      targetExamId,
      targetSubject,
      targetClass: req.classGrade,
      targetTopic: req.topic,
      referenceBookFilters,
      reasoning: reasons.join(' '),
    };
  }
}

export const knowledgeRouter = new KnowledgeRouterService();
