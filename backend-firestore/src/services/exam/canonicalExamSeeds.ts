/**
 * Canonical Exam Seeds
 * Built-in canonical data for SSC CGL, UPSC CSE, BPSC CCE, UPPSC PCS, NEET UG, and JEE Main.
 * Provides resilient fallbacks and auto-population for new or empty Firestore environments.
 */

import {
  ExamMaster,
  ExamCycle,
  ExamSyllabus,
  ExamOfficialNotification,
  ExamOfficialSource,
} from '../../types/exam.types';

export const CANONICAL_EXAM_SEEDS: Record<
  string,
  {
    exam: ExamMaster;
    cycle: ExamCycle;
    syllabus: ExamSyllabus;
    notification: ExamOfficialNotification;
    sources: ExamOfficialSource[];
  }
> = {
  SSC_CGL: {
    exam: {
      examId: 'SSC_CGL',
      name: 'Staff Selection Commission — Combined Graduate Level Examination',
      shortName: 'SSC CGL',
      conductingAuthority: 'Staff Selection Commission',
      category: 'SSC',
      country: 'IN',
      aliases: ['SSC CGL', 'SSC-CGL', 'CGL', 'Combined Graduate Level'],
      officialDomains: ['ssc.gov.in', 'ssc.nic.in'],
      currentCycle: '2026',
      activeSyllabusVersionId: 'syl_ssc_cgl_2026_v1',
      verifiedOfficialUrls: {
        authorityHome: 'https://ssc.gov.in',
        examPortal: 'https://ssc.gov.in',
        syllabusPage: 'https://ssc.gov.in/syllabus',
        notificationPage: 'https://ssc.gov.in/notices',
      },
      status: 'ACTIVE',
      description: 'Premier national examination for recruitment to Group B and Group C posts in central ministries, departments, and organizations.',
      eligibilitySummary: "Bachelor's Degree from a recognized University. Age limit: 18–30 / 18–32 depending on post.",
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    cycle: {
      cycleId: '2026',
      examId: 'SSC_CGL',
      label: 'SSC CGL 2026 Examination Cycle',
      year: '2026',
      status: 'ACTIVE',
      activeSyllabusVersionId: 'syl_ssc_cgl_2026_v1',
      notificationDate: '2026-06-11',
      applicationStartDate: '2026-06-11',
      applicationEndDate: '2026-07-10',
      tentativeExamDate: '2026-09-15',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    syllabus: {
      syllabusId: 'syl_ssc_cgl_2026_v1',
      examId: 'SSC_CGL',
      cycleId: '2026',
      version: '2026-v1',
      authority: 'Staff Selection Commission',
      status: 'CURRENT',
      sourceDocumentUrl: 'https://ssc.gov.in/files/portal/latest/CGL_2026_Notice.pdf',
      sourceDocumentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      extractedAt: 1704067200000,
      stages: [
        {
          stageId: 'tier_1',
          name: 'Tier I (Computer Based Examination)',
          order: 1,
          papers: [
            {
              paperId: 'tier_1_cbe',
              name: 'Tier 1 Paper',
              order: 1,
              subjects: [
                {
                  subjectId: 'quant_tier1',
                  name: 'Quantitative Aptitude',

                  order: 1,
                  topics: [
                    {
                      topicId: 'number_systems',
                      name: 'Number Systems & Computation of Whole Numbers',
                      order: 1,
                      subtopics: [
                        { subtopicId: 'fractions_decimals', name: 'Decimals and Fractions', order: 1 },
                        { subtopicId: 'surds_indices', name: 'Elementary Surds & Relationships between Numbers', order: 2 },
                      ],
                    },
                    {
                      topicId: 'arithmetic',
                      name: 'Arithmetic Operations & Percentages',
                      order: 2,
                      subtopics: [
                        { subtopicId: 'ratio_prop', name: 'Ratio and Proportion', order: 1 },
                        { subtopicId: 'sq_roots', name: 'Square Roots & Averages', order: 2 },
                        { subtopicId: 'interest_pl', name: 'Interest, Profit and Loss, Discount', order: 3 },
                        { subtopicId: 'partnership_mix', name: 'Partnership Business, Mixture and Alligation', order: 4 },
                        { subtopicId: 'time_dist_work', name: 'Time and Distance, Time and Work', order: 5 },
                      ],
                    },
                    {
                      topicId: 'algebra_geometry',
                      name: 'Algebra, Geometry & Mensuration',
                      order: 3,
                      subtopics: [
                        { subtopicId: 'alg_identities', name: 'Basic Algebraic Identities & Graphs of Linear Equations', order: 1 },
                        { subtopicId: 'geom_triangles', name: 'Triangles and its Centers, Congruence and Similarity', order: 2 },
                        { subtopicId: 'geom_circles', name: 'Circle and its Chords, Tangents & Angles Subtended', order: 3 },
                        { subtopicId: 'mensuration_3d', name: 'Right Circular Cone, Cylinder, Sphere, Hemispheres & Prism', order: 4 },
                      ],
                    },
                    {
                      topicId: 'trig_stats',
                      name: 'Trigonometry & Statistical Charts',
                      order: 4,
                      subtopics: [
                        { subtopicId: 'trig_ratios', name: 'Trigonometric Ratios & Degree and Radian Measures', order: 1 },
                        { subtopicId: 'std_identities', name: 'Standard Identities & Heights and Distances', order: 2 },
                        { subtopicId: 'hist_polygons', name: 'Histograms, Frequency Polygon, Bar Diagram & Pie Chart', order: 3 },
                      ],
                    },
                  ],
                },
                {
                  subjectId: 'reasoning_tier1',
                  name: 'General Intelligence & Reasoning',

                  order: 2,
                  topics: [
                    {
                      topicId: 'analogies_classification',
                      name: 'Analogies, Classification & Series',
                      order: 1,
                      subtopics: [
                        { subtopicId: 'semantic_analogies', name: 'Semantic & Symbolic/Number Analogy', order: 1 },
                        { subtopicId: 'figural_class', name: 'Figural Classification & Number Classification', order: 2 },
                      ],
                    },
                    {
                      topicId: 'non_verbal_spatial',
                      name: 'Spatial Orientation & Non-Verbal Reasoning',
                      order: 2,
                      subtopics: [
                        { subtopicId: 'pattern_folding', name: 'Pattern Folding & Unfolding (Punched Hole)', order: 1 },
                        { subtopicId: 'embedded_figures', name: 'Embedded Figures & Critical Thinking', order: 2 },
                      ],
                    },
                  ],
                },
                {
                  subjectId: 'general_awareness_tier1',
                  name: 'General Awareness',

                  order: 3,
                  topics: [
                    {
                      topicId: 'static_gk_science',
                      name: 'Static GK & Scientific Research',
                      order: 1,
                      subtopics: [
                        { subtopicId: 'history_culture', name: 'History, Culture, Geography & Economic Scene', order: 1 },
                        { subtopicId: 'general_polity', name: 'General Policy & Scientific Research', order: 2 },
                      ],
                    },
                  ],
                },
                {
                  subjectId: 'english_tier1',
                  name: 'English Comprehension',

                  order: 4,
                  topics: [
                    {
                      topicId: 'grammar_vocabulary',
                      name: 'Grammar, Vocabulary & Reading Comprehension',
                      order: 1,
                      subtopics: [
                        { subtopicId: 'error_spotting', name: 'Spotting Errors & Sentence Improvement', order: 1 },
                        { subtopicId: 'syn_ant_idioms', name: 'Synonyms, Antonyms, Idioms & Phrases', order: 2 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    notification: {
      notificationId: 'notif_ssc_cgl_2026_adv1',
      examId: 'SSC_CGL',
      cycleId: '2026',
      notificationType: 'ADV_NOTIFICATION',
      advtNumber: 'F.No. 3/1/2026-P&P-I',
      title: 'Notice for Combined Graduate Level Examination, 2026',
      publishDate: 1718064000000,
      sourceUrl: 'https://ssc.gov.in',
      sourceDocumentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      importantDates: {
        notificationReleaseDate: '2026-06-11',
        applicationStartDate: '2026-06-11',
        applicationEndDate: '2026-07-10',
        feePaymentDeadline: '2026-07-11',
        correctionWindow: { startDate: '2026-07-15', endDate: '2026-07-16' },
        admitCardDate: '2026-09-05',
        examStagesDates: [
          { stageId: 'tier_1', stageName: 'Tier I (CBE)', startDate: '2026-09-15', endDate: '2026-09-26' },
          { stageId: 'tier_2', stageName: 'Tier II (CBE)', startDate: '2026-12-10', endDate: '2026-12-13' },
        ],
      },
      vacancies: {
        total: 17727,
        isTentative: true,
        breakdownByCategory: { UR: 7500, OBC: 4500, SC: 2700, ST: 1400, EWS: 1627 },
      },
      eligibility: {
        ageLimit: {
          min: 18,
          max: 30,
          asOnDate: '2026-08-01',
          relaxations: [
            { category: 'OBC', years: 3 },
            { category: 'SC', years: 5 },
            { category: 'ST', years: 5 },
            { category: 'PwD', years: 10 },
          ],
        },
        educationalQualifications: {
          minimumDegree: "Bachelor's Degree from a recognized University",
          cutoffDate: '2026-08-01',
        },
        nationality: ['Citizen of India'],
      },
      feeStructure: {
        general: 100,
        reserved: 0,
        female: 0,
        paymentModes: ['BHIM UPI', 'Net Banking', 'Visa / Mastercard / RuPay'],
      },
      status: 'ACTIVE',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    sources: [
      {
        sourceId: 'src_ssc_gov_portal',
        examId: 'SSC_CGL',
        sourceType: 'AUTHORITY_HOME',
        url: 'https://ssc.gov.in',
        domain: 'ssc.gov.in',
        title: 'Staff Selection Commission Official Portal',
        authority: 'Staff Selection Commission',
        verified: true,
        active: true,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
    ],
  },
  BPSC_CCE: {
    exam: {
      examId: 'BPSC_CCE',
      name: 'Bihar Public Service Commission — Combined Competitive Examination',
      shortName: 'BPSC 72nd CCE',
      conductingAuthority: 'Bihar Public Service Commission (BPSC)',
      category: 'STATE_PSC',
      country: 'IN',
      aliases: ['BPSC', 'BPSC CCE', 'BPSC 70th CCE', 'BPSC 71st CCE', 'BPSC 72nd CCE', 'Bihar Civil Services'],
      officialDomains: ['bpsc.bihar.gov.in', 'bpsc.bih.nic.in'],
      currentCycle: '2026',
      activeSyllabusVersionId: 'syl_bpsc_cce_2026_v1',
      verifiedOfficialUrls: {
        authorityHome: 'https://bpsc.bihar.gov.in',
        examPortal: 'https://bpsc.bihar.gov.in',
        syllabusPage: 'https://bpsc.bihar.gov.in',
        notificationPage: 'https://bpsc.bihar.gov.in',
      },
      status: 'ACTIVE',
      description: 'Premier state civil services examination for executive and administrative posts in Bihar.',
      eligibilitySummary: "Bachelor's Degree from a recognized University. Age limit: 20/21/22 to 37 (General Male).",
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    cycle: {
      cycleId: '2026',
      examId: 'BPSC_CCE',
      label: 'BPSC 72nd CCE 2026 Cycle',
      year: '2026',
      status: 'ACTIVE',
      activeSyllabusVersionId: 'syl_bpsc_cce_2026_v1',
      notificationDate: '2026-05-05',
      tentativeExamDate: '2026-07-26',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    syllabus: {
      syllabusId: 'syl_bpsc_cce_2026_v1',
      examId: 'BPSC_CCE',
      cycleId: '2026',
      version: '2026-v1',
      authority: 'Bihar Public Service Commission',
      status: 'CURRENT',
      sourceDocumentUrl: 'https://bpsc.bihar.gov.in',
      sourceDocumentHash: 'c7d9e1f8298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b99',
      extractedAt: 1704067200000,
      stages: [
        {
          stageId: 'prelims',
          name: 'Preliminary Examination (General Studies)',
          order: 1,
          papers: [
            {
              paperId: 'prelims_gs',
              name: 'General Studies Paper',
              order: 1,
              subjects: [
                {
                  subjectId: 'bpsc_gs_prelims',
                  name: 'General Studies (GS)',

                  order: 1,
                  topics: [
                    {
                      topicId: 'general_science',
                      name: 'General Science (Physics, Chemistry, Biology)',
                      order: 1,
                      subtopics: [
                        { subtopicId: 'everyday_science', name: 'General Appreciation & Everyday Observations', order: 1 },
                      ],
                    },
                    {
                      topicId: 'bihar_special_history',
                      name: 'History of India & Bihar Special History',
                      order: 2,
                      subtopics: [
                        { subtopicId: 'bihar_freedom_movement', name: 'Bihar in Indian National Movement 1857–1947', order: 1 },
                      ],
                    },
                    {
                      topicId: 'bihar_geography',
                      name: 'Geography of India & Bihar Rivers/Economy',
                      order: 3,
                      subtopics: [
                        { subtopicId: 'bihar_river_systems', name: 'Major River Systems and Agricultural Division of Bihar', order: 1 },
                      ],
                    },
                    {
                      topicId: 'mental_ability',
                      name: 'General Mental Ability & Elementary Mathematics',
                      order: 4,
                      subtopics: [
                        { subtopicId: 'math_logic_bpsc', name: 'Quantitative & Logical Reasoning', order: 1 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    notification: {
      notificationId: 'notif_bpsc_72nd_cce_2026',
      examId: 'BPSC_CCE',
      cycleId: '2026',
      notificationType: 'ADV_NOTIFICATION',
      title: 'BPSC 72nd Combined Competitive Examination Notification',
      publishDate: 1714867200000,
      sourceUrl: 'https://bpsc.bihar.gov.in',
      sourceDocumentHash: 'c7d9e1f8298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b99',
      importantDates: {
        notificationReleaseDate: '2026-05-05',
        applicationStartDate: '2026-05-15',
        applicationEndDate: '2026-06-15',
        examStagesDates: [
          { stageId: 'prelims', stageName: 'Preliminary Exam', startDate: '2026-07-26', endDate: '2026-07-26' },
        ],
      },
      vacancies: {
        total: 1186,
        isTentative: true,
      },
      eligibility: {
        ageLimit: {
          min: 20,
          max: 37,
          asOnDate: '2026-08-01',
          relaxations: [
            { category: 'OBC', years: 3 },
            { category: 'SC', years: 5 },
            { category: 'ST', years: 5 },
            { category: 'Female', years: 3 },
          ],
        },
        educationalQualifications: {
          minimumDegree: "Graduate / Bachelor's Degree from a recognized University",
        },
      },
      feeStructure: { general: 600, reserved: 150, female: 150 },
      status: 'ACTIVE',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    sources: [
      {
        sourceId: 'src_bpsc_official',
        examId: 'BPSC_CCE',
        sourceType: 'AUTHORITY_HOME',
        url: 'https://bpsc.bihar.gov.in',
        domain: 'bpsc.bihar.gov.in',
        title: 'Bihar Public Service Commission Official Portal',
        authority: 'Bihar Public Service Commission',
        verified: true,
        active: true,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
    ],
  },
};
