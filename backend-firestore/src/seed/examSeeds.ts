/**
 * Pilot Exam Seed Data for Scholarly Exam Intelligence
 * Contains verified official domains, authorities, and canonical syllabus structures.
 */

import { ExamMaster, ExamCycle, ExamSyllabus, ExamOfficialSource } from '../types/exam.types';
import { examRepository } from '../repositories/exam.repository';

export const PILOT_EXAMS: ExamMaster[] = [
  {
    examId: 'SSC_CGL',
    name: 'Staff Selection Commission — Combined Graduate Level',
    shortName: 'SSC CGL',
    conductingAuthority: 'Staff Selection Commission',
    category: 'SSC',
    country: 'IN',
    aliases: ['SSC CGL', 'SSC-CGL', 'CGL', 'Combined Graduate Level', 'Staff Selection Commission CGL'],
    officialDomains: ['ssc.gov.in', 'ssc.nic.in'],
    currentCycle: '2026',
    activeSyllabusVersionId: 'syl_ssc_cgl_2026_v1',
    verifiedOfficialUrls: {
      authorityHome: 'https://ssc.gov.in',
      applicationPortal: 'https://ssc.gov.in',
      notificationPage: 'https://ssc.gov.in/notices',
      admitCardPortal: 'https://ssc.gov.in/admit-card',
      resultPortal: 'https://ssc.gov.in/results',
    },
    status: 'ACTIVE',
    description: 'National competitive examination conducted for recruitment to Group B and Group C posts in ministries and departments of the Government of India.',
    eligibilitySummary: 'Bachelor Degree from a recognized university. Age 18–32 years depending on post with standard category relaxations.',
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  },
  {
    examId: 'UPSC_CSE',
    name: 'Union Public Service Commission — Civil Services Examination',
    shortName: 'UPSC CSE',
    conductingAuthority: 'Union Public Service Commission',
    category: 'UPSC',
    country: 'IN',
    aliases: ['UPSC CSE', 'UPSC', 'Civil Services', 'IAS Exam', 'IPS Exam', 'CSE'],
    officialDomains: ['upsc.gov.in', 'upsconline.nic.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://upsc.gov.in',
      applicationPortal: 'https://upsconline.nic.in',
      notificationPage: 'https://upsc.gov.in/examinations',
    },
    status: 'ACTIVE',
    description: 'Premier national civil service competitive examination for entry to the Indian Administrative Service (IAS), Indian Police Service (IPS), and Indian Foreign Service (IFS).',
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  },
  {
    examId: 'NEET_UG',
    name: 'National Eligibility cum Entrance Test (Undergraduate)',
    shortName: 'NEET UG',
    conductingAuthority: 'National Testing Agency',
    category: 'MEDICAL',
    country: 'IN',
    aliases: ['NEET', 'NEET UG', 'NEET-UG', 'National Eligibility cum Entrance Test'],
    officialDomains: ['exams.nta.ac.in', 'neet.nta.nic.in', 'nta.ac.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://exams.nta.ac.in/NEET',
      applicationPortal: 'https://exams.nta.ac.in/NEET',
      notificationPage: 'https://nta.ac.in/NoticeArchive',
    },
    status: 'ACTIVE',
    description: 'All-India pre-medical entrance examination for admission into undergraduate MBBS, BDS, and AYUSH courses.',
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  },
  {
    examId: 'JEE_MAIN',
    name: 'Joint Entrance Examination (Main)',
    shortName: 'JEE Main',
    conductingAuthority: 'National Testing Agency',
    category: 'ENGINEERING',
    country: 'IN',
    aliases: ['JEE Main', 'JEE-Main', 'JEE', 'Joint Entrance Examination Main'],
    officialDomains: ['jeemain.nta.ac.in', 'exams.nta.ac.in', 'nta.ac.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://jeemain.nta.ac.in',
      applicationPortal: 'https://jeemain.nta.ac.in',
      notificationPage: 'https://nta.ac.in',
    },
    status: 'ACTIVE',
    description: 'All-India engineering entrance assessment conducted for admission to NITs, IIITs, and other Centrally Funded Technical Institutions.',
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  },
  {
    examId: 'IBPS_PO',
    name: 'Institute of Banking Personnel Selection — Probationary Officers (CWE)',
    shortName: 'IBPS PO',
    conductingAuthority: 'Institute of Banking Personnel Selection',
    category: 'BANKING',
    country: 'IN',
    aliases: ['IBPS PO', 'IBPS-PO', 'IBPS Probationary Officer', 'Bank PO'],
    officialDomains: ['ibps.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://ibps.in',
      applicationPortal: 'https://ibps.in',
      notificationPage: 'https://ibps.in',
    },
    status: 'ACTIVE',
    description: 'Common recruitment process for selection of Probationary Officers / Management Trainees in participating public sector banks across India.',
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  },
  {
    examId: 'BPSC_CCE',
    name: 'Bihar Public Service Commission — Combined Competitive Examination',
    shortName: 'BPSC CCE',
    conductingAuthority: 'Bihar Public Service Commission',
    category: 'STATE_PSC',
    country: 'IN',
    aliases: ['BPSC', 'BPSC CCE', 'Bihar PSC', 'Bihar Civil Services', 'BPSC 70th', 'BPSC 71st'],
    officialDomains: ['bpsc.bih.nic.in', 'onlinebpsc.bihar.gov.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://bpsc.bih.nic.in',
      applicationPortal: 'https://onlinebpsc.bihar.gov.in',
      notificationPage: 'https://bpsc.bih.nic.in',
    },
    status: 'ACTIVE',
    description: 'State civil services examination for executive, administrative, and police leadership cadres in the state of Bihar.',
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  },
];

export const PILOT_SSC_CGL_SYLLABUS: ExamSyllabus = {
  syllabusId: 'syl_ssc_cgl_2026_v1',
  examId: 'SSC_CGL',
  cycleId: '2026',
  version: '2026-v1',
  authority: 'Staff Selection Commission',
  status: 'CURRENT',
  sourceDocumentUrl: 'https://ssc.gov.in/notices/SSC_CGL_2026_Official_Notice.pdf',
  sourceDocumentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  extractedAt: 1735689600000,
  verifiedAt: 1735689600000,
  createdAt: 1735689600000,
  updatedAt: 1735689600000,
  stages: [
    {
      stageId: 'tier_1',
      name: 'Tier I (Computer Based Examination)',
      order: 1,
      papers: [
        {
          paperId: 'tier_1_cbe',
          name: 'Tier I Composite Paper',
          order: 1,
          subjects: [
            {
              subjectId: 'general_intelligence_and_reasoning',
              name: 'General Intelligence & Reasoning',
              order: 1,
              marks: 50,
              questionCount: 25,
              durationMinutes: 60,
              topics: [
                {
                  topicId: 'ssc_cgl_reasoning_analogies',
                  name: 'Analogies & Semantic Classification',
                  order: 1,
                  subtopics: [
                    { subtopicId: 'ssc_cgl_reasoning_analogies_semantic', name: 'Semantic Analogy', order: 1 },
                    { subtopicId: 'ssc_cgl_reasoning_analogies_symbolic', name: 'Symbolic / Number Analogy', order: 2 },
                  ],
                },
                {
                  topicId: 'ssc_cgl_reasoning_coding_decoding',
                  name: 'Coding & Decoding',
                  order: 2,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_reasoning_syllogism',
                  name: 'Syllogistic Reasoning & Statements',
                  order: 3,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_reasoning_spatial_orientation',
                  name: 'Spatial Orientation & Visualization',
                  order: 4,
                  subtopics: [],
                },
              ],
            },
            {
              subjectId: 'general_awareness',
              name: 'General Awareness',
              order: 2,
              marks: 50,
              questionCount: 25,
              topics: [
                {
                  topicId: 'ssc_cgl_ga_history',
                  name: 'Indian History & Culture',
                  order: 1,
                  subtopics: [
                    { subtopicId: 'ssc_cgl_ga_history_ancient', name: 'Ancient India', order: 1 },
                    { subtopicId: 'ssc_cgl_ga_history_medieval', name: 'Medieval India', order: 2 },
                    { subtopicId: 'ssc_cgl_ga_history_modern', name: 'Modern National Movement', order: 3 },
                  ],
                },
                {
                  topicId: 'ssc_cgl_ga_polity',
                  name: 'Indian Polity & Constitution',
                  order: 2,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_ga_geography',
                  name: 'Geography & Environment',
                  order: 3,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_ga_economy',
                  name: 'Economic Scene & Policy',
                  order: 4,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_ga_general_science',
                  name: 'General Science & Scientific Research',
                  order: 5,
                  subtopics: [],
                },
              ],
            },
            {
              subjectId: 'quantitative_aptitude',
              name: 'Quantitative Aptitude',
              order: 3,
              marks: 50,
              questionCount: 25,
              topics: [
                {
                  topicId: 'ssc_cgl_quant_number_system',
                  name: 'Number System & Computation',
                  order: 1,
                  subtopics: [
                    { subtopicId: 'ssc_cgl_quant_number_system_whole', name: 'Computation of Whole Numbers', order: 1 },
                    { subtopicId: 'ssc_cgl_quant_number_system_fractions', name: 'Decimals & Fractions', order: 2 },
                  ],
                },
                {
                  topicId: 'ssc_cgl_quant_arithmetic',
                  name: 'Fundamental Arithmetical Operations',
                  order: 2,
                  subtopics: [
                    { subtopicId: 'ssc_cgl_quant_arithmetic_percentages', name: 'Percentages', order: 1 },
                    { subtopicId: 'ssc_cgl_quant_arithmetic_ratios', name: 'Ratio & Proportion', order: 2 },
                    { subtopicId: 'ssc_cgl_quant_arithmetic_profit_loss', name: 'Profit & Loss and Discount', order: 3 },
                    { subtopicId: 'ssc_cgl_quant_arithmetic_time_work', name: 'Time & Work', order: 4 },
                    { subtopicId: 'ssc_cgl_quant_arithmetic_time_distance', name: 'Time & Distance', order: 5 },
                  ],
                },
                {
                  topicId: 'ssc_cgl_quant_algebra',
                  name: 'Algebra & Elementary Surds',
                  order: 3,
                  subtopics: [
                    { subtopicId: 'ssc_cgl_quant_algebra_identities', name: 'Basic Algebraic Identities', order: 1 },
                    { subtopicId: 'ssc_cgl_quant_algebra_linear_graphs', name: 'Graphs of Linear Equations', order: 2 },
                  ],
                },
                {
                  topicId: 'ssc_cgl_quant_geometry',
                  name: 'Geometry & Coordinate Geometry',
                  order: 4,
                  subtopics: [
                    { subtopicId: 'ssc_cgl_quant_geometry_triangles', name: 'Triangles, Centres & Similarity', order: 1 },
                    { subtopicId: 'ssc_cgl_quant_geometry_circles', name: 'Circles, Chords & Tangents', order: 2 },
                  ],
                },
                {
                  topicId: 'ssc_cgl_quant_mensuration',
                  name: 'Mensuration',
                  order: 5,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_quant_trigonometry',
                  name: 'Trigonometry & Heights and Distances',
                  order: 6,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_quant_data_interpretation',
                  name: 'Statistical Charts & Data Interpretation',
                  order: 7,
                  subtopics: [],
                },
              ],
            },
            {
              subjectId: 'english_comprehension',
              name: 'English Comprehension',
              order: 4,
              marks: 50,
              questionCount: 25,
              topics: [
                {
                  topicId: 'ssc_cgl_english_grammar',
                  name: 'Grammar, Error Spotting & Sentence Improvement',
                  order: 1,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_english_vocabulary',
                  name: 'Vocabulary, Idioms & Phrases, Synonyms and Antonyms',
                  order: 2,
                  subtopics: [],
                },
                {
                  topicId: 'ssc_cgl_english_reading_comprehension',
                  name: 'Reading Comprehension & Cloze Test',
                  order: 3,
                  subtopics: [],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      stageId: 'tier_2',
      name: 'Tier II (Mains Examination)',
      order: 2,
      papers: [
        {
          paperId: 'tier_2_paper_1',
          name: 'Paper I (Compulsory for all posts)',
          order: 1,
          subjects: [
            {
              subjectId: 'mathematical_abilities',
              name: 'Mathematical Abilities',
              order: 1,
              marks: 90,
              questionCount: 30,
              topics: [
                { topicId: 'ssc_cgl_t2_number_systems', name: 'Number Systems', order: 1, subtopics: [] },
                { topicId: 'ssc_cgl_t2_fundamental_arithmetical', name: 'Fundamental Arithmetical Operations', order: 2, subtopics: [] },
                { topicId: 'ssc_cgl_t2_algebra', name: 'Algebra', order: 3, subtopics: [] },
                { topicId: 'ssc_cgl_t2_geometry', name: 'Geometry', order: 4, subtopics: [] },
                { topicId: 'ssc_cgl_t2_mensuration', name: 'Mensuration', order: 5, subtopics: [] },
                { topicId: 'ssc_cgl_t2_trigonometry', name: 'Trigonometry', order: 6, subtopics: [] },
                { topicId: 'ssc_cgl_t2_statistics_probability', name: 'Statistics & Probability', order: 7, subtopics: [] },
              ],
            },
            {
              subjectId: 'reasoning_general_intelligence',
              name: 'Reasoning and General Intelligence',
              order: 2,
              marks: 90,
              questionCount: 30,
              topics: [],
            },
            {
              subjectId: 'english_language_comprehension',
              name: 'English Language and Comprehension',
              order: 3,
              marks: 135,
              questionCount: 45,
              topics: [],
            },
            {
              subjectId: 'general_awareness_t2',
              name: 'General Awareness',
              order: 4,
              marks: 75,
              questionCount: 25,
              topics: [],
            },
            {
              subjectId: 'computer_knowledge_module',
              name: 'Computer Knowledge Module (Qualifying)',
              order: 5,
              marks: 60,
              questionCount: 20,
              topics: [
                { topicId: 'ssc_cgl_computer_basics', name: 'Computer Basics & Organisation', order: 1, subtopics: [] },
                { topicId: 'ssc_cgl_software', name: 'Software & Operating Systems', order: 2, subtopics: [] },
                { topicId: 'ssc_cgl_internet_emails', name: 'Working with Internet and E-mails', order: 3, subtopics: [] },
                { topicId: 'ssc_cgl_cyber_security', name: 'Basics of Networking and Cyber Security', order: 4, subtopics: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Seeds pilot exams and canonical syllabus into Firestore if not already present.
 */
export async function seedPilotExams(): Promise<{ seededExams: number; seededSyllabi: number }> {
  let seededExams = 0;
  let seededSyllabi = 0;

  for (const exam of PILOT_EXAMS) {
    const existing = await examRepository.getExamById(exam.examId);
    if (!existing) {
      await examRepository.createExam(exam);
      // Create default cycle
      if (exam.currentCycle) {
        await examRepository.createCycle({
          cycleId: exam.currentCycle,
          examId: exam.examId,
          label: `${exam.shortName} ${exam.currentCycle}`,
          year: exam.currentCycle,
          status: 'ACTIVE',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      seededExams++;
    }
  }

  // Seed canonical syllabus for SSC CGL
  const existingSyllabus = await examRepository.getSyllabusById(PILOT_SSC_CGL_SYLLABUS.syllabusId);
  if (!existingSyllabus) {
    await examRepository.createSyllabus(PILOT_SSC_CGL_SYLLABUS);
    await examRepository.publishSyllabusVersion(
      PILOT_SSC_CGL_SYLLABUS.examId,
      PILOT_SSC_CGL_SYLLABUS.cycleId,
      PILOT_SSC_CGL_SYLLABUS.syllabusId,
      'system_seed'
    );
    seededSyllabi++;
  }

  return { seededExams, seededSyllabi };
}
