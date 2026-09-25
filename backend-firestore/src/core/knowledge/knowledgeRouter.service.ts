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

/** Computer Science & Teaching Methodology domains with dedicated reference textbooks in Qdrant. */
const CS_SUBJECTS = new Set([
  'computer_science',
  'database_management',
  'operating_systems',
  'computer_networks',
  'computer_architecture',
  'data_structures',
  'pedagogy',
  'english',
  'ethics',
]);

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
    if (/^(what\s*can\s*you\s*do|how\s*can\s*you\s*help|what\s*do\s*you\s*do|what\s*are\s*you|what\s*are\s*your\s*features|who\s*are\s*you|who\s*made\s*you|what\s*is\s*your\s*name|tell\s*me\s*about\s*yourself|what\s*is\s*sadhya|how\s*does\s*this\s*work|how\s*do\s*you\s*work|hello|hi|hey|greetings|help|guide\s*me|can\s*you\s*help|thank\s*you|thanks|bye|goodbye)\b/i.test(qLower)) {
      intent = 'CONVERSATIONAL';
    } else if (mode === 'revision' || /(revise|revision|summary|formulae|key facts|quick review)/i.test(qLower)) {
      intent = 'REVISION';
    } else if (mode === 'test' || /(test|quiz|mock|assessment|mcq)/i.test(qLower)) {
      intent = 'TEST_GENERATION';
    } else if (/(practice|solve|attempt)\s+(previous year|pyq|past paper)|pyq practice/i.test(qLower)) {
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
      if (/(bpsc tre|bpsc_tre|bihar teacher|tre 1|tre 2|tre 3|tre 4)/i.test(qLower)) targetExamId = 'BPSC_TRE';
      else if (/(stet|bihar stet)/i.test(qLower)) targetExamId = 'STET';
      else if (/(jee|iit|jee main|jee advanced)/i.test(qLower)) targetExamId = 'JEE_MAIN';
      else if (/(ssc cgl|cgl|combined graduate)/i.test(qLower)) targetExamId = 'SSC_CGL';
      else if (/(ssc chsl|chsl)/i.test(qLower)) targetExamId = 'SSC_CHSL';
      else if (/(upsc|civil services|cse|ias|ips)/i.test(qLower)) targetExamId = 'UPSC_CSE';
      else if (/(bpsc|bihar public service)/i.test(qLower)) targetExamId = 'BPSC_CCE';
      else if (/(neet|pmt|medical entrance)/i.test(qLower)) targetExamId = 'NEET_UG';
    }

    // 3. Normalise Subject
    let targetSubject = req.subject;
    if (!targetSubject) {
      if (/(dbms|database|\bsql\b|relational|acid|transaction|normalization|bcnf|3nf)/i.test(qLower)) targetSubject = 'database_management';
      else if (/(operating system|deadlock|virtual memory|paging|page fault|semaphore|cpu scheduling)/i.test(qLower)) targetSubject = 'operating_systems';
      else if (/(computer network|networking|\btcp\b|\bip\b|\bosi\b|csma|\budp\b|sliding window|routing|ip addressing)/i.test(qLower)) targetSubject = 'computer_networks';
      else if (/(computer architecture|digital logic|flip.flop|\bdma\b|multiplexer|instruction cycle|register transfer)/i.test(qLower)) targetSubject = 'computer_architecture';
      else if (/(data structure|binary search tree|avl|linked list|stack|queue|quicksort|sorting algorithm)/i.test(qLower)) targetSubject = 'data_structures';
      else if (/(pedagogy|art of teaching|teaching methodology|micro teaching|lesson plan|bloom taxonomy)/i.test(qLower)) targetSubject = 'pedagogy';
      else if (/(computer science|\bpython\b|programming|\bcoding\b|\boop\b|\boops\b)/i.test(qLower)) targetSubject = 'computer_science';
      else if (/(physics|mechanics|optics|thermodynamics|kinematics)/i.test(qLower)) targetSubject = 'Physics';
      else if (/(chemistry|organic|inorganic|chemical reactions|elements)/i.test(qLower)) targetSubject = 'Chemistry';
      else if (/(mathematics|math|calculus|algebra|geometry|trigonometry|integers)/i.test(qLower)) targetSubject = 'Mathematics';
      else if (/(biology|photosynthesis|cell|reproduction|zoology|botany)/i.test(qLower)) targetSubject = 'Biology';
      else if (/(art and culture|classical dance|temple architecture|unesco heritage|sculpture|paintings|mughal architecture|bhakti movement|sufi|singhania)/i.test(qLower)) targetSubject = 'art_and_culture';
      else if (/(history|ancient|medieval|modern india|nationalism|mughal|british|freedom struggle|revolt of 1857|gandhi|congress session|non-cooperation|civil disobedience|spectrum)/i.test(qLower)) targetSubject = 'History';
      else if (/(geography|climate|rivers|soil|earth|drainage|landforms|monsoon|volcano|earthquake|atmosphere|ocean|gc leong)/i.test(qLower)) targetSubject = 'Geography';
      else if (/(polity|constitution|parliament|fundamental rights|judiciary|governor|president|directive principles|amendment|article \d+|panchayat|laxmikanth)/i.test(qLower)) targetSubject = 'Political Science';
      else if (/(economy|economics|inflation|gdp|fiscal policy|monetary policy|rbi|budget|banking|repo rate|balance of payments|ramesh singh)/i.test(qLower)) targetSubject = 'Economics';
      else if (/(environment|ecology|biodiversity|climate change|global warming|pollution|ecosystem|wetland|ramsar|national park|wildlife|shankar)/i.test(qLower)) targetSubject = 'Environment';
      else if (/(reasoning|syllogism|analogy|puzzle|blood relation)/i.test(qLower)) targetSubject = 'reasoning';
      else if (/(quantitative aptitude|percentage|profit and loss|ratio|average|time and work)/i.test(qLower)) targetSubject = 'quantitative_aptitude';
      else if (/(bihar|bpsc|kunwar singh|champaran|kisan sabha|sahajanand|magadha|nalanda|patliputra|sher shah suri|kosi river|gandak river)/i.test(qLower)) targetSubject = 'bihar_special';
      else if (/(english|grammar|comprehension|vocabulary|synonym|antonym|idiom|sp bakshi|neetu singh|norman lewis|plinth to paramount|word power)/i.test(qLower)) targetSubject = 'english';
      else if (/(ethics|integrity|aptitude|moral philosophy|civil services ethics|gs paper iv|lexicon)/i.test(qLower)) targetSubject = 'ethics';
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
      case 'CONVERSATIONAL':
        useCurriculum = false;
        useOfficialSyllabus = false;
        usePYQs = false;
        useReferenceBooks = false;
        useStudyMaterials = false;
        useUserNotebook = false;
        reasons.push('Conversational/capability intent: bypassing textbook and curriculum retrieval.');
        break;

      case 'EXAM_PREPARATION':
      case 'PYQ_PRACTICE':
        useOfficialSyllabus = Boolean(targetExamId);
        usePYQs = true;
        useCurriculum = !CS_SUBJECTS.has(String(targetSubject));
        useReferenceBooks = true; // Lucent / S. Chand / CS reference textbooks
        reasons.push('Exam/PYQ intent: activating Authentic PYQs, Official Syllabus, and Reference Books.');
        break;

      case 'SYLLABUS_INQUIRY':
        useOfficialSyllabus = true;
        useCurriculum = !CS_SUBJECTS.has(String(targetSubject));
        usePYQs = true; // For showing topic weightage
        reasons.push('Syllabus inquiry: prioritizing Official Syllabus nodes and high-yield PYQ patterns.');
        break;

      case 'REVISION':
        useCurriculum = !CS_SUBJECTS.has(String(targetSubject));
        useOfficialSyllabus = Boolean(targetExamId);
        usePYQs = true; // High-yield PYQ reminders
        useReferenceBooks = true; // Quick tables & formula summaries
        reasons.push('Revision intent: fusing Chapter text with Reference shortcuts and PYQ recurring themes.');
        break;

      case 'TEST_GENERATION':
        useOfficialSyllabus = Boolean(targetExamId);
        usePYQs = true; // Pattern profile
        useCurriculum = !CS_SUBJECTS.has(String(targetSubject));
        useReferenceBooks = true;
        reasons.push('Test generation: routing to Exam Blueprint, Syllabus, and PYQ Pattern Intelligence.');
        break;

      case 'CONCEPT_EXPLANATION':
      case 'FACTUAL_QUERY':
      case 'GENERAL_LEARNING':
      default:
        if (CS_SUBJECTS.has(String(targetSubject))) {
          useCurriculum = false;
          useReferenceBooks = true;
          reasons.push(`Domain is Computer Science / Pedagogy (${targetSubject}): routing exclusively to authoritative Qdrant reference textbooks, skipping K-12 NCERT curriculum.`);
        } else if (
          targetSubject === 'General Knowledge' ||
          targetSubject === 'reasoning' ||
          targetSubject === 'quantitative_aptitude' ||
          targetSubject === 'polity' ||
          targetSubject === 'Political Science' ||
          targetSubject === 'History' ||
          targetSubject === 'art_and_culture' ||
          targetSubject === 'Geography' ||
          targetSubject === 'Economics' ||
          targetSubject === 'Environment' ||
          targetSubject === 'bihar_special' ||
          targetSubject === 'Physics' ||
          targetSubject === 'Chemistry' ||
          targetSubject === 'Biology' ||
          targetSubject === 'Mathematics' ||
          targetExamId === 'JEE_MAIN' ||
          targetExamId === 'JEE_ADVANCED' ||
          targetExamId === 'NEET_UG' ||
          /gk|lucent|trick|shortcut|polity|constitution|fundamental rights|parliament|governor|supreme court|laxmikanth|spectrum|modern history|gc leong|ramesh singh|shankar|singhania|rs sharma|satish chandra|bipan chandra|bihar|bpsc|kunwar singh|hc verma|hcv|irodov|jd lee|trueman|campbell|hall knight|sl loney/i.test(qLower)
        ) {
          useCurriculum = true;
          useReferenceBooks = true;
          reasons.push('Concept query: consulting curriculum alongside standard reference textbooks (H.C. Verma / Irodov / J.D. Lee / Trueman / Campbell / Laxmikanth / Spectrum / Lucent).');
        } else {
          useCurriculum = true;
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
      if (targetSubject === 'database_management') {
        referenceBookFilters = { books: ['silberschatz_dbms', 'ncert_cs_12'] };
      } else if (targetSubject === 'operating_systems') {
        referenceBookFilters = { books: ['galvin_os', 'ncert_cs_11'] };
      } else if (targetSubject === 'computer_networks') {
        referenceBookFilters = { books: ['forouzan_networks', 'ncert_cs_12'] };
      } else if (targetSubject === 'computer_architecture') {
        referenceBookFilters = { books: ['mano_architecture', 'ncert_cs_11'] };
      } else if (targetSubject === 'data_structures') {
        referenceBookFilters = { books: ['lipschutz_dsa', 'ncert_cs_12'] };
      } else if (targetSubject === 'pedagogy') {
        referenceBookFilters = { books: ['skinner_educational_psychology', 'stet_pedagogy_guide'] };
      } else if (targetSubject === 'computer_science') {
        referenceBookFilters = { books: ['ncert_cs_11', 'ncert_cs_12', 'silberschatz_dbms', 'galvin_os', 'forouzan_networks', 'mano_architecture', 'lipschutz_dsa'] };
      } else if (targetSubject === 'Political Science' || targetSubject === 'polity' || /polity|constitution|fundamental rights|parliament|governor|supreme court|laxmikanth/i.test(qLower)) {
        referenceBookFilters = { books: ['laxmikanth_polity'] };
      } else if (targetSubject === 'bihar_special' || /bihar|bpsc|kunwar singh|champaran|sahajanand|magadha|nalanda|patliputra|sher shah suri/i.test(qLower)) {
        referenceBookFilters = { books: ['bihar_through_the_ages', 'bihar_special_crash_course', 'lucent_gk'] };
      } else if (targetSubject === 'art_and_culture' || /art and culture|classical dance|temple architecture|unesco heritage|sculpture|paintings|singhania/i.test(qLower)) {
        referenceBookFilters = { books: ['nitin_singhania_art_culture'] };
      } else if (targetSubject === 'History' || /history|spectrum|revolt of 1857|ancient|medieval|freedom struggle|national movement|rs sharma|satish chandra|bipan chandra/i.test(qLower)) {
        if (/ancient|vedic|harappa|indus valley|maurya|gupta|ashoka|rs sharma/i.test(qLower)) {
          referenceBookFilters = { books: ['rs_sharma_ancient_history', 'lucent_gk'] };
        } else if (/medieval|sultanate|mughal|akbar|delhi sultanate|maratha|vijayanagar|satish chandra/i.test(qLower)) {
          referenceBookFilters = { books: ['satish_chandra_medieval_history', 'lucent_gk'] };
        } else if (/freedom struggle|bipan chandra|national movement|congress session|non-cooperation|civil disobedience/i.test(qLower)) {
          referenceBookFilters = { books: ['bipan_chandra_freedom_struggle', 'spectrum_history', 'lucent_gk'] };
        } else {
          referenceBookFilters = { books: ['spectrum_history', 'rs_sharma_ancient_history', 'satish_chandra_medieval_history', 'bipan_chandra_freedom_struggle', 'lucent_gk'] };
        }
      } else if (targetSubject === 'Geography' || /physical geography|gc leong|climate|monsoon|landforms/i.test(qLower)) {
        referenceBookFilters = { books: ['gc_leong_geography', 'lucent_gk'] };
      } else if (targetSubject === 'Economics' || /economy|economics|inflation|gdp|rbi|budget|ramesh singh/i.test(qLower)) {
        referenceBookFilters = { books: ['ramesh_singh_economy', 'lucent_gk'] };
      } else if (targetSubject === 'Environment' || /environment|ecology|biodiversity|shankar/i.test(qLower)) {
        referenceBookFilters = { books: ['shankar_environment'] };
      } else if (targetSubject === 'english' || /grammar|vocabulary|synonym|antonym|idiom|sp bakshi|neetu singh|norman lewis|plinth to paramount|word power/i.test(qLower)) {
        referenceBookFilters = { books: ['neetu_singh_english', 'sp_bakshi_english', 'norman_lewis_word_power'] };
      } else if (targetSubject === 'ethics' || /ethics|integrity|aptitude|gs paper iv|lexicon|moral philosophy/i.test(qLower)) {
        referenceBookFilters = { books: ['lexicon_ethics'] };
      } else if (targetSubject === 'pedagogy' || /pedagogy|child development|learning theories|educational psychology|blooms taxonomy|piaget|vygotsky|skinner/i.test(qLower)) {
        referenceBookFilters = { books: ['skinner_educational_psychology', 'stet_pedagogy_guide'] };
      } else if (targetSubject === 'General Knowledge' || (/gk|lucent|static gk|dynasty|battle|capital|governor|amendment/i.test(qLower) && !/(physics|chemistry|biology|calculus|thermodynamics|optics|integration)/i.test(qLower))) {
        referenceBookFilters = { books: ['lucent_gk'] };
      } else if (targetSubject === 'reasoning' || /reasoning|puzzle|analogy|syllogism|blood relation|direction sense|coding-decoding/i.test(qLower)) {
        referenceBookFilters = { books: ['arihant_csat_reasoning', 'schand_reasoning'] };
      } else if (targetSubject === 'quantitative_aptitude' || /quant|math shortcut|speed math|trachtenberg|vedic math|cube root trick|rakesh yadav/i.test(qLower)) {
        referenceBookFilters = { books: ['arihant_csat_reasoning', 'rakesh_yadav_maths', 'schand_quant'] };
      } else if (targetSubject === 'Physics' || /physics|mechanics|kinematics|thermodynamics|electromagnetism|optics|hc verma|hcv|irodov/i.test(qLower)) {
        referenceBookFilters = { books: ['hc_verma_physics_vol1', 'hc_verma_physics_vol2', 'irodov_physics'] };
      } else if (targetSubject === 'Chemistry' || /chemistry|inorganic|organic|periodic table|bonding|reaction mechanism|jd lee|ms chouhan/i.test(qLower)) {
        referenceBookFilters = { books: ['jd_lee_inorganic', 'ms_chouhan_organic'] };
      } else if (targetSubject === 'Biology' || /biology|botany|zoology|genetics|cell|evolution|ecology|trueman|campbell/i.test(qLower)) {
        referenceBookFilters = { books: ['trueman_biology_vol1', 'trueman_biology_vol2', 'campbell_biology'] };
      } else if (targetSubject === 'Mathematics' || /trigonometry|coordinate geometry|higher algebra|permutations|binomial|sl loney|hall and knight/i.test(qLower)) {
        referenceBookFilters = { books: ['hall_knight_algebra', 'sl_loney_trigonometry'] };
      } else if (/trick|shortcut|mnemonic|formula sheet/i.test(qLower)) {
        // Broad shortcut request: allow reference books
        referenceBookFilters = undefined;
      } else if (intent === 'TEST_GENERATION' || intent === 'EXAM_PREPARATION' || intent === 'REVISION') {
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
