/**
 * Single source of truth for every exam Sadhya covers, driving both the landing page's
 * exam chips and the dedicated /exams/:slug pages.
 *
 * Content policy: every fact here is stable and verifiable (conducting body, exam
 * purpose, broad structure) — deliberately NOT specific dates, vacancy counts, or
 * cutoffs, which change every cycle and would go stale or wrong within months. Anything
 * time-sensitive belongs in the app's live content pipeline, not in marketing copy that
 * ships once and sits.
 */

export interface ExamEntry {
  slug: string;
  /** Short form used in chips/nav. */
  name: string;
  /** Full expansion, used in page titles and first mention. */
  fullName: string;
  category: 'Medical' | 'Engineering' | 'Civil Services' | 'Teaching' | 'Banking & Finance' | 'Railways' | 'University Admission' | 'Academia' | 'School Board';
  /** Who administers it — the one fact worth stating precisely since it doesn't change. */
  conductedBy: string;
  /** One paragraph: what the exam is and who it's for. */
  about: string;
  /** Broad stage/pattern description — structure, not this cycle's specifics. */
  structure: string;
  /** 3-5 bullets: concretely how Sadhya's existing capabilities apply to THIS exam. */
  howSadhyaHelps: string[];
  /** Search-intent keywords this page should be found for. */
  keywords: string[];
}

export const EXAM_CATALOG: ExamEntry[] = [
  {
    slug: 'neet',
    name: 'NEET',
    fullName: 'National Eligibility cum Entrance Test',
    category: 'Medical',
    conductedBy: 'National Testing Agency (NTA)',
    about: 'NEET is the single national entrance exam for undergraduate medical admissions in India — MBBS, BDS and related courses at government and private colleges. It tests Physics, Chemistry and Biology at the Class 11–12 level, at a depth and speed that rewards genuine conceptual clarity over memorisation.',
    structure: 'A single objective-type paper covering Physics, Chemistry, Botany and Zoology, taken in one sitting nationwide.',
    howSadhyaHelps: [
      'Photograph a NEET-style Biology or Chemistry question from any book and get it solved with the underlying concept explained, not just the answer',
      'Notebooks organize NCERT and reference material by chapter so revision stays aligned to what NEET actually tests',
      'Adaptive tests surface exactly which topics — say, Genetics or Organic Reactions — are costing you the most marks',
      'AI podcasts turn a dense chapter into a listenable walkthrough for revision on the move',
    ],
    keywords: ['NEET preparation', 'NEET AI tutor', 'NEET Biology Physics Chemistry', 'medical entrance exam India'],
  },
  {
    slug: 'jee-main',
    name: 'JEE Main',
    fullName: 'Joint Entrance Examination — Main',
    category: 'Engineering',
    conductedBy: 'National Testing Agency (NTA)',
    about: 'JEE Main is the entrance exam for admission to NITs, IIITs and other centrally funded technical institutes, and doubles as the qualifying stage for JEE Advanced. It covers Physics, Chemistry and Mathematics at a level that demands both speed and precision.',
    structure: 'Objective and numerical-answer questions across Physics, Chemistry and Mathematics, typically held across multiple sessions.',
    howSadhyaHelps: [
      'Step-by-step problem solving for Physics and Math numericals — the exact question type JEE Main is built around',
      'Chapter-wise adaptive tests that mirror JEE Main\'s mix of conceptual and calculation-heavy questions',
      'Notebooks keep formula sheets and problem patterns organized by chapter for fast pre-exam revision',
      'A study planner that paces Physics, Chemistry and Math coverage against your actual attempt date',
    ],
    keywords: ['JEE Main preparation', 'JEE Main AI tutor', 'engineering entrance exam India', 'JEE Physics Chemistry Maths'],
  },
  {
    slug: 'jee-advanced',
    name: 'JEE Advanced',
    fullName: 'Joint Entrance Examination — Advanced',
    category: 'Engineering',
    conductedBy: 'One of the IITs, on a rotating annual basis',
    about: 'JEE Advanced is the exam that decides admission to the IITs, open only to candidates who clear JEE Main within the qualifying percentile. Its questions are deliberately harder and more conceptually layered than JEE Main\'s — multi-concept problems designed to separate strong candidates rather than just test recall.',
    structure: 'Two papers on the same day, covering Physics, Chemistry and Mathematics, with a mix of question formats including multi-correct and numerical answer types.',
    howSadhyaHelps: [
      'Handles multi-step, multi-concept problems the way JEE Advanced actually asks them — not simplified versions',
      'Explains the reasoning behind a solution, which matters more here than in Main since Advanced rewards understanding why an approach works',
      'Tracks which problem types (not just which chapters) are weakest, since Advanced tests application more than topic recall',
      'Notebooks let you keep a running library of tricky problem patterns you\'ve solved before, searchable when a similar one shows up',
    ],
    keywords: ['JEE Advanced preparation', 'IIT JEE AI tutor', 'JEE Advanced Physics Chemistry Maths'],
  },
  {
    slug: 'upsc-cse',
    name: 'UPSC CSE',
    fullName: 'UPSC Civil Services Examination',
    category: 'Civil Services',
    conductedBy: 'Union Public Service Commission (UPSC)',
    about: 'The Civil Services Examination is the route into IAS, IPS, IFS and other central government services — widely regarded as one of the most demanding exams in India for its sheer breadth: history, polity, economy, geography, ethics, current affairs and an optional subject, tested across three stages over many months.',
    structure: 'Prelims (two objective papers, one qualifying), Mains (nine descriptive papers including an optional subject and essay), and a Personality Test (interview) for those who clear Mains.',
    howSadhyaHelps: [
      'A single AI tutor across every GS subject — polity, economy, history, geography, ethics — so you\'re not juggling separate resources for each',
      'Current affairs woven into subject explanations rather than treated as a separate, disconnected stream to track',
      'Notebooks built for the answer-writing practice Mains actually rewards — organize source material by paper and topic',
      'Adaptive Prelims-style tests that surface which GS areas need another pass before the real exam',
    ],
    keywords: ['UPSC CSE preparation', 'UPSC AI tutor', 'IAS exam preparation', 'civil services exam India'],
  },
  {
    slug: 'ssc-cgl',
    name: 'SSC CGL',
    fullName: 'SSC Combined Graduate Level Examination',
    category: 'Civil Services',
    conductedBy: 'Staff Selection Commission (SSC)',
    about: 'SSC CGL recruits graduates into Group B and C posts across central government ministries and departments — roles like Inspector, Auditor and Assistant. It tests General Intelligence, General Awareness, Quantitative Aptitude and English at a pace that rewards speed as much as accuracy.',
    structure: 'Multiple tiers of computer-based objective testing, moving from a broad screening stage to more specialised sections depending on the post applied for.',
    howSadhyaHelps: [
      'Timed, adaptive Quant and Reasoning practice that builds the speed SSC CGL specifically demands',
      'General Awareness explanations that connect a fact to the surrounding context, so it\'s actually remembered, not just seen once',
      'Photograph a tricky Quant or Reasoning question from any practice book and get it solved with the fastest method, not just one method',
      'A planner that balances all four sections instead of over-indexing on the one that feels easiest',
    ],
    keywords: ['SSC CGL preparation', 'SSC CGL AI tutor', 'SSC CGL Quant Reasoning', 'government exam preparation India'],
  },
  {
    slug: 'ssc-chsl',
    name: 'SSC CHSL',
    fullName: 'SSC Combined Higher Secondary Level Examination',
    category: 'Civil Services',
    conductedBy: 'Staff Selection Commission (SSC)',
    about: 'SSC CHSL recruits Class 12-pass candidates into posts like Lower Divisional Clerk, Postal Assistant and Data Entry Operator across central government offices. It covers General Intelligence, English, Quantitative Aptitude and General Awareness — narrower in scope than CGL but still demanding on speed and accuracy.',
    structure: 'Tiered objective testing followed by a typing or data-entry skill test for the roles that require it.',
    howSadhyaHelps: [
      'Focused Quant and Reasoning drills at the Class-12 difficulty band CHSL actually tests, not inflated CGL-level material',
      'English practice — grammar, vocabulary, comprehension — built around the exact question styles CHSL uses',
      'Adaptive tests that flag which of the four sections is quietly holding your score back',
      'Notebooks to keep a growing list of General Awareness facts organized and reviewable',
    ],
    keywords: ['SSC CHSL preparation', 'SSC CHSL AI tutor', 'SSC CHSL Quant English Reasoning'],
  },
  {
    slug: 'bpsc',
    name: 'BPSC',
    fullName: 'Bihar Public Service Commission — Combined Competitive Examination',
    category: 'Civil Services',
    conductedBy: 'Bihar Public Service Commission (BPSC)',
    about: 'BPSC\'s Combined Competitive Examination recruits into Bihar\'s state administrative services — the state-level equivalent of UPSC CSE, covering Bihar-specific history, geography, economy and current affairs alongside general studies.',
    structure: 'Prelims (objective, general studies), Mains (descriptive papers including a Bihar-specific General Studies component), and an interview.',
    howSadhyaHelps: [
      'General Studies coverage that includes Bihar-specific history, geography and governance, not just pan-India content',
      'Mains-style answer writing practice organized by paper in Notebooks, built around what BPSC Mains actually asks',
      'Current affairs explanations that connect state and national developments, since BPSC draws on both',
      'Adaptive Prelims practice to find and close gaps before the real exam',
    ],
    keywords: ['BPSC preparation', 'BPSC AI tutor', 'Bihar Public Service Commission exam', 'BPSC CCE'],
  },
  {
    slug: 'bihar-tre',
    name: 'Bihar TRE',
    fullName: 'Bihar Teacher Recruitment Examination',
    category: 'Teaching',
    conductedBy: 'Bihar School Examination Board (BSEB)',
    about: 'Bihar TRE recruits teachers into Bihar\'s government schools across primary, middle and secondary levels, testing both subject knowledge and general teaching-aptitude areas like Bihar-specific general knowledge, language and pedagogy fundamentals.',
    structure: 'An objective exam combining a subject-specific paper (matched to the post applied for) with a general/language component.',
    howSadhyaHelps: [
      'Subject-matter practice matched to the specific class level and subject you\'re applying to teach',
      'General knowledge and pedagogy-adjacent content organized for steady, structured revision',
      'Adaptive tests that pinpoint weak areas within your chosen subject before exam day',
      'An AI tutor available whenever a concept needs re-explaining, without waiting on a coaching class schedule',
    ],
    keywords: ['Bihar TRE preparation', 'Bihar Teacher Recruitment Exam AI tutor', 'BSEB TRE'],
  },
  {
    slug: 'ctet-stet',
    name: 'CTET & STET',
    fullName: 'Central & State Teacher Eligibility Tests',
    category: 'Teaching',
    conductedBy: 'CTET: CBSE. STET: respective State Education Boards.',
    about: 'CTET and the various state STETs are qualifying exams that establish eligibility to teach in Indian schools — Paper 1 for Classes 1–5, Paper 2 for Classes 6–8. They test Child Development & Pedagogy alongside subject-matter knowledge in Language, Mathematics, Environmental Studies or the relevant subject.',
    structure: 'Objective papers split by teaching level (Paper 1 / Paper 2), each combining Child Development & Pedagogy with subject-specific sections.',
    howSadhyaHelps: [
      'Child Development & Pedagogy explained conceptually, not just as facts to memorise — the section most candidates underprepare for',
      'Subject-specific practice matched to whichever paper (1 or 2) and subject you\'re attempting',
      'Adaptive tests that separate genuine weak spots from careless-mistake patterns',
      'Notebooks to keep pedagogy theory and subject content organized separately but revisable together',
    ],
    keywords: ['CTET preparation', 'STET preparation', 'CTET AI tutor', 'teacher eligibility test India'],
  },
  {
    slug: 'cuet',
    name: 'CUET',
    fullName: 'Common University Entrance Test',
    category: 'University Admission',
    conductedBy: 'National Testing Agency (NTA)',
    about: 'CUET is the common entrance test for undergraduate admission to central universities and a growing number of state and private universities across India, replacing separate university-specific entrance exams. It covers a language test, domain-specific subject papers, and a general test depending on the programme applied for.',
    structure: 'A modular objective exam: a language section, subject-specific domain papers chosen based on intended course, and an optional general test.',
    howSadhyaHelps: [
      'Domain-subject coverage that follows your Class 12 board syllabus, since CUET questions are meant to stay within it',
      'Practice tests built around the specific subject combination your target course requires',
      'An AI tutor for whichever domain subjects need the most reinforcement before test day',
      'A planner that fits CUET prep around board exams rather than treating them as competing priorities',
    ],
    keywords: ['CUET preparation', 'CUET AI tutor', 'common university entrance test India'],
  },
  {
    slug: 'ibps-po',
    name: 'IBPS PO',
    fullName: 'IBPS Probationary Officer Examination',
    category: 'Banking & Finance',
    conductedBy: 'Institute of Banking Personnel Selection (IBPS)',
    about: 'IBPS PO recruits Probationary Officers into public sector banks (other than SBI) — a career entry point into Indian banking. It tests Quantitative Aptitude, Reasoning, English and General/Banking Awareness, with speed under strict sectional timing as a defining challenge.',
    structure: 'Prelims (objective, sectional timing), Mains (objective plus a descriptive English component), and an interview.',
    howSadhyaHelps: [
      'Timed, sectional practice that builds the speed IBPS PO\'s strict per-section limits actually demand',
      'Banking Awareness explanations that connect concepts to real banking-sector context, so they stick',
      'Descriptive English practice — essay and letter writing — for the Mains component many candidates neglect',
      'Adaptive tests that flag which section is quietly capping your overall score',
    ],
    keywords: ['IBPS PO preparation', 'IBPS PO AI tutor', 'bank PO exam India', 'banking exam preparation'],
  },
  {
    slug: 'sbi-po',
    name: 'SBI PO',
    fullName: 'SBI Probationary Officer Examination',
    category: 'Banking & Finance',
    conductedBy: 'State Bank of India (SBI)',
    about: 'SBI PO recruits Probationary Officers directly into State Bank of India, India\'s largest public sector bank. Its pattern closely resembles IBPS PO — Quantitative Aptitude, Reasoning, English and awareness — but is widely regarded as more competitive given SBI\'s scale and profile.',
    structure: 'Prelims, Mains (objective plus descriptive English), and Group Exercise / Interview for shortlisted candidates.',
    howSadhyaHelps: [
      'The same sectional-speed training as IBPS PO prep, calibrated to SBI PO\'s typically sharper competition',
      'Descriptive English (essay, letter) practice for the Mains stage, with structured feedback on the response',
      'Banking and economic awareness content kept current and connected to concepts, not just isolated facts',
      'Adaptive tests to identify exactly which section needs another pass before Mains',
    ],
    keywords: ['SBI PO preparation', 'SBI PO AI tutor', 'State Bank of India PO exam'],
  },
  {
    slug: 'rbi-grade-b',
    name: 'RBI Grade B',
    fullName: 'RBI Grade B Officer Examination',
    category: 'Banking & Finance',
    conductedBy: 'Reserve Bank of India (RBI)',
    about: 'RBI Grade B recruits officers into India\'s central bank — a regulatory and policy role rather than a commercial-banking one, which is why the exam leans heavily on Economics, Finance, and Business/Financial Awareness alongside the usual Quant, Reasoning and English.',
    structure: 'Phase 1 (objective screening), Phase 2 (objective plus descriptive papers in Economic & Social Issues, Finance & Management, and English), and an interview.',
    howSadhyaHelps: [
      'Economics and Finance & Management explained at the depth Phase 2\'s descriptive papers actually need, not just definitions',
      'Descriptive answer-writing practice for Economic & Social Issues, organized by topic in Notebooks',
      'Current economic and financial developments connected back to the theory they illustrate',
      'Adaptive Phase 1 practice to build the speed needed before descriptive prep can even matter',
    ],
    keywords: ['RBI Grade B preparation', 'RBI Grade B AI tutor', 'Reserve Bank of India officer exam'],
  },
  {
    slug: 'rrb-ntpc',
    name: 'RRB NTPC',
    fullName: 'RRB Non-Technical Popular Categories Examination',
    category: 'Railways',
    conductedBy: 'Railway Recruitment Board (RRB)',
    about: 'RRB NTPC recruits into non-technical posts across Indian Railways — roles like Station Master, Goods Guard and Clerk. It tests General Awareness, Mathematics, and General Intelligence & Reasoning, with a large candidate pool making speed and accuracy both matter.',
    structure: 'A staged objective exam (CBT 1 and CBT 2), with document verification and, for some posts, a skill or aptitude test to follow.',
    howSadhyaHelps: [
      'General Awareness content covering the current affairs and static GK RRB NTPC draws heavily on',
      'Timed Math and Reasoning practice built for CBT-style speed, not leisurely problem sets',
      'Adaptive tests that adjust difficulty as you improve, so practice time isn\'t wasted on what you\'ve already mastered',
      'A study planner that fits NTPC prep around a job or ongoing studies, common for this exam\'s candidate pool',
    ],
    keywords: ['RRB NTPC preparation', 'RRB NTPC AI tutor', 'railway recruitment exam India'],
  },
  {
    slug: 'ugc-net',
    name: 'UGC NET',
    fullName: 'UGC National Eligibility Test',
    category: 'Academia',
    conductedBy: 'National Testing Agency (NTA), on behalf of UGC',
    about: 'UGC NET determines eligibility for Assistant Professor positions and Junior Research Fellowship (JRF) in Indian universities and colleges. It combines a General Paper on Teaching & Research Aptitude with a paper in the candidate\'s chosen subject, tested at a postgraduate depth.',
    structure: 'Two papers on the same day: Paper 1 (general teaching and research aptitude, common to all candidates) and Paper 2 (subject-specific, postgraduate level).',
    howSadhyaHelps: [
      'Paper 1\'s teaching and research aptitude topics — often underprepared since they feel generic — explained with real exam-style questions',
      'Subject-specific Paper 2 support at postgraduate depth, matched to your actual discipline',
      'Notebooks for organizing research-heavy subject material by unit, built for how NET actually structures its syllabus',
      'Adaptive practice that surfaces which subject units need another look before the exam',
    ],
    keywords: ['UGC NET preparation', 'UGC NET AI tutor', 'NET JRF exam India', 'assistant professor eligibility exam'],
  },
  {
    slug: 'state-pscs',
    name: 'State PSCs',
    fullName: 'State Public Service Commission Examinations',
    category: 'Civil Services',
    conductedBy: 'Individual State Public Service Commissions (e.g. UPPSC, MPPSC, RPSC)',
    about: 'Beyond BPSC, most Indian states run their own Public Service Commission exam for state administrative services — structured similarly to UPSC CSE but weighted toward that state\'s own history, geography, governance and current affairs, alongside general studies.',
    structure: 'Typically Prelims (objective general studies), Mains (descriptive papers including state-specific General Studies), and an interview — the specifics vary by state.',
    howSadhyaHelps: [
      'General Studies coverage combined with your state\'s specific history, geography and governance content',
      'Mains-style descriptive answer practice organized by paper in Notebooks',
      'Current affairs explained with both state and national context, since most State PSCs test both',
      'Adaptive Prelims practice to find and close syllabus gaps ahead of the exam',
    ],
    keywords: ['State PSC preparation', 'State Public Service Commission exam AI tutor', 'UPPSC MPPSC RPSC preparation'],
  },
  {
    slug: 'cbse-icse',
    name: 'CBSE & ICSE',
    fullName: 'CBSE & ICSE Board Curriculum, Class 6–12',
    category: 'School Board',
    conductedBy: 'CBSE and CISCE (ICSE/ISC)',
    about: 'Beyond entrance exams, Sadhya supports day-to-day schoolwork for CBSE and ICSE students from Class 6 through 12 — homework help, concept explanations, and revision aligned to the board\'s own textbooks and syllabus, not a generic curriculum.',
    structure: 'Continuous school-year assessment plus board examinations at Class 10 and Class 12, subject-wise, following the CBSE or ICSE syllabus for that year.',
    howSadhyaHelps: [
      'Photograph a homework question from an NCERT or ICSE textbook and get it explained step by step, matched to the actual chapter',
      'Chapter-wise notebooks that mirror the board syllabus, so revision never drifts from what will actually be examined',
      'Adaptive practice tests calibrated to board exam difficulty, not competitive-exam difficulty',
      'An AI tutor available for any subject, any chapter, whenever homework happens — not limited to fixed tuition hours',
    ],
    keywords: ['CBSE homework help', 'ICSE homework help', 'Class 10 12 board exam preparation', 'school AI tutor India'],
  },
];

export const getExamBySlug = (slug: string): ExamEntry | undefined =>
  EXAM_CATALOG.find((e) => e.slug === slug);
