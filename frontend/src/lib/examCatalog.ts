/**
 * Single source of truth for every exam Sadhya covers, driving the landing page's
 * exam chips and the dedicated rich /exams/:slug interactive hubs.
 */

export interface ExamStage {
  name: string;
  type: string;
  duration: string;
  totalMarks: string;
  markingScheme: string;
  sections: {
    name: string;
    questions: string;
    marks: string;
    timing?: string;
  }[];
}

export interface ExamSubjectSyllabus {
  subject: string;
  highWeightageTopics: string[];
  chapters: {
    unit: string;
    topics: string[];
  }[];
}

export interface ExamEligibility {
  qualification: string;
  ageLimit: string;
  attemptsLimit?: string;
  languageMedium: string;
}

export interface ExamEntry {
  slug: string;
  name: string;
  fullName: string;
  category: 'Medical' | 'Engineering' | 'Civil Services' | 'Teaching' | 'Banking & Finance' | 'Railways' | 'University Admission' | 'Academia' | 'School Board';
  conductedBy: string;
  officialSite?: string;
  about: string;
  structure: string;
  mode: string;
  frequency: string;
  totalMarks: string;
  duration: string;
  markingScheme: string;
  eligibility: ExamEligibility;
  stages: ExamStage[];
  syllabus: ExamSubjectSyllabus[];
  preparationTips: string[];
  howSadhyaHelps: string[];
  keywords: string[];
}

export const EXAM_CATALOG: ExamEntry[] = [
  {
    slug: 'neet',
    name: 'NEET',
    fullName: 'National Eligibility cum Entrance Test (UG)',
    category: 'Medical',
    conductedBy: 'National Testing Agency (NTA)',
    officialSite: 'https://exams.nta.ac.in/NEET/',
    about: 'NEET is India’s sole national-level entrance exam for undergraduate medical admissions into MBBS, BDS, BAMS, BHMS, and other allied healthcare courses across government, central, AIIMS, JIPMER, and private medical colleges nationwide.',
    structure: 'Single objective-type pen-and-paper examination with 200 questions (180 to attempt) covering Physics, Chemistry, Botany, and Zoology.',
    mode: 'Pen & Paper (OMR Sheet)',
    frequency: 'Once a year (Annual)',
    totalMarks: '720 Marks',
    duration: '3 Hours 20 Minutes (200 minutes)',
    markingScheme: '+4 for each correct answer, -1 for each incorrect answer, 0 for unattempted questions.',
    eligibility: {
      qualification: 'Class 12 pass or appearing with Physics, Chemistry, Biology/Biotechnology, and English as core subjects.',
      ageLimit: 'Minimum 17 years completed as of 31st December of the admission year. No upper age limit.',
      attemptsLimit: 'No cap on total number of attempts.',
      languageMedium: '13 Languages (English, Hindi, Assamese, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Urdu).',
    },
    stages: [
      {
        name: 'Single Stage National Examination',
        type: 'Objective Multiple Choice (OMR)',
        duration: '200 Minutes',
        totalMarks: '720 Marks',
        markingScheme: '+4 correct / -1 incorrect',
        sections: [
          { name: 'Physics (Section A: 35 Qs + Section B: 15 Qs, attempt 10)', questions: '50 Qs (45 to attempt)', marks: '180 Marks' },
          { name: 'Chemistry (Section A: 35 Qs + Section B: 15 Qs, attempt 10)', questions: '50 Qs (45 to attempt)', marks: '180 Marks' },
          { name: 'Botany (Section A: 35 Qs + Section B: 15 Qs, attempt 10)', questions: '50 Qs (45 to attempt)', marks: '180 Marks' },
          { name: 'Zoology (Section A: 35 Qs + Section B: 15 Qs, attempt 10)', questions: '50 Qs (45 to attempt)', marks: '180 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Biology (Botany & Zoology)',
        highWeightageTopics: ['Genetics & Evolution', 'Human Physiology', 'Cell Biology & Cell Cycle', 'Ecology & Environment', 'Plant Physiology', 'Biotechnology & Applications'],
        chapters: [
          { unit: 'Diversity in Living World', topics: ['What is living?', 'Biological Classification', 'Plant Kingdom', 'Animal Kingdom'] },
          { unit: 'Structural Organisation', topics: ['Morphology of Flowering Plants', 'Anatomy of Flowering Plants', 'Animal Tissues & Cockroach/Frog'] },
          { unit: 'Cell Structure and Function', topics: ['Cell: The Unit of Life', 'Biomolecules', 'Cell Cycle & Cell Division'] },
          { unit: 'Genetics and Evolution', topics: ['Principles of Inheritance and Variation', 'Molecular Basis of Inheritance', 'Evolution'] },
          { unit: 'Human Physiology', topics: ['Breathing and Exchange of Gases', 'Body Fluids and Circulation', 'Excretory Products', 'Locomotion and Movement', 'Neural Control & Chemical Coordination'] },
          { unit: 'Biotechnology & Ecology', topics: ['Principles & Processes', 'Applications in Health & Agriculture', 'Organisms and Populations', 'Ecosystem', 'Biodiversity and Conservation'] },
        ],
      },
      {
        subject: 'Physics',
        highWeightageTopics: ['Mechanics & Rotational Motion', 'Electrodynamics & Current Electricity', 'Optics (Wave & Ray)', 'Thermodynamics & Modern Physics', 'Semiconductors'],
        chapters: [
          { unit: 'Mechanics', topics: ['Units and Measurements', 'Motion in a Straight Line', 'Motion in a Plane', 'Laws of Motion', 'Work, Energy and Power', 'System of Particles & Rotational Motion', 'Gravitation'] },
          { unit: 'Thermodynamics & Matter', topics: ['Mechanical Properties of Solids & Fluids', 'Thermal Properties of Matter', 'Thermodynamics', 'Kinetic Theory'] },
          { unit: 'Electromagnetism', topics: ['Electrostatics & Capacitance', 'Current Electricity', 'Moving Charges & Magnetism', 'Magnetism & Matter', 'Electromagnetic Induction', 'Alternating Current', 'EM Waves'] },
          { unit: 'Optics & Modern Physics', topics: ['Ray Optics & Optical Instruments', 'Wave Optics', 'Dual Nature of Radiation & Matter', 'Atoms & Nuclei', 'Semiconductor Electronics'] },
        ],
      },
      {
        subject: 'Chemistry',
        highWeightageTopics: ['Chemical Bonding & Molecular Structure', 'Organic Reaction Mechanisms & Carbonyls', 'Coordination Compounds', 'Electrochemistry & Solutions', 'Thermodynamics & Equilibrium'],
        chapters: [
          { unit: 'Physical Chemistry', topics: ['Some Basic Concepts of Chemistry', 'Structure of Atom', 'Chemical Thermodynamics', 'Equilibrium', 'Redox Reactions', 'Solutions', 'Electrochemistry', 'Chemical Kinetics'] },
          { unit: 'Inorganic Chemistry', topics: ['Classification of Elements & Periodicity', 'Chemical Bonding and Molecular Structure', 'p-Block Elements', 'd and f Block Elements', 'Coordination Compounds'] },
          { unit: 'Organic Chemistry', topics: ['GOC & Purification', 'Hydrocarbons', 'Haloalkanes and Haloarenes', 'Alcohols, Phenols and Ethers', 'Aldehydes, Ketones and Carboxylic Acids', 'Amines', 'Biomolecules'] },
        ],
      },
    ],
    preparationTips: [
      'NCERT Line-by-Line Mastery: Over 85% of Biology questions directly mirror NCERT statements and diagrams.',
      'Daily Numerical Problem Solving: Dedicate 90 minutes daily to Physics and Physical Chemistry formula derivations and numericals.',
      'Timed Mock Drills: Practice 200-minute full mock tests to master time management across all 4 subjects.',
    ],
    howSadhyaHelps: [
      'Snap a photo of any complex Biology diagram or Organic mechanism from your textbook to get an instant step-by-step interactive breakdown.',
      'Auto-generate adaptive chapter quizzes focused precisely on high-yield NEET topics like Genetics, Electrodynamics, and Thermodynamics.',
      'Track your speed and accuracy across every subject, identifying hidden negative marking patterns before the real exam.',
      'Turn dense chapters into immersive two-voice audio podcasts for effortless revision on the go.',
    ],
    keywords: ['NEET UG preparation', 'NEET AI tutor', 'NEET Biology Physics Chemistry', 'medical entrance exam India'],
  },
  {
    slug: 'jee-main',
    name: 'JEE Main',
    fullName: 'Joint Entrance Examination — Main',
    category: 'Engineering',
    conductedBy: 'National Testing Agency (NTA)',
    officialSite: 'https://jeemain.nta.ac.in/',
    about: 'JEE Main is India’s flagship national engineering entrance exam for admissions to NITs, IIITs, CFTIs, and premier engineering institutes, while simultaneously serving as the eligibility cutoff test for JEE Advanced.',
    structure: 'Computer Based Test (CBT) consisting of 90 questions across Physics, Chemistry, and Mathematics (attempt 75 questions total).',
    mode: 'Computer Based Test (CBT Online)',
    frequency: 'Twice a year (Session 1 in Jan, Session 2 in Apr)',
    totalMarks: '300 Marks',
    duration: '3 Hours (180 minutes)',
    markingScheme: '+4 for correct answer, -1 for incorrect answer (applicable to both MCQs and Numerical Value Questions).',
    eligibility: {
      qualification: 'Class 12 passed or appearing with Physics and Mathematics along with Chemistry/Biology/Biotech/Technical Vocational subject.',
      ageLimit: 'No age limit set by NTA.',
      attemptsLimit: 'Eligible for 3 consecutive years from the year of passing Class 12.',
      languageMedium: '13 Languages (English, Hindi, Gujarati, Assamese, Bengali, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Urdu).',
    },
    stages: [
      {
        name: 'Paper 1 (B.E. / B.Tech)',
        type: 'Computer Based Test (MCQ + Numerical Value)',
        duration: '180 Minutes',
        totalMarks: '300 Marks',
        markingScheme: '+4 correct / -1 incorrect',
        sections: [
          { name: 'Mathematics (20 MCQs + 10 Numerical, attempt 5)', questions: '30 Qs (25 to attempt)', marks: '100 Marks' },
          { name: 'Physics (20 MCQs + 10 Numerical, attempt 5)', questions: '30 Qs (25 to attempt)', marks: '100 Marks' },
          { name: 'Chemistry (20 MCQs + 10 Numerical, attempt 5)', questions: '30 Qs (25 to attempt)', marks: '100 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Mathematics',
        highWeightageTopics: ['Calculus (Definite Integrals, Differential Equations)', 'Coordinate Geometry (Conics & Circles)', 'Vector & 3D Geometry', 'Matrices & Determinants', 'Probability & Statistics'],
        chapters: [
          { unit: 'Algebra', topics: ['Complex Numbers & Quadratic Equations', 'Matrices & Determinants', 'Permutations & Combinations', 'Binomial Theorem', 'Sequence & Series', 'Probability & Statistics'] },
          { unit: 'Calculus', topics: ['Sets, Relations & Functions', 'Limits, Continuity & Differentiability', 'Applications of Derivatives', 'Indefinite & Definite Integrals', 'Differential Equations'] },
          { unit: 'Coordinate Geometry & Vectors', topics: ['Straight Lines & Circles', 'Conic Sections (Parabola, Ellipse, Hyperbola)', 'Vector Algebra', 'Three Dimensional Geometry'] },
        ],
      },
      {
        subject: 'Physics',
        highWeightageTopics: ['Current Electricity & Magnetism', 'Modern Physics & Semiconductor', 'Work, Energy & Rotational Dynamics', 'Optics & Wave Motion', 'Thermodynamics & KTG'],
        chapters: [
          { unit: 'Mechanics & Gravitation', topics: ['Kinematics & Laws of Motion', 'Work, Energy and Power', 'Rotational Motion & Centre of Mass', 'Gravitation', 'Properties of Solids and Liquids'] },
          { unit: 'Thermal & Wave Physics', topics: ['Thermodynamics & Heat Transfer', 'Kinetic Theory of Gases', 'Oscillations and Simple Harmonic Motion', 'Waves and Sound'] },
          { unit: 'Electromagnetism & Modern Physics', topics: ['Electrostatics & Capacitance', 'Current Electricity & Magnetic Effects', 'Electromagnetic Induction & AC', 'Optics', 'Dual Nature, Atoms & Nuclei', 'Electronic Devices'] },
        ],
      },
      {
        subject: 'Chemistry',
        highWeightageTopics: ['Chemical Bonding & Coordination Chemistry', 'GOC & Carbonyl Compounds', 'Chemical Kinetics & Electrochemistry', 'Thermodynamics & Chemical Equilibrium', 'p-Block & d-Block Chemistry'],
        chapters: [
          { unit: 'Physical Chemistry', topics: ['Atomic Structure', 'Chemical Thermodynamics', 'Solutions', 'Equilibrium', 'Redox Reactions & Electrochemistry', 'Chemical Kinetics'] },
          { unit: 'Inorganic Chemistry', topics: ['Periodic Table & Periodicity', 'Chemical Bonding & Molecular Structure', 'd- and f-Block Elements', 'Coordination Compounds'] },
          { unit: 'Organic Chemistry', topics: ['Purification & Basic Principles (GOC)', 'Hydrocarbons', 'Halides, Alcohols, Phenols & Ethers', 'Aldehydes, Ketones, Carboxylic Acids & Amines', 'Biomolecules'] },
        ],
      },
    ],
    preparationTips: [
      'Focus on Numerical Accuracy: 30 out of 75 questions are numerical response where calculation precision is paramount.',
      'Prioritize High-Weightage Chapters: Coordinate Geometry, 3D Vectors, Organic Reaction Mechanisms, and Modern Physics offer the highest ROI.',
      'Formula Speed-Sheets: Keep active memory of 500+ formulas with weekly revision tests.',
    ],
    howSadhyaHelps: [
      'Break down complex calculus numericals and mechanics problems step by step with multiple resolution techniques.',
      'Generate timed section mocks with realistic JEE Main percentile and accuracy predictions.',
      'Organize your personal formula sheets, shortcuts, and solved PYQs into clean, searchable chapter notebooks.',
    ],
    keywords: ['JEE Main preparation', 'JEE Main AI tutor', 'engineering entrance exam India', 'JEE Physics Chemistry Maths'],
  },
  {
    slug: 'jee-advanced',
    name: 'JEE Advanced',
    fullName: 'Joint Entrance Examination — Advanced',
    category: 'Engineering',
    conductedBy: 'IITs (Organizing Institute rotates annually)',
    officialSite: 'https://jeeadv.ac.in/',
    about: 'JEE Advanced is India’s premier entrance test for admissions to the prestigious Indian Institutes of Technology (IITs). Only the top 2.5 lakh candidates from JEE Main qualify to sit for this exceptionally rigorous multi-concept test.',
    structure: 'Two mandatory 3-hour papers on the same day (Paper 1 and Paper 2) with variable marking schemes, multi-correct, matrix match, and integer types.',
    mode: 'Computer Based Test (CBT)',
    frequency: 'Once a year (May/June)',
    totalMarks: 'Varies by year (~360–372 Marks)',
    duration: '6 Hours (Two 3-hour sessions: Paper 1 & Paper 2)',
    markingScheme: 'Variable per section: Partial marking for multi-correct options (+4, +3, +2, +1, -2), negative marking on single correct and numerical questions.',
    eligibility: {
      qualification: 'Must rank within top 2,50,000 in JEE Main (B.E./B.Tech) and pass Class 12 with minimum 75% aggregate (65% for SC/ST/PwD) or top 20 percentile.',
      ageLimit: 'Candidates must be born on or after October 1, 1999 (with 5 years relaxation for SC/ST/PwD).',
      attemptsLimit: 'Maximum 2 attempts in 2 consecutive years.',
      languageMedium: 'English and Hindi.',
    },
    stages: [
      {
        name: 'Paper 1 (Morning Session)',
        type: 'CBT (Single correct, Multi-correct, Numerical, Paragraphs)',
        duration: '180 Minutes',
        totalMarks: '~180 Marks',
        markingScheme: 'Includes partial marking and negative marks up to -2',
        sections: [
          { name: 'Physics Paper 1', questions: '~18 Qs', marks: '~60 Marks' },
          { name: 'Chemistry Paper 1', questions: '~18 Qs', marks: '~60 Marks' },
          { name: 'Mathematics Paper 1', questions: '~18 Qs', marks: '~60 Marks' },
        ],
      },
      {
        name: 'Paper 2 (Afternoon Session)',
        type: 'CBT (Multi-correct, Numerical Value, Matrix Match, Stem questions)',
        duration: '180 Minutes',
        totalMarks: '~180 Marks',
        markingScheme: 'Includes partial marking and negative marks up to -2',
        sections: [
          { name: 'Physics Paper 2', questions: '~18 Qs', marks: '~60 Marks' },
          { name: 'Chemistry Paper 2', questions: '~18 Qs', marks: '~60 Marks' },
          { name: 'Mathematics Paper 2', questions: '~18 Qs', marks: '~60 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Advanced Mathematics',
        highWeightageTopics: ['Calculus & Differential Equations', 'Complex Numbers & Geometry', 'Vectors & 3D Lines/Planes', 'Conics & Parabola/Hyperbola', 'Probability & Bayes Theorem'],
        chapters: [
          { unit: 'Algebra & Complex Analysis', topics: ['Complex Numbers (Roots of unity, Geometry)', 'Quadratic Equations & Polynomials', 'Matrices (Eigen values, Cayley-Hamilton intuition)', 'Permutations, Combinations & Probability'] },
          { unit: 'Calculus & Analysis', topics: ['Functions & Graphs', 'Limits, Continuity & Differentiability', 'Rolle’s & Lagrange Mean Value Theorems', 'Definite Integrals (Properties, Leibniz Rule)', 'Differential Equations (Homogeneous, Linear)'] },
          { unit: 'Geometry & Vectors', topics: ['Conics (Tangents, Normals, Chord of Contact)', '3D Geometry (Shortest Distance, Coplanarity)', 'Vectors (Scalar and Vector Triple Products)'] },
        ],
      },
      {
        subject: 'Advanced Physics',
        highWeightageTopics: ['Rotational Dynamics & Rigid Body Mechanics', 'Electromagnetic Induction & Faraday/Lenz Laws', 'Optics (Wave & Ray)', 'Thermodynamics & Heat Cycles', 'Atomic, Nuclear & Modern Physics'],
        chapters: [
          { unit: 'General & Mechanics', topics: ['Errors & Dimensional Analysis', 'Kinematics & Friction', 'Work Energy & Collisions', 'Moment of Inertia, Angular Momentum Conservation', 'Fluid Statics & Dynamics', 'SHM & Damped Oscillations'] },
          { unit: 'Thermal & Wave Physics', topics: ['Thermal Expansion & Calorimetry', 'First & Second Laws of Thermodynamics', 'Carnot Cycles & Heat Engines', 'Wave Motion & Doppler Effect'] },
          { unit: 'Electromagnetism & Modern', topics: ['Gauss Law & Conductors', 'Biot-Savart & Ampere Laws', 'Faraday Law, Mutual Inductance & LC Oscillations', 'Wave Optics & Interference', 'Photoelectric Effect, Bohr Model & Radioactivity'] },
        ],
      },
      {
        subject: 'Advanced Chemistry',
        highWeightageTopics: ['Multi-Step Organic Syntheses & Named Reactions', 'Coordination Chemistry & Isomerism', 'Chemical Thermodynamics & Electrochemistry', 'Chemical & Ionic Equilibrium', 'Qualitative Inorganic Analysis (Salt Analysis)'],
        chapters: [
          { unit: 'Physical Chemistry', topics: ['Gaseous State & Real Gases', 'Atomic Structure & Quantum Numbers', 'Energetics & Entropy', 'Ionic & Chemical Equilibrium', 'Electrochemistry & Nernst Equation', 'Surface Chemistry'] },
          { unit: 'Inorganic Chemistry', topics: ['Extraction of Metals (Metallurgy)', 'Principles of Qualitative Analysis', 'Coordination Compounds & Crystal Field Theory', 'Transition Elements & p-Block Compounds'] },
          { unit: 'Organic Chemistry', topics: ['Reaction Mechanisms (SN1, SN2, E1, E2)', 'Stereochemistry & Optical Isomerism', 'Carbonyl Compounds, Enolates & Grignard Reagents', 'Aromatic Compounds & Electrophilic Substitution', 'Biomolecules & Polymers'] },
        ],
      },
    ],
    preparationTips: [
      'Multi-Concept Problem Solving: Practice problems that merge 2–3 chapters simultaneously (e.g. Thermodynamics with Mechanics).',
      'Partial Marking Strategy: On multiple-correct questions, never guess the final option unless 100% confident.',
      'Original IIT Past Papers: Solve 15+ years of real JEE Advanced papers under strict 6-hour two-session test conditions.',
    ],
    howSadhyaHelps: [
      'Deconstruct complex multi-tiered IIT problems into transparent first-principles logic steps.',
      'Highlight subtle traps, edge cases, and sign conventions in multi-correct questions.',
      'Generate deep conceptual diagnostics that reveal whether errors stem from mathematical slips or fundamental misconceptions.',
    ],
    keywords: ['JEE Advanced preparation', 'IIT JEE AI tutor', 'JEE Advanced Physics Chemistry Maths'],
  },
  {
    slug: 'upsc-cse',
    name: 'UPSC CSE',
    fullName: 'Civil Services Examination (IAS / IPS / IFS)',
    category: 'Civil Services',
    conductedBy: 'Union Public Service Commission (UPSC)',
    officialSite: 'https://upsc.gov.in/',
    about: 'The UPSC Civil Services Examination is India’s most prestigious competitive exam for recruitment into premier administrative services including IAS, IPS, IFS, IRS, and allied central Group A services.',
    structure: '3-Stage rigorous selection: Prelims (Objective), Mains (9 Descriptive Written Papers), and Personality Test (Interview).',
    mode: 'Offline Pen & Paper (OMR for Prelims, Descriptive for Mains)',
    frequency: 'Once a year (Annual Cycle)',
    totalMarks: '2025 Marks (Mains 1750 + Interview 275)',
    duration: 'Prelims: 4 Hours (2 papers) | Mains: 27 Hours (9 papers over 5 days)',
    markingScheme: 'Prelims: GS Paper 1 (+2, -0.66) | CSAT Paper 2 (+2.5, -0.83, qualifying at 33%). Mains: Subjective evaluation.',
    eligibility: {
      qualification: 'Graduate degree from any recognized University in any discipline.',
      ageLimit: 'General: 21 to 32 years. OBC: 21 to 35 years. SC/ST: 21 to 37 years.',
      attemptsLimit: 'General: 6 attempts. OBC: 9 attempts. SC/ST: Unlimited till age limit.',
      languageMedium: 'Mains and Interview can be written in English, Hindi, or any of the 22 Eighth Schedule Indian Languages.',
    },
    stages: [
      {
        name: 'Stage 1: Civil Services Preliminary Examination (Screening)',
        type: 'Objective (MCQ)',
        duration: '4 Hours (Two 2-Hour Papers)',
        totalMarks: '400 Marks',
        markingScheme: '+2 / -0.66 in GS 1; +2.5 / -0.83 in CSAT (Qualifying 33%)',
        sections: [
          { name: 'General Studies Paper I (Merit Ranking for Prelims)', questions: '100 Qs', marks: '200 Marks', timing: '2 Hours' },
          { name: 'General Studies Paper II / CSAT (Qualifying 33%)', questions: '80 Qs', marks: '200 Marks', timing: '2 Hours' },
        ],
      },
      {
        name: 'Stage 2: Civil Services Main Examination (Written)',
        type: 'Descriptive Essay & Analytical Answer Writing',
        duration: '9 Papers across 5 Days (3 Hours per paper)',
        totalMarks: '1750 Marks (Counted for Merit)',
        markingScheme: 'Descriptive qualitative and analytical assessment',
        sections: [
          { name: 'Paper A: Indian Language (Qualifying, 25%)', questions: 'Subjective', marks: '300 Marks (Qualifying)' },
          { name: 'Paper B: English Language (Qualifying, 25%)', questions: 'Subjective', marks: '300 Marks (Qualifying)' },
          { name: 'Paper I: Essay (Two essays from 8 topics)', questions: '2 Essays', marks: '250 Marks' },
          { name: 'Paper II: General Studies I (Heritage, History, Geo, Society)', questions: '20 Questions', marks: '250 Marks' },
          { name: 'Paper III: General Studies II (Polity, Governance, IR, Justice)', questions: '20 Questions', marks: '250 Marks' },
          { name: 'Paper IV: General Studies III (Economy, Sci-Tech, Env, Security)', questions: '20 Questions', marks: '250 Marks' },
          { name: 'Paper V: General Studies IV (Ethics, Integrity, Aptitude)', questions: 'Case Studies + Theory', marks: '250 Marks' },
          { name: 'Paper VI: Optional Subject Paper 1', questions: 'Subjective', marks: '250 Marks' },
          { name: 'Paper VII: Optional Subject Paper 2', questions: 'Subjective', marks: '250 Marks' },
        ],
      },
      {
        name: 'Stage 3: Personality Test (Interview)',
        type: 'In-person Board Interview at Dholpur House, New Delhi',
        duration: '30–45 Minutes',
        totalMarks: '275 Marks',
        markingScheme: 'Assessment of intellectual caliber, critical judgment, moral integrity, and administrative suitability',
        sections: [
          { name: 'Personality Assessment & DAF Evaluation', questions: 'Panel Interaction', marks: '275 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'General Studies I (History, Geography & Society)',
        highWeightageTopics: ['Modern Indian History & Freedom Struggle', 'Physical, Economic & Human Geography', 'Art & Architecture', 'Indian Society & Women Empowerment', 'Post-Independence Consolidation'],
        chapters: [
          { unit: 'History & Culture', topics: ['Ancient to Modern Art Forms, Literature and Architecture', 'Modern Indian History from middle of 18th century until present', 'The Freedom Struggle: various stages and contributors', 'World History: Industrial Revolution, World Wars, Decolonization'] },
          { unit: 'Society & Social Issues', topics: ['Salient features of Indian Society & Diversity', 'Role of Women and Women’s Organizations', 'Poverty, Developmental Issues & Urbanization', 'Effects of Globalization on Indian Society', 'Social Empowerment, Communalism, Regionalism & Secularism'] },
          { unit: 'Geography', topics: ['Physical Geography of the World (Geomorphology, Climatology, Oceanography)', 'Distribution of Key Natural Resources across the World', 'Location of Primary, Secondary, and Tertiary Sector Industries', 'Important Geophysical Phenomena (Earthquakes, Tsunami, Volcanic activity, Cyclones)'] },
        ],
      },
      {
        subject: 'General Studies II (Polity, Governance & IR)',
        highWeightageTopics: ['Indian Constitution & Federal Structure', 'Judiciary, Separation of Powers & Tribunals', 'Welfare Schemes & Social Justice', 'Statutory, Regulatory & Quasi-Judicial Bodies', 'India’s Bilateral & Global Relations'],
        chapters: [
          { unit: 'Constitution & Polity', topics: ['Historical Underpinnings, Evolution, Features, Amendments', 'Functions and Responsibilities of the Union and the States', 'Separation of Powers, Dispute Redressal Mechanisms', 'Comparison of the Indian Constitutional Scheme with Others', 'Parliament and State Legislatures', 'Salient Features of the Representation of People’s Act'] },
          { unit: 'Governance & Social Justice', topics: ['Government Policies and Interventions for Development', 'Development Processes and the Development Industry (NGOs, SHGs)', 'Welfare Schemes for Vulnerable Sections', 'Issues Relating to Poverty, Hunger, Health & Education', 'Important Aspects of Governance, Transparency and Accountability (RTI, Citizens Charters)'] },
          { unit: 'International Relations', topics: ['India and its Neighborhood Relations', 'Bilateral, Regional and Global Groupings and Agreements', 'Effect of Policies and Politics of Developed and Developing Countries', 'Important International Institutions, Agencies and Fora'] },
        ],
      },
      {
        subject: 'General Studies III (Economy, Science, Environment & Security)',
        highWeightageTopics: ['Indian Economy & Resource Mobilization', 'Agriculture, PDS & Subsidies', 'Environmental Conservation & Climate Change', 'Science & Technology Developments', 'Internal Security & Cyber Threats'],
        chapters: [
          { unit: 'Economy & Agriculture', topics: ['Indian Economy and issues relating to Planning, Growth & Employment', 'Inclusive Growth and issues arising from it', 'Government Budgeting', 'Major Crops, Cropping Patterns, Irrigation Systems', 'Direct and Indirect Farm Subsidies, Minimum Support Prices (MSP), PDS, Buffer Stocks', 'Food Processing and Related Industries in India', 'Land Reforms in India', 'Effects of Liberalization on the Economy, Infrastructure (Energy, Ports, Roads, Railways)'] },
          { unit: 'Science, Technology & Environment', topics: ['Developments in Science & Technology (AI, Quantum, Biotech, Space)', 'Indigenization of Technology', 'Awareness in IT, Space, Computers, Robotics, Nanotech', 'Conservation, Environmental Pollution and Degradation, Environmental Impact Assessment (EIA)', 'Disaster and Disaster Management'] },
          { unit: 'Internal Security', topics: ['Linkages between Development and Spread of Extremism', 'Role of External State and Non-State Actors in creating Challenges to Internal Security', 'Challenges to Internal Security through Communication Networks, Media & Cyber Security', 'Money-Laundering and its Prevention', 'Security Challenges and their Management in Border Areas, Organized Crime', 'Various Security Forces and Agencies and their Mandate'] },
        ],
      },
      {
        subject: 'General Studies IV (Ethics, Integrity & Aptitude)',
        highWeightageTopics: ['Ethical Dilemmas in Public Life', 'Emotional Intelligence in Administration', 'Attitude & Moral Values', 'Probity in Governance & Code of Conduct', 'Comprehensive Case Studies on Real-World Administration'],
        chapters: [
          { unit: 'Ethics & Human Interface', topics: ['Essence, Determinants and Consequences of Ethics in Human Actions', 'Dimensions of Ethics; Ethics in Private and Public Relationships', 'Human Values: Lessons from the Lives and Teachings of Great Leaders, Reformers and Administrators', 'Role of Family, Society and Educational Institutions in Inculcating Values'] },
          { unit: 'Attitude & Emotional Intelligence', topics: ['Attitude: Content, Structure, Function; its influence on Thought and Behavior', 'Moral and Political Attitudes; Social Influence and Persuasion', 'Emotional Intelligence: Concepts, Utilities and Application in Administration and Governance', 'Contributions of Moral Thinkers and Philosophers from India and World'] },
          { unit: 'Public Service Values & Case Studies', topics: ['Public/Civil Service Values and Ethics in Public Administration', 'Ethical Concerns and Dilemmas in Government and Private Institutions', 'Laws, Rules, Regulations and Conscience as Sources of Ethical Guidance', 'Accountability and Ethical Governance; Strengthening of Ethical and Moral Values in Governance', 'Corporate Governance; Probity in Governance: Concept of Public Service', 'Citizen’s Charters, Work Culture, Quality of Service Delivery', 'Case Studies on all above issues (Administrative scenarios, ethical dilemmas, decision-making under crisis)'] },
        ],
      },
    ],
    preparationTips: [
      'Daily Answer Writing: Practice 2–3 structured Mains answers daily incorporating diagrams, data points, and committee recommendations.',
      'Syllabus Keyword Mapping: Link every day’s news to specific GS 1–4 syllabus micro-topics.',
      'CSAT Consistency: Dedicate 3 hours weekly to CSAT Comprehension and Logical Reasoning to avoid unexpected Prelims elimination.',
    ],
    howSadhyaHelps: [
      'Draft, evaluate, and refine Mains answers with rubric-based feedback on structure, intro, arguments, and balanced conclusions.',
      'Seamlessly connect current affairs developments with foundational static concepts across Polity, Economy, and International Relations.',
      'Generate adaptive GS 1 & CSAT Prelims mock papers with instant explanations for every elimination trap.',
    ],
    keywords: ['UPSC CSE preparation', 'UPSC AI tutor', 'IAS exam preparation', 'civil services exam India'],
  },
  {
    slug: 'ssc-cgl',
    name: 'SSC CGL',
    fullName: 'SSC Combined Graduate Level Examination',
    category: 'Civil Services',
    conductedBy: 'Staff Selection Commission (SSC)',
    officialSite: 'https://ssc.gov.in/',
    about: 'SSC CGL recruits graduates into Group B (Gazetted & Non-Gazetted) and Group C executive officer positions across Central Ministries, Departments, and constitutional bodies (such as Assistant Section Officer, Income Tax Inspector, GST Inspector, ED Assistant, CBI Sub-Inspector, and Auditor).',
    structure: 'Two-tier Computer Based Examination (Tier 1 Screening + Tier 2 Merit Ranking with Data Entry Speed Test).',
    mode: 'Computer Based Test (CBT Online)',
    frequency: 'Once a year (Annual)',
    totalMarks: 'Tier 1: 200 Marks (Qualifying) | Tier 2: 390 Marks (Merit)',
    duration: 'Tier 1: 60 Minutes | Tier 2: 2 Hours 15 Minutes (Session 1)',
    markingScheme: 'Tier 1: +2 for correct, -0.50 for wrong. Tier 2: +3 for correct, -1 for wrong.',
    eligibility: {
      qualification: 'Bachelor’s Degree in any discipline from a recognized University.',
      ageLimit: '18 to 30/32 years (depending on the specific post, with OBC/SC/ST relaxations).',
      attemptsLimit: 'No attempt limit within the prescribed age bracket.',
      languageMedium: 'Bilingual (English and Hindi).',
    },
    stages: [
      {
        name: 'Tier 1 (Screening Examination)',
        type: 'CBT Objective MCQ',
        duration: '60 Minutes',
        totalMarks: '200 Marks',
        markingScheme: '+2 correct / -0.50 incorrect',
        sections: [
          { name: 'General Intelligence & Reasoning', questions: '25 Qs', marks: '50 Marks' },
          { name: 'General Awareness', questions: '25 Qs', marks: '50 Marks' },
          { name: 'Quantitative Aptitude', questions: '25 Qs', marks: '50 Marks' },
          { name: 'English Comprehension', questions: '25 Qs', marks: '50 Marks' },
        ],
      },
      {
        name: 'Tier 2 (Merit Ranking & Computer/Typing Test)',
        type: 'CBT (Sectional Timing)',
        duration: '135 Minutes (Session 1) + 15 Minutes (DEST)',
        totalMarks: '390 Marks (Paper 1 Merit)',
        markingScheme: '+3 correct / -1 incorrect',
        sections: [
          { name: 'Section I: Math (30 Qs) + Reasoning (30 Qs)', questions: '60 Qs', marks: '180 Marks', timing: '60 Minutes' },
          { name: 'Section II: English (45 Qs) + Gen Awareness (25 Qs)', questions: '70 Qs', marks: '210 Marks', timing: '60 Minutes' },
          { name: 'Section III: Computer Knowledge Module (Qualifying)', questions: '20 Qs', marks: '60 Marks', timing: '15 Minutes' },
          { name: 'Data Entry Speed Test (DEST) — 2000 key depressions', questions: 'Typing Test', marks: 'Qualifying', timing: '15 Minutes' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Quantitative Aptitude',
        highWeightageTopics: ['Arithmetic (Percentage, Profit & Loss, SI/CI, Ratio)', 'Algebra & Polynomials', 'Geometry & Mensuration (2D & 3D)', 'Trigonometry & Heights/Distances', 'Data Interpretation'],
        chapters: [
          { unit: 'Arithmetic Maths', topics: ['Number Systems & Computation of Whole Numbers', 'Percentages, Ratio and Proportion', 'Square Roots, Averages, Interest (Simple and Compound)', 'Profit and Loss, Discount, Partnership Business', 'Mixture and Alligation, Time and Distance, Time and Work'] },
          { unit: 'Advanced Maths', topics: ['Basic Algebraic Identities & Elementary Surds, Graphs of Linear Equations', 'Triangle and its Centers, Congruence and Similarity', 'Circle and its Chords, Tangents, Angles Subtended by Chords', 'Right Prism, Right Circular Cone, Right Circular Cylinder, Sphere, Hemispheres, Rectangular Parallelepiped, Regular Right Pyramid', 'Trigonometric Ratios, Degree and Radian Measures, Standard Identities, Heights and Distances', 'Histogram, Frequency Polygon, Bar-Diagram, Pie-Chart'] },
        ],
      },
      {
        subject: 'Reasoning & General Intelligence',
        highWeightageTopics: ['Coding-Decoding & Analogy', 'Syllogism & Venn Diagrams', 'Blood Relations & Direction Sense', 'Non-Verbal (Paper Folding, Mirror Images, Embedded figures)', 'Critical Reasoning & Statements-Assumptions'],
        chapters: [
          { unit: 'Verbal Reasoning', topics: ['Semantic Analogy, Symbolic/Number Analogy, Figural Analogy', 'Semantic Classification, Symbolic/Number Classification, Figural Classification', 'Semantic Series, Number Series, Figural Series, Problem Solving', 'Word Building, Coding & Decoding, Numerical Operations, Symbolic Operations', 'Trends, Space Orientation, Space Visualization, Venn Diagrams', 'Drawing Inferences, Punched Hole/Pattern-Folding & Unfolding', 'Critical Thinking, Emotional Intelligence, Social Intelligence'] },
        ],
      },
      {
        subject: 'English Language & Comprehension',
        highWeightageTopics: ['Reading Comprehension & Cloze Test', 'Error Spotting & Sentence Improvement', 'Active/Passive Voice & Direct/Indirect Speech', 'Idioms, Phrases & One-word Substitutions', 'Synonyms & Antonyms'],
        chapters: [
          { unit: 'Grammar & Vocabulary', topics: ['Phrasal Verbs & Idioms', 'Active & Passive Voice Transformations', 'Direct & Indirect Speech Conversion', 'Sentence Correction & Para Jumbles', 'Vocabulary (Synonyms, Antonyms, Spellings, One Word Substitutions)', 'Reading Comprehension Passages & Cloze Tests'] },
        ],
      },
      {
        subject: 'General Awareness & Computer',
        highWeightageTopics: ['Indian Polity (Articles, Amendments, Judiciary)', 'Modern History & Ancient Art/Culture', 'Physical & Indian Geography', 'General Science (Biology, Chemistry, Physics)', 'Current Affairs & Computer Fundamentals'],
        chapters: [
          { unit: 'Static GK & Science', topics: ['Indian History & Culture', 'Geography (Physical, Indian, World)', 'Economic Scene & Indian Economy', 'General Policy & Scientific Research', 'Physics, Chemistry, Biology at 10th standard level'] },
          { unit: 'Computer Basics', topics: ['Computer Basics (Organization, CPU, Memory, I/O devices)', 'Software (Windows OS, MS Word, MS Excel, MS PowerPoint)', 'Internet & Emails, Networking Devices & Protocols', 'Cyber Security Basics (Viruses, Malware, Firewalls)'] },
        ],
      },
    ],
    preparationTips: [
      'Master Short-Cut Formulas: Arithmetic speed and calculation hacks in Quantitative Aptitude save 20+ minutes in Tier 2.',
      'Computer & Typing Regularity: Do not ignore the qualifying Computer module and 27 WPM typing test.',
      'Timed Sectional Sets: Build accuracy within strict 60-minute windows for Math + Reasoning.',
    ],
    howSadhyaHelps: [
      'Learn lightning-fast alternative solving methods for complex Quant and Reasoning questions.',
      'Engage with daily adaptive flashcard drills on high-frequency SSC vocabulary, idioms, and static GK facts.',
      'Practice full-length Tier 1 and Tier 2 simulations with authentic sectional switches and instant error breakdowns.',
    ],
    keywords: ['SSC CGL preparation', 'SSC CGL AI tutor', 'SSC CGL Quant Reasoning', 'government exam preparation India'],
  },
  {
    slug: 'ssc-chsl',
    name: 'SSC CHSL',
    fullName: 'SSC Combined Higher Secondary Level (10+2)',
    category: 'Civil Services',
    conductedBy: 'Staff Selection Commission (SSC)',
    officialSite: 'https://ssc.gov.in/',
    about: 'SSC CHSL is India’s major 10+2 recruitment exam for Lower Division Clerks (LDC), Junior Secretariat Assistants (JSA), and Data Entry Operators (DEO) across Central Government ministries and subordinate departments.',
    structure: 'Tier 1 (Objective Computer Based Screening) + Tier 2 (Merit CBT & Skill/Typing Test).',
    mode: 'Computer Based Test (CBT)',
    frequency: 'Once a year (Annual)',
    totalMarks: 'Tier 1: 200 Marks | Tier 2: 360 Marks (Merit)',
    duration: 'Tier 1: 60 Minutes | Tier 2: 2 Hours 15 Minutes',
    markingScheme: 'Tier 1: +2 for correct, -0.50 for incorrect. Tier 2: +3 for correct, -1 for incorrect.',
    eligibility: {
      qualification: 'Class 12 pass from a recognized board (for DEO in CAG office, Class 12 with Science & Math).',
      ageLimit: '18 to 27 years (with OBC +3 yrs, SC/ST +5 yrs relaxations).',
      attemptsLimit: 'No limit within eligible age.',
      languageMedium: 'Bilingual (English & Hindi) + regional languages.',
    },
    stages: [
      {
        name: 'Tier 1 (Objective Screening)',
        type: 'CBT MCQ',
        duration: '60 Minutes',
        totalMarks: '200 Marks',
        markingScheme: '+2 correct / -0.50 incorrect',
        sections: [
          { name: 'English Language (Basic Knowledge)', questions: '25 Qs', marks: '50 Marks' },
          { name: 'General Intelligence', questions: '25 Qs', marks: '50 Marks' },
          { name: 'Quantitative Aptitude (Basic Arithmetic Skills)', questions: '25 Qs', marks: '50 Marks' },
          { name: 'General Awareness', questions: '25 Qs', marks: '50 Marks' },
        ],
      },
      {
        name: 'Tier 2 (Written CBT & Skill Test)',
        type: 'CBT Objective + Typing/Skill Test',
        duration: '135 Minutes + Skill Test',
        totalMarks: '360 Marks',
        markingScheme: '+3 correct / -1 incorrect',
        sections: [
          { name: 'Section I: Math (30 Qs) + Reasoning (30 Qs)', questions: '60 Qs', marks: '180 Marks', timing: '60 Minutes' },
          { name: 'Section II: English (40 Qs) + GA (20 Qs)', questions: '60 Qs', marks: '180 Marks', timing: '60 Minutes' },
          { name: 'Section III: Computer Knowledge (15 Qs)', questions: '15 Qs', marks: '45 Marks (Qualifying)', timing: '15 Minutes' },
          { name: 'Skill Test / Typing Test for DEO / LDC', questions: 'Practical Typing', marks: 'Qualifying', timing: '15 Minutes' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Quantitative Aptitude',
        highWeightageTopics: ['Number System & Simplification', 'Percentage, Ratio & Proportions', 'Simple & Compound Interest', 'Mensuration 2D & 3D', 'Algebra & Linear Equations'],
        chapters: [
          { unit: 'Number System & Arithmetic', topics: ['Computation of Whole Numbers, Decimals and Fractions', 'Percentages, Ratio and Proportion, Square Roots', 'Averages, Interest (Simple and Compound), Profit & Loss', 'Discount, Partnership Business, Mixture & Alligation', 'Time and Distance, Time & Work'] },
          { unit: 'Algebra, Geometry & Mensuration', topics: ['Basic Algebraic Identities, Surds', 'Elementary Geometric Figures & Triangles', 'Circles, Chords, Tangents', 'Right Prism, Cylinder, Cone, Sphere', 'Standard Trigonometric Identities & Heights/Distances'] },
        ],
      },
      {
        subject: 'General Intelligence & Reasoning',
        highWeightageTopics: ['Analogy & Classification', 'Series Completion & Missing Terms', 'Coding-Decoding', 'Venn Diagrams & Syllogisms', 'Paper Folding & Mirror Images'],
        chapters: [
          { unit: 'Verbal & Non-Verbal Logic', topics: ['Semantic Analogy, Symbolic/Number Analogy', 'Figure Analogy, Classification', 'Number Series, Word Formation', 'Blood Relations, Direction Sense', 'Punched Hole, Pattern Completion, Embedded Figures'] },
        ],
      },
      {
        subject: 'English & General Awareness',
        highWeightageTopics: ['Spotting the Error & Fill in the Blanks', 'Cloze Passage & Comprehension', 'Idioms, Phrases & One Word Substitutions', 'Indian Constitution, History & Geography', 'Basic Science & Current Affairs'],
        chapters: [
          { unit: 'English', topics: ['Grammar Rules, Tenses, Prepositions', 'Active/Passive Voice, Narration', 'Vocabulary, Synonyms, Antonyms', 'Sentence Rearrangement & Comprehension'] },
          { unit: 'General Awareness & Computer', topics: ['History, Culture, Geography, Economic Scene', 'General Policy & Scientific Research', 'Current Events of National & International Importance', 'Computer Hardware, Software, MS Office & Internet'] },
        ],
      },
    ],
    preparationTips: [
      'Focus on Speed Drills: Tier 1 gives only 60 seconds per question — speed with accuracy is essential.',
      'Daily 20-minute Typing Practice: Ensure you comfortably achieve 35 WPM English or 30 WPM Hindi typing before Tier 2.',
    ],
    howSadhyaHelps: [
      'Solve 10+2 level quantitative and reasoning problems with step-by-step visual working.',
      'Build long-term retention of English grammar rules and vocabulary through smart adaptive spaced repetition.',
    ],
    keywords: ['SSC CHSL preparation', 'SSC CHSL AI tutor', 'SSC CHSL Quant English Reasoning'],
  },
  {
    slug: 'bpsc',
    name: 'BPSC',
    fullName: 'Bihar Public Service Commission — Combined Competitive Exam (CCE)',
    category: 'Civil Services',
    conductedBy: 'Bihar Public Service Commission (BPSC)',
    officialSite: 'https://bpsc.bih.nic.in/',
    about: 'BPSC CCE recruits into Bihar State Administrative Services, including Sub-Divisional Magistrate (SDM), Deputy Superintendent of Police (DSP), Revenue Officer, Block Development Officer (BDO), and District Officers.',
    structure: '3-Tier Structure: Prelims (Single 150-mark objective paper with negative marking) + Mains (Descriptive Written Papers + Essay) + Interview.',
    mode: 'Offline Pen & Paper (OMR for Prelims, Descriptive for Mains)',
    frequency: 'Once a year (Annual)',
    totalMarks: 'Mains: 900 Marks + Interview: 120 Marks = 1020 Marks',
    duration: 'Prelims: 2 Hours | Mains: 3 Hours per paper',
    markingScheme: 'Prelims: +1 for correct answer, -0.33 for wrong answer. Mains: Analytical descriptive scoring.',
    eligibility: {
      qualification: 'Graduate degree in any discipline from a recognized University.',
      ageLimit: '20/21/22 to 37 years for Male (General), 40 years for Female/OBC, 42 years for SC/ST.',
      attemptsLimit: 'No attempt limits as long as candidate is within the age limit.',
      languageMedium: 'Hindi or English for Mains examination.',
    },
    stages: [
      {
        name: 'Preliminary Examination (Screening)',
        type: 'Objective OMR MCQ',
        duration: '120 Minutes',
        totalMarks: '150 Marks',
        markingScheme: '+1 correct / -0.33 incorrect (1/3rd negative marking)',
        sections: [
          { name: 'General Studies (General Science, History, Bihar Specific, Polity, Geo, Quant)', questions: '150 Qs', marks: '150 Marks' },
        ],
      },
      {
        name: 'Mains Examination (Written)',
        type: 'Descriptive Analytical',
        duration: '3 Hours per paper',
        totalMarks: '900 Marks (Merit Counted)',
        markingScheme: 'Descriptive evaluation',
        sections: [
          { name: 'General Hindi (Qualifying, 30% pass mark)', questions: 'Subjective', marks: '100 Marks (Qualifying)' },
          { name: 'General Studies I (Modern History, Indian Culture, Statistical Analysis)', questions: 'Subjective', marks: '300 Marks' },
          { name: 'General Studies II (Indian Polity, Economy, Geography, Science & Tech)', questions: 'Subjective', marks: '300 Marks' },
          { name: 'Essay Paper (Three essays: Section 1, Section 2, Section 3 Bihar specific)', questions: '3 Essays', marks: '300 Marks' },
          { name: 'Optional Subject (Qualifying MCQ Paper)', questions: '100 MCQs', marks: '100 Marks (Qualifying)' },
        ],
      },
      {
        name: 'Personality Test (Interview)',
        type: 'Interview Board at BPSC Office, Patna',
        duration: '25–35 Minutes',
        totalMarks: '120 Marks',
        markingScheme: 'Overall assessment of personality, presence of mind, and Bihar administrative awareness',
        sections: [
          { name: 'Board Interview', questions: 'Panel discussion', marks: '120 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'General Studies I (Mains & Prelims)',
        highWeightageTopics: ['Modern History of India & Bihar (1857 Revolt in Bihar, Champaran, Quit India)', 'Bihar Art & Culture (Mauryan Art, Patna Qalam, Madhubani Painting)', 'Statistical Analysis, Graphs and Diagrams (72 marks in GS 1)', 'National & International Current Events'],
        chapters: [
          { unit: 'History & Culture', topics: ['Modern Indian History with special reference to Bihar from 1857 to 1947', 'Role of Bihar in Indian National Movement (Kunwar Singh, Birsa Munda, Jayaprakash Narayan)', 'Santhal Uprising and Munda Rebellion', 'Mauryan Art, Pal Art and Patna Kalam Paintings', 'Western education development in Bihar'] },
          { unit: 'Statistical Analysis', topics: ['Statistical diagrams, pie charts, bar charts, histograms', 'Data interpretation and numerical analysis', 'Drawing conclusions from tabular and graphical data'] },
        ],
      },
      {
        subject: 'General Studies II (Polity, Economy, Geo & Sci-Tech)',
        highWeightageTopics: ['Indian & Bihar Polity (Governor’s role, Judicial activism, Caste politics in Bihar)', 'Economic Planning, Agriculture & Industrial Development in Bihar', 'Role of Science & Technology in resolving Bihar issues (Floods, Droughts, Health, Agriculture)'],
        chapters: [
          { unit: 'Indian & Bihar Polity', topics: ['Indian Political System with special focus on Bihar governance', 'Constitutional Framework, Federal Relations, Role of Governor', 'Panchayati Raj in Bihar and 73rd/74th Constitutional Amendments', 'Election dynamics, caste factors and coalition politics in Bihar'] },
          { unit: 'Economy & Geography of Bihar', topics: ['Indian Economy & Economic Planning in Bihar', 'Agricultural roadmap of Bihar, irrigation, agro-based industries', 'Poverty, migration, unemployment, and industrialization in Bihar', 'Physical, Economic and Social Geography of India and Bihar'] },
          { unit: 'Science & Technology in Development', topics: ['Application of Science and Technology in development of India and Bihar', 'Disaster management (Flood and drought mitigation in Bihar)', 'Renewable energy, space technology, AI, agriculture biotech'] },
        ],
      },
      {
        subject: 'Essay Paper (300 Marks)',
        highWeightageTopics: ['Philosophical & Socio-Cultural Themes', 'National Policy & Economic Themes', 'Bihar Specific Folk Sayings & Local Proverbs (Bhojpuri, Maithili, Magahi, Angika)'],
        chapters: [
          { unit: 'Essay Structure', topics: ['Section 1: Philosophical, Socio-Economic, Governance themes', 'Section 2: Science, Technology, Education, Environment, Women issues', 'Section 3: Bihar-specific proverbs, folk wisdom, culture and regional proverbs in Devanagari script'] },
        ],
      },
    ],
    preparationTips: [
      'Master Bihar-Specific History & Schemes: Dedicated coverage of Saat Nischay Part 2, Bihar Budget, and Economic Survey.',
      'Practice Statistical Graphs: Scoring full 72/72 in GS 1 Statistics paper is the decisive differentiator for top ranks.',
    ],
    howSadhyaHelps: [
      'Access extensive Bihar-specific static and current affairs modules integrated directly into revision notebooks.',
      'Receive instant evaluation on BPSC descriptive answers and Bihar cultural essay topics.',
    ],
    keywords: ['BPSC preparation', 'BPSC AI tutor', 'Bihar Public Service Commission exam', 'BPSC CCE'],
  },
  {
    slug: 'bihar-tre',
    name: 'Bihar TRE',
    fullName: 'Bihar Teacher Recruitment Examination (TRE 3.0 / 4.0)',
    category: 'Teaching',
    conductedBy: 'Bihar Public Service Commission (BPSC)',
    officialSite: 'https://bpsc.bih.nic.in/',
    about: 'Bihar TRE conducts mass recruitment of School Teachers across Bihar Government schools for Primary (Class 1–5), Middle School (Class 6–8), Secondary (Class 9–10), and Higher Secondary (Class 11–12) teaching posts.',
    structure: 'Single-stage 150-question objective examination covering Language Qualifying, General Studies, and Chosen Subject Domain.',
    mode: 'Offline (OMR Based)',
    frequency: 'Annual / Periodic (Cycles: TRE 1.0, 2.0, 3.0, 4.0)',
    totalMarks: '150 Marks (Part I Qualifying: 30 Qs, Part II GS: 40 Qs, Part III Subject: 80 Qs)',
    duration: '2 Hours 30 Minutes (150 minutes)',
    markingScheme: '+1 mark per correct answer. No negative marking.',
    eligibility: {
      qualification: 'CTET/STET Paper 1 or 2 qualified + D.El.Ed / B.Ed / Post Graduation (depending on school level: Primary, Middle, Secondary, Higher Secondary).',
      ageLimit: '18/21 to 37 years for Males, 40 years for Females/OBC, 42 years for SC/ST.',
      attemptsLimit: 'Up to 5 attempts as per latest Bihar state government rules.',
      languageMedium: 'Bilingual (Hindi and English).',
    },
    stages: [
      {
        name: 'Single Stage Written Examination',
        type: 'Objective OMR MCQ',
        duration: '150 Minutes',
        totalMarks: '150 Marks',
        markingScheme: '+1 per correct answer, 0 negative marks',
        sections: [
          { name: 'Part I: Language (English mandatory + Hindi/Urdu/Bengali, qualifying 30%)', questions: '30 Qs', marks: '30 Marks (Qualifying)' },
          { name: 'Part II: General Studies (Elementary Math, Reasoning, GS, Science, Social, Geo, Bihar)', questions: '40 Qs', marks: '40 Marks' },
          { name: 'Part III: Subject Specific Paper (Matched to chosen teaching discipline)', questions: '80 Qs', marks: '80 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'General Studies (Part II - 40 Marks)',
        highWeightageTopics: ['Elementary Mathematics & Reasoning', 'General Science & Environment', 'National Freedom Movement with Bihar’s Contribution', 'Geography of India and Bihar'],
        chapters: [
          { unit: 'GS Syllabus', topics: ['Basic Arithmetic, Fractions, Percentage, Profit & Loss, Ratio', 'Basic Reasoning, Analogy, Series, Relations', 'General Science (Physics, Chemistry, Biology of Class 6–10 level)', 'Indian National Movement (1857 to 1947, Champaran, Quit India)', 'Geography of India and Bihar (Rivers, Soils, Minerals, Climate)'] },
        ],
      },
      {
        subject: 'Subject Domain (Part III - 80 Marks)',
        highWeightageTopics: ['SCERT & NCERT Textbook Syllabus for the corresponding Class level (Classes 1–5, 6–8, 9–10, 11–12)'],
        chapters: [
          { unit: 'Primary (Class 1-5)', topics: ['Mathematics, Environmental Studies, Language, General Science'] },
          { unit: 'Middle & Secondary (Class 6-10)', topics: ['Science (Physics/Chem/Bio), Mathematics, Social Science (History/Geo/Polity/Econ), Hindi, English, Sanskrit, Urdu'] },
          { unit: 'Higher Secondary (Class 11-12)', topics: ['Physics, Chemistry, Botany, Zoology, Mathematics, History, Political Science, Geography, Economics, Accountancy, Business Studies, Computer Science'] },
        ],
      },
    ],
    preparationTips: [
      'Master Bihar SCERT & NCERT Books: Direct questions are sourced word-for-word from Bihar board and NCERT school textbooks.',
      'Language Qualifying: Score minimum 9 out of 30 in Part 1 to prevent whole paper disqualification.',
    ],
    howSadhyaHelps: [
      'Access chapter-by-chapter question banks mapping precisely to Bihar SCERT and NCERT textbooks.',
      'Generate targeted subject mocks matching your exact TRE discipline (Primary, Middle, or Higher Secondary).',
    ],
    keywords: ['Bihar TRE preparation', 'Bihar Teacher Recruitment Exam AI tutor', 'BPSC TRE syllabus'],
  },
  {
    slug: 'ctet-stet',
    name: 'CTET & STET',
    fullName: 'Central & State Teacher Eligibility Tests',
    category: 'Teaching',
    conductedBy: 'CTET: CBSE | STET: State Education Boards',
    officialSite: 'https://ctet.nic.in/',
    about: 'CTET & STET are mandatory qualifying certifications for appointment as teachers in Central (KVS, NVS, Army Schools) and State Government schools across India (Paper 1 for Classes 1–5, Paper 2 for Classes 6–8).',
    structure: 'Paper 1 (Primary) and Paper 2 (Upper Primary), each featuring 150 objective MCQs with no negative marking.',
    mode: 'Pen & Paper (OMR) / Computer Based (CBT)',
    frequency: 'Twice a year (CTET July & Dec cycles)',
    totalMarks: '150 Marks per paper (Qualifying benchmark: 60% for General / 55% for Reserved)',
    duration: '2 Hours 30 Minutes (150 minutes)',
    markingScheme: '+1 for correct answer. No negative marking.',
    eligibility: {
      qualification: 'Paper 1: Class 12 with 50% + 2-year D.El.Ed / B.El.Ed. Paper 2: Graduation with 50% + B.Ed or D.El.Ed.',
      ageLimit: 'No upper age limit for CTET/STET.',
      attemptsLimit: 'Unlimited attempts until qualifying score is achieved. Certificate validity is for Lifetime.',
      languageMedium: '20 Regional and National Languages.',
    },
    stages: [
      {
        name: 'Paper I (For Teaching Classes I to V)',
        type: 'Objective OMR MCQ',
        duration: '150 Minutes',
        totalMarks: '150 Marks',
        markingScheme: '+1 correct / 0 negative',
        sections: [
          { name: 'Child Development and Pedagogy', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Language I (Compulsory)', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Language II (Compulsory)', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Mathematics', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Environmental Studies (EVS)', questions: '30 Qs', marks: '30 Marks' },
        ],
      },
      {
        name: 'Paper II (For Teaching Classes VI to VIII)',
        type: 'Objective OMR MCQ',
        duration: '150 Minutes',
        totalMarks: '150 Marks',
        markingScheme: '+1 correct / 0 negative',
        sections: [
          { name: 'Child Development and Pedagogy', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Language I (Compulsory)', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Language II (Compulsory)', questions: '30 Qs', marks: '30 Marks' },
          { name: 'Mathematics and Science OR Social Studies/Social Science', questions: '60 Qs', marks: '60 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Child Development & Pedagogy (CDP)',
        highWeightageTopics: ['Piaget, Kohlberg and Vygotsky Theories', 'Concept of Inclusive Education & Children with Special Needs', 'Learning Theories, Motivation & Emotion', 'Constructivist Learning Approaches'],
        chapters: [
          { unit: 'Child Development', topics: ['Concept of development and its relationship with learning', 'Principles of development of children, Influence of Heredity & Environment', 'Socialization processes: Social world & children (Teachers, Parents, Peers)', 'Piaget, Kohlberg and Vygotsky: Constructs and critical perspectives', 'Concepts of child-centered and progressive education', 'Critical perspective of the construct of Intelligence, Multi-Dimensional Intelligence'] },
          { unit: 'Inclusive Education', topics: ['Addressing learners from diverse backgrounds including disadvantaged and deprived', 'Addressing the needs of children with learning difficulties, ‘impairment’', 'Addressing the Talented, Creative, Specially abled Learners'] },
          { unit: 'Learning & Pedagogy', topics: ['How children think and learn; how and why children ‘fail’ to achieve success', 'Basic processes of teaching and learning; children’s strategies of learning', 'Child as a problem solver and a ‘scientific investigator’', 'Alternative conceptions of learning in children, understanding children’s ‘errors’', 'Cognition & Emotions, Motivation and Learning'] },
        ],
      },
      {
        subject: 'Environmental Studies & Mathematics (Paper 1)',
        highWeightageTopics: ['Family, Friends, Food, Shelter, Water, Travel (EVS Themes)', 'Geometry, Shapes, Numbers, Measurement & Data Handling'],
        chapters: [
          { unit: 'EVS Content & Pedagogy', topics: ['Themes: Family and Friends, Food, Shelter, Water, Travel, Things We Make and Do', 'Concept and scope of EVS, Significance of EVS, Integrated EVS', 'Environmental Studies & Environmental Education, Learning Principles', 'Scope & relation to Science & Social Science, Activities, Experiments, Discussion'] },
          { unit: 'Maths Content & Pedagogy', topics: ['Geometry, Shapes & Spatial Understanding, Solids around Us', 'Numbers, Addition and Subtraction, Multiplication, Division', 'Measurement, Weight, Time, Volume, Data Handling, Patterns, Money', 'Nature of Mathematics/Logical thinking, Place of Mathematics in Curriculum', 'Language of Mathematics, Community Mathematics, Evaluation, Diagnostic & Remedial Teaching'] },
        ],
      },
    ],
    preparationTips: [
      'Focus Deeply on Pedagogy: 50% of marks in every subject section are derived from subject-specific pedagogical principles.',
      'NCERT Class 1–8 Books: Thoroughly review Class 3–5 EVS books (Looking Around) for direct fact-based questions.',
    ],
    howSadhyaHelps: [
      'Master Piaget, Vygotsky, and Kohlberg theories through clear, real-world classroom case explanations.',
      'Practice full-length Paper 1 and Paper 2 adaptive tests with lifetime validity pass-rate analytics.',
    ],
    keywords: ['CTET preparation', 'STET preparation', 'CTET AI tutor', 'teacher eligibility test India'],
  },
  {
    slug: 'cuet',
    name: 'CUET',
    fullName: 'Common University Entrance Test (UG)',
    category: 'University Admission',
    conductedBy: 'National Testing Agency (NTA)',
    officialSite: 'https://exams.nta.ac.in/CUET-UG/',
    about: 'CUET UG is the single nationwide gateway for undergraduate admissions into Delhi University (DU), BHU, JNU, Jamia Millia, Allahabad University, and 250+ Central, State, and Deemed universities across India.',
    structure: 'Modular Hybrid examination (OMR + CBT) with Section 1 (Languages), Section 2 (Domain Subjects), and Section 3 (General Test).',
    mode: 'Hybrid (Pen & Paper for high-volume subjects + CBT for others)',
    frequency: 'Once a year (Annual in May)',
    totalMarks: 'Varies by subject combination (200 Marks per domain/language paper)',
    duration: '45 Minutes per domain subject (60 Minutes for Math, Physics, Chem, Econ, Gen Test)',
    markingScheme: '+5 for correct answer, -1 for incorrect answer, 0 for unattempted.',
    eligibility: {
      qualification: 'Class 12 passed or appearing from any recognized educational board.',
      ageLimit: 'No age limit specified by NTA (individual university criteria apply).',
      attemptsLimit: 'No attempt limit.',
      languageMedium: '13 Languages (English, Hindi, and regional languages).',
    },
    stages: [
      {
        name: 'CUET UG Examination Structure',
        type: 'Objective MCQ (40 out of 50 to attempt)',
        duration: '45 to 60 Minutes per test',
        totalMarks: '200 Marks per Subject Paper (250 Marks for General Test)',
        markingScheme: '+5 correct / -1 incorrect',
        sections: [
          { name: 'Section IA & IB: Languages (Reading Comprehension, Vocab, Literary Aptitude)', questions: '50 Qs (40 to attempt)', marks: '200 Marks', timing: '45 Mins' },
          { name: 'Section II: Domain Specific Subjects (NCERT Class 12 Syllabus Only)', questions: '50 Qs (40 to attempt)', marks: '200 Marks', timing: '45–60 Mins' },
          { name: 'Section III: General Test (GK, Current Affairs, Quant, Logical & Analytical Reasoning)', questions: '60 Qs (50 to attempt)', marks: '250 Marks', timing: '60 Mins' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Section II: Domain Subjects (Class 12 NCERT)',
        highWeightageTopics: ['Physics, Chemistry, Mathematics, Biology, Accountancy, Economics, Business Studies, History, Political Science, Geography, Psychology, Sociology, Computer Science'],
        chapters: [
          { unit: 'Pure Class 12 Syllabus', topics: ['Syllabus is strictly mapped to Class 12 NCERT textbooks without deletion', 'No Class 11 questions asked in Section II domain subjects'] },
        ],
      },
      {
        subject: 'Section III: General Test',
        highWeightageTopics: ['General Knowledge & Current Affairs', 'General Mental Ability & Numerical Ability', 'Quantitative Reasoning (Arithmetic up to Grade 8)', 'Logical and Analytical Reasoning'],
        chapters: [
          { unit: 'General Test Units', topics: ['Basic mathematical concepts: Arithmetic, Algebra, Geometry, Mensuration, Statistics', 'Logical reasoning: Analogies, Syllogisms, Number Series, Coding-Decoding', 'Current Affairs: National & International events, Awards, Sports, Books'] },
        ],
      },
    ],
    preparationTips: [
      'Align Closely with Class 12 Board Prep: CUET domain questions test the exact Class 12 NCERT curriculum in objective depth.',
      'Language Comprehension Speed: Practice reading speed on diverse passages (factual, literary, narrative) to answer 40 Qs in 45 minutes.',
    ],
    howSadhyaHelps: [
      'Bridge the gap between board-level subjective answers and CUET-level multiple-choice trick questions.',
      'Customize study pathways for high-competition target colleges like SRCC, St. Stephen’s, Hindu College, and BHU.',
    ],
    keywords: ['CUET preparation', 'CUET AI tutor', 'common university entrance test India'],
  },
  {
    slug: 'ibps-po',
    name: 'IBPS PO',
    fullName: 'IBPS Probationary Officer / Management Trainee',
    category: 'Banking & Finance',
    conductedBy: 'Institute of Banking Personnel Selection (IBPS)',
    officialSite: 'https://ibps.in/',
    about: 'IBPS PO recruits Probationary Officers / Management Trainees across 11 participating Public Sector Banks in India (including PNB, Bank of Baroda, Canara Bank, Union Bank, Bank of India, and Central Bank).',
    structure: '3 Stages: Prelims (CBT with sectional timing) + Mains (Objective CBT + Descriptive English) + Interview.',
    mode: 'Computer Based Test (CBT Online)',
    frequency: 'Once a year (Annual in Oct/Nov)',
    totalMarks: 'Prelims: 100 Marks | Mains: 225 Marks (200 Obj + 25 Desc) | Interview: 100 Marks',
    duration: 'Prelims: 60 Minutes (20 mins/section) | Mains: 3 Hours 30 Minutes',
    markingScheme: '+1 for correct, -0.25 (1/4th) for incorrect answer across both Prelims and Mains.',
    eligibility: {
      qualification: 'Graduation in any discipline from a recognized University.',
      ageLimit: '20 to 30 years (with standard OBC/SC/ST/PwD age relaxations).',
      attemptsLimit: 'No attempt restriction within the age limit.',
      languageMedium: 'English & Hindi (except English Language section).',
    },
    stages: [
      {
        name: 'Preliminary Examination (Speed Screening)',
        type: 'CBT (Strict 20-Minute Sectional Timer)',
        duration: '60 Minutes',
        totalMarks: '100 Marks',
        markingScheme: '+1 correct / -0.25 incorrect',
        sections: [
          { name: 'English Language', questions: '30 Qs', marks: '30 Marks', timing: '20 Minutes' },
          { name: 'Quantitative Aptitude', questions: '35 Qs', marks: '35 Marks', timing: '20 Minutes' },
          { name: 'Reasoning Ability', questions: '35 Qs', marks: '35 Marks', timing: '20 Minutes' },
        ],
      },
      {
        name: 'Mains Examination (Objective + Descriptive)',
        type: 'CBT Online + Online Typing on Keyboard',
        duration: '210 Minutes',
        totalMarks: '225 Marks',
        markingScheme: '+1 or +2 per question, -0.25 negative marking',
        sections: [
          { name: 'Reasoning & Computer Aptitude', questions: '45 Qs', marks: '60 Marks', timing: '60 Minutes' },
          { name: 'General / Economy / Banking Awareness', questions: '40 Qs', marks: '40 Marks', timing: '35 Minutes' },
          { name: 'English Language', questions: '35 Qs', marks: '40 Marks', timing: '40 Minutes' },
          { name: 'Data Analysis & Interpretation', questions: '35 Qs', marks: '60 Marks', timing: '45 Minutes' },
          { name: 'Descriptive English (Letter & Essay Typing)', questions: '2 Tasks', marks: '25 Marks', timing: '30 Minutes' },
        ],
      },
      {
        name: 'Common Interview',
        type: 'Personal Interview at Participating Bank nodal venues',
        duration: '15–25 Minutes',
        totalMarks: '100 Marks (80:20 weightage ratio with Mains score)',
        markingScheme: 'Qualifying cutoff 40% (35% for SC/ST/OBC/PwD)',
        sections: [
          { name: 'Banking Knowledge, HR & Personality Interaction', questions: 'Panel Interview', marks: '100 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Quantitative Aptitude & Data Interpretation',
        highWeightageTopics: ['Data Interpretation (Caselets, Tabular, Radar, Bar/Line)', 'Data Sufficiency & Quantity Comparison', 'Quadratic Equations & Approximation', 'Arithmetic (Time & Work, SI/CI, Profit-Loss, Mixtures)'],
        chapters: [
          { unit: 'Quant Topics', topics: ['Missing & Wrong Number Series', 'Simplification & Approximation', 'Data Interpretation (Missing DI, Mixed Graphs, Caselet DI)', 'Time & Work, Pipes & Cisterns, Speed Distance & Time', 'Partnership, Percentage, Profit & Loss, Simple & Compound Interest', 'Probability, Permutations & Combinations, Mensuration'] },
        ],
      },
      {
        subject: 'Reasoning Ability & Computer Aptitude',
        highWeightageTopics: ['High-Level Puzzles & Seating Arrangements (Circular, Linear, Floor-Flat, Box, Year-Based)', 'Machine Input-Output', 'Syllogism (Only a Few type)', 'Logical Reasoning (Cause-Effect, Course of Action)'],
        chapters: [
          { unit: 'Reasoning Topics', topics: ['Complex Multi-Parameter Puzzles & Seating Arrangement', 'Coded Inequalities, Direction Sense & Blood Relations', 'Machine Input-Output & Step-by-Step Logic', 'Data Sufficiency, Order and Ranking', 'Statement and Assumptions, Statement and Arguments, Inferences'] },
        ],
      },
      {
        subject: 'Banking & Financial Awareness',
        highWeightageTopics: ['RBI Monetary Policy & Rates (Repo, Reverse Repo, CRR, SLR)', 'Banking Terms (NPA, PCA, Basel III, Capital Adequacy)', 'Government Financial Schemes (PMJDY, Mudra, PMJJBY)', 'Current Financial & Economic News (Last 6 Months)'],
        chapters: [
          { unit: 'Banking Awareness', topics: ['History of Banking in India, RBI structure & functions', 'Monetary Policy Framework, Inflation Indices (CPI, WPI)', 'Financial Markets: Money Market & Capital Market instruments', 'Digital Banking, UPI, NPCI, NEFT, RTGS, IMPS, CBDC', 'Priority Sector Lending (PSL) & Financial Inclusion'] },
        ],
      },
    ],
    preparationTips: [
      'Master the 20-Minute Section Clock: Prelims tests your question elimination speed rather than attempting all 100 questions.',
      'Daily Financial Awareness: Read banking updates and monetary policy circulars daily.',
    ],
    howSadhyaHelps: [
      'Practice tough banking puzzles and high-complexity DI caselets with real-time logical guidance.',
      'Auto-evaluate your Descriptive Essay & Letter responses with AI feedback on grammar, tone, and coherence.',
    ],
    keywords: ['IBPS PO preparation', 'IBPS PO AI tutor', 'bank PO exam India', 'banking exam preparation'],
  },
  {
    slug: 'sbi-po',
    name: 'SBI PO',
    fullName: 'State Bank of India Probationary Officer Examination',
    category: 'Banking & Finance',
    conductedBy: 'State Bank of India (SBI)',
    officialSite: 'https://sbi.co.in/web/careers',
    about: 'SBI PO is the most sought-after and prestigious probationary officer examination in the Indian banking sector, recruiting future executive leadership for India’s largest Fortune 500 commercial bank.',
    structure: '3 Phases: Phase I (Prelims Speed Test) + Phase II (Mains Objective + Descriptive) + Phase III (Psychometric Test + Group Discussion / Interview).',
    mode: 'Computer Based Test (CBT Online)',
    frequency: 'Once a year (Annual)',
    totalMarks: 'Phase I: 100 Marks | Phase II: 250 Marks (200 Obj + 50 Desc) | Phase III: 50 Marks (GD 20 + Interview 30)',
    duration: 'Phase I: 60 Mins | Phase II: 3 Hours 30 Mins | Phase III: GD & Interview',
    markingScheme: '+1 for correct, -0.25 for incorrect answer in Objective tests. No sectional cutoffs in Prelims or Mains.',
    eligibility: {
      qualification: 'Graduation in any discipline from a recognized University (Final year students eligible).',
      ageLimit: '21 to 30 years (with OBC +3 yrs, SC/ST +5 yrs relaxations).',
      attemptsLimit: 'General/EWS: 4 attempts. General PwD/OBC: 7 attempts. SC/ST: No restriction.',
      languageMedium: 'English & Hindi (except English Language paper).',
    },
    stages: [
      {
        name: 'Phase I: Preliminary Examination',
        type: 'CBT with Sectional Timers (No sectional cutoff)',
        duration: '60 Minutes (20 mins/section)',
        totalMarks: '100 Marks',
        markingScheme: '+1 correct / -0.25 incorrect',
        sections: [
          { name: 'English Language', questions: '30 Qs', marks: '30 Marks', timing: '20 Minutes' },
          { name: 'Quantitative Aptitude', questions: '35 Qs', marks: '35 Marks', timing: '20 Minutes' },
          { name: 'Reasoning Ability', questions: '35 Qs', marks: '35 Marks', timing: '20 Minutes' },
        ],
      },
      {
        name: 'Phase II: Main Examination',
        type: 'Objective CBT + Keyboard Descriptive Writing',
        duration: '210 Minutes',
        totalMarks: '250 Marks',
        markingScheme: 'Negative marking of 1/4th mark per wrong answer',
        sections: [
          { name: 'Reasoning & Computer Aptitude', questions: '40 Qs', marks: '50 Marks', timing: '50 Minutes' },
          { name: 'Data Analysis & Interpretation', questions: '30 Qs', marks: '50 Marks', timing: '45 Minutes' },
          { name: 'General/Economy/Banking Awareness', questions: '50 Qs', marks: '60 Marks', timing: '45 Minutes' },
          { name: 'English Language', questions: '35 Qs', marks: '40 Marks', timing: '40 Minutes' },
          { name: 'Descriptive Paper (Letter Writing & Essay on Keyboard)', questions: '2 Questions', marks: '50 Marks', timing: '30 Minutes' },
        ],
      },
      {
        name: 'Phase III: Psychometric Test, Group Discussion & Interview',
        type: 'Psychometric Profiling + Group Exercise & Interview',
        duration: '1 Day',
        totalMarks: '50 Marks (GD 20 Marks + Interview 30 Marks)',
        markingScheme: 'Combined merit normalization in 75:25 ratio (Phase II : Phase III)',
        sections: [
          { name: 'Group Discussion & Personal Interview', questions: 'Group dynamics & panel assessment', marks: '50 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Data Analysis & Quantitative Reasoning',
        highWeightageTopics: ['Advanced Caselet & Funnel DIs', 'Probability, Permutations & Combinations', 'Data Sufficiency (3 statements)', 'Arithmetic Word Problems (Time-Work, SI-CI, Mixtures)'],
        chapters: [
          { unit: 'Data Analysis Modules', topics: ['Radar, Scatter, Histogram, Funnel & Table DI', 'Caselets & Arithmetic-based DI (Time & Work, Profit-Loss)', 'Data Sufficiency with 2 and 3 statements', 'Quadratic Equations & Quantity Comparison (Q1 vs Q2 vs Q3)'] },
        ],
      },
      {
        subject: 'Reasoning & Critical Thinking',
        highWeightageTopics: ['Multi-Variable High-Level Puzzles', 'Coded Input-Output & Coded Direction/Blood Relations', 'Critical Reasoning (Assumptions, Conclusions, Strong/Weak arguments)', 'Data Flow Diagrams & Flowcharts'],
        chapters: [
          { unit: 'Advanced Reasoning', topics: ['Floor-Flat, Year-Age, Circular, Matrix Puzzles with 3+ variables', 'Critical Reasoning & Logical Fallacies', 'Coded Syllogisms and Inequalities', 'Step-by-step Machine Input & Reverse Coding'] },
        ],
      },
      {
        subject: 'General & Banking Awareness',
        highWeightageTopics: ['SBI Specific Initiatives & YONO Developments', 'RBI Regulations, Repo Operations & Monetary Stance', 'Global Banking, IMF, World Bank, Indian Economic Indicators'],
        chapters: [
          { unit: 'Current Financial GK', topics: ['Last 6 months Economic & Financial news', 'Fiscal Deficit, Inflation Indices, Forex Reserves', 'Fintech, Payment Systems, Digital Currency (e-Rupee)', 'Important Committees, Mergers, Regulatory circulars'] },
        ],
      },
    ],
    preparationTips: [
      'No Sectional Cutoffs Advantage: Leverage your strongest subject to maximize overall score while clearing aggregate benchmarks.',
      'Practice Keyboard Typing: The 50-mark Descriptive test requires quick typing speed and structured essay articulation in 30 minutes.',
    ],
    howSadhyaHelps: [
      'Master high-difficulty SBI PO level Data Interpretation and multi-layer puzzles that traditional mock tests fail to simulate.',
      'Practice simulated Group Discussion prompts and AI-evaluated descriptive essay typing with instant grading.',
    ],
    keywords: ['SBI PO preparation', 'SBI PO AI tutor', 'State Bank of India PO exam'],
  },
  {
    slug: 'rbi-grade-b',
    name: 'RBI Grade B',
    fullName: 'Reserve Bank of India Grade ‘B’ (General) Officer Exam',
    category: 'Banking & Finance',
    conductedBy: 'Reserve Bank of India Services Board (RBISB)',
    officialSite: 'https://rbi.org.in/',
    about: 'RBI Grade B is India’s most prestigious regulatory and central banking entrance examination, offering direct entry into managerial cadres at the Reserve Bank of India with impactful roles in monetary policy, banking supervision, and financial stability.',
    structure: '3 Phases: Phase I (Objective Screening) + Phase II (ESI, FM, English Descriptive & Objective) + Phase III (Interview).',
    mode: 'Computer Based Examination (CBT Online)',
    frequency: 'Once a year (Annual)',
    totalMarks: 'Phase I: 200 Marks | Phase II: 300 Marks | Phase III: 75 Marks = 375 Marks Merit',
    duration: 'Phase I: 120 Minutes | Phase II: 330 Minutes across 3 papers',
    markingScheme: 'Phase I: +1 correct, -0.25 incorrect. Phase II: 50% Objective (1/4th negative) + 50% Descriptive typing.',
    eligibility: {
      qualification: 'Minimum 60% marks (50% for SC/ST/PwD) in Graduation or Post-Graduation from a recognized University.',
      ageLimit: '21 to 30 years (32 years for candidates possessing M.Phil. and 34 years for Ph.D.).',
      attemptsLimit: 'General category: Maximum 6 attempts in Phase I. SC/ST/OBC/PwD: No attempt limit.',
      languageMedium: 'Bilingual (Hindi and English).',
    },
    stages: [
      {
        name: 'Phase I (Online Objective Examination)',
        type: 'CBT with Sectional Timers & Sectional Cutoffs',
        duration: '120 Minutes',
        totalMarks: '200 Marks',
        markingScheme: '+1 correct / -0.25 incorrect',
        sections: [
          { name: 'General Awareness', questions: '80 Qs', marks: '80 Marks', timing: '25 Minutes' },
          { name: 'Reasoning Ability', questions: '60 Qs', marks: '60 Marks', timing: '45 Minutes' },
          { name: 'English Language', questions: '30 Qs', marks: '30 Marks', timing: '25 Minutes' },
          { name: 'Quantitative Aptitude', questions: '30 Qs', marks: '30 Marks', timing: '25 Minutes' },
        ],
      },
      {
        name: 'Phase II (Online Objective + Descriptive Examination)',
        type: '3 Papers (50% Objective + 50% Descriptive typed on keyboard)',
        duration: '330 Minutes total',
        totalMarks: '300 Marks (100 Marks per paper)',
        markingScheme: 'Objective: +1 or +2 (-1/4th negative). Descriptive: Evaluated on content depth and structure.',
        sections: [
          { name: 'Paper I: Economic & Social Issues (ESI) — 50M Obj + 50M Desc', questions: 'Obj + 4 Desc Qs', marks: '100 Marks', timing: '120 Minutes' },
          { name: 'Paper II: English Writing Skills (Essay, Précis, Comprehension)', questions: '3 Descriptive Tasks', marks: '100 Marks', timing: '90 Minutes' },
          { name: 'Paper III: Finance & Management (FM) — 50M Obj + 50M Desc', questions: 'Obj + 4 Desc Qs', marks: '100 Marks', timing: '120 Minutes' },
        ],
      },
      {
        name: 'Phase III: Interview',
        type: 'Personal Interview at RBI Mumbai / Regional Centers',
        duration: '25–40 Minutes',
        totalMarks: '75 Marks',
        markingScheme: 'Evaluation of macroeconomics, banking governance, regulatory understanding, and leadership qualities',
        sections: [
          { name: 'Interview Board Interaction', questions: 'In-depth central banking queries', marks: '75 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Economic & Social Issues (ESI)',
        highWeightageTopics: ['Growth & Development (National Income, Poverty, Sustainable Development Goals)', 'Monetary & Fiscal Policy, Union Budget & Economic Survey', 'Social Structure in India (Demographics, Gender, Education, Health)', 'Globalization & Balance of Payments (IMF, World Bank, WTO)'],
        chapters: [
          { unit: 'Growth and Development', topics: ['Measurement of growth: National Income and per capita income', 'Poverty Alleviation and Employment Generation in India', 'Sustainable Development and Environmental issues', 'Monetary & Fiscal Policy reforms, Indian Financial System'] },
          { unit: 'Social Structure & International', topics: ['Multiculturalism, Demographic trends, Urbanization and Migration', 'Gender Issues, Joint family system, Social movements', 'International Economic Institutions (IMF, World Bank, WTO, G20)', 'Regional Economic Cooperation (BRICS, ASEAN, SAARC)'] },
        ],
      },
      {
        subject: 'Finance and Management (FM)',
        highWeightageTopics: ['Financial System & Financial Markets (Forex, Money, Debt, Equity)', 'Corporate Governance & Risk Management in Banking', 'Management Fundamentals (Motivation, Leadership, Communication, HRD)', 'Fintech, Digital Banking & Regulatory Technology'],
        chapters: [
          { unit: 'Financial System & Markets', topics: ['Structure and Functions of Financial Institutions in India', 'Functions of RBI, Banking System in India, Financial inclusion', 'Primary and Secondary Markets (Forex, Money, Bond, Equity)', 'Derivatives (Forwards, Futures, Options, Swaps), Risk Management'] },
          { unit: 'General Management', topics: ['Fundamentals of Management & Organizational Behavior', 'Leadership theories (Trait, Behavioral, Contingency, Transformational)', 'Motivation theories (Maslow, Herzberg, McGregor, Vroom)', 'Communication channels and barriers, Corporate Governance ethics'] },
        ],
      },
      {
        subject: 'English (Writing Skills)',
        highWeightageTopics: ['Essay Writing on Macroeconomic & Financial Topics', 'Précis Writing from Complex Editorial Texts', 'Reading Comprehension & Critical Analysis'],
        chapters: [
          { unit: 'Descriptive Formats', topics: ['Essay drafting with introduction, data, analysis, and visionary conclusion', 'Précis writing adhering strictly to 1/3rd word count', 'Analytical Reading Comprehension with direct contextual synthesis'] },
        ],
      },
    ],
    preparationTips: [
      'Read RBI Reports Diligently: Study the Annual Report, Report on Trend and Progress of Banking in India, and Financial Stability Report (FSR).',
      'Descriptive Keyboard Typing: Practice typing answers for ESI and Finance papers directly in a browser interface.',
    ],
    howSadhyaHelps: [
      'Access deeply curated ESI & Finance theory modules with synthesized RBI bulletin updates.',
      'Get AI feedback on your descriptive economic essays, précis writing, and financial management answers.',
    ],
    keywords: ['RBI Grade B preparation', 'RBI Grade B AI tutor', 'Reserve Bank of India officer exam'],
  },
  {
    slug: 'rrb-ntpc',
    name: 'RRB NTPC',
    fullName: 'Railway Recruitment Board Non-Technical Popular Categories',
    category: 'Railways',
    conductedBy: 'Railway Recruitment Control Board (RRB / Ministry of Railways)',
    officialSite: 'https://www.rrbcdg.gov.in/',
    about: 'RRB NTPC recruits for high-volume non-technical officer and clerical posts across all 21 Railway Recruitment Boards of Indian Railways (such as Station Master, Goods Train Manager, Commercial Apprentice, Senior Clerk cum Typist, and Junior Accounts Assistant).',
    structure: '2-Stage Computer Based Test (CBT 1 Screening + CBT 2 Merit) followed by Typing Skill Test / Computer Based Aptitude Test (CBAT) and Document Verification.',
    mode: 'Computer Based Test (CBT Online)',
    frequency: 'Periodic / Annual as per Ministry of Railways notifications',
    totalMarks: 'CBT 1: 100 Marks | CBT 2: 120 Marks',
    duration: '90 Minutes per stage (120 minutes for PwBD candidates)',
    markingScheme: '+1 for each correct answer, -0.33 (1/3rd) for each incorrect answer.',
    eligibility: {
      qualification: 'Graduate level posts: Bachelor’s Degree. Undergraduate level posts: 12th (+2 Stage) pass from recognized Board.',
      ageLimit: '18 to 30 years for 12th pass posts; 18 to 33/36 years for Graduate posts (with OBC/SC/ST relaxations).',
      attemptsLimit: 'No attempt restriction within the age limit.',
      languageMedium: '15 Languages (English, Hindi, Assamese, Bengali, Gujarati, Kannada, Konkani, Malayalam, Manipuri, Marathi, Odia, Punjabi, Tamil, Telugu, Urdu).',
    },
    stages: [
      {
        name: 'Stage 1 (1st Stage CBT — Screening Test)',
        type: 'CBT Objective MCQ',
        duration: '90 Minutes',
        totalMarks: '100 Marks',
        markingScheme: '+1 correct / -0.33 incorrect',
        sections: [
          { name: 'General Awareness', questions: '40 Qs', marks: '40 Marks' },
          { name: 'Mathematics', questions: '30 Qs', marks: '30 Marks' },
          { name: 'General Intelligence and Reasoning', questions: '30 Qs', marks: '30 Marks' },
        ],
      },
      {
        name: 'Stage 2 (2nd Stage CBT — Merit Test for Shortlisted Candidates)',
        type: 'CBT Objective MCQ (Level specific: Level 2, 3, 4, 5, 6)',
        duration: '90 Minutes',
        totalMarks: '120 Marks',
        markingScheme: '+1 correct / -0.33 incorrect',
        sections: [
          { name: 'General Awareness', questions: '50 Qs', marks: '50 Marks' },
          { name: 'Mathematics', questions: '35 Qs', marks: '35 Marks' },
          { name: 'General Intelligence and Reasoning', questions: '35 Qs', marks: '35 Marks' },
        ],
      },
      {
        name: 'Stage 3: CBAT / Typing Skill Test (Post specific)',
        type: 'Computer Based Aptitude Test (Station Master) OR Typing Test (Clerks)',
        duration: 'Qualifying Stage',
        totalMarks: 'Qualifying / Weighted',
        markingScheme: '30 WPM English / 25 WPM Hindi for Typing; T-score >= 42 in each battery for CBAT',
        sections: [
          { name: 'Skill Test (Typing Test / Aptitude Test)', questions: 'Practical Test', marks: 'Qualifying' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'General Awareness (Highest Weightage)',
        highWeightageTopics: ['Indian Railways History, Zones, Vande Bharat & Tech', 'General Science (Physics, Chemistry, Life Sciences up to 10th CBSE)', 'Current Affairs (National/International, Sports, Awards)', 'Indian History, Geography, Polity & Constitution', 'Monuments and Places of India, World Organizations (UN, WHO)'],
        chapters: [
          { unit: 'Static GK & Science', topics: ['Current Events of National and International Importance', 'Games and Sports, Art and Culture of India', 'Indian Literature, Monuments and Places of India', 'General Science and Life Science (up to 10th CBSE level)', 'History of India and Freedom Struggle', 'Physical, Social and Economic Geography of India and World', 'Indian Polity and Governance - constitution and political system', 'General Scientific and Technological Developments including Space and Nuclear Program of India', 'UN and Other important World Organizations', 'Environmental Issues Concerning India and World at Large', 'Basics of Computers and Computer Applications', 'Common Abbreviations, Transport Systems in India, Indian Economy', 'Famous Personalities of India and World, Flagship Government Programs', 'Flora and Fauna of India, Important Government and Public Sector Organizations of India'] },
        ],
      },
      {
        subject: 'Mathematics',
        highWeightageTopics: ['Number System, Decimals & Fractions', 'LCM & HCF, Ratio & Proportions, Percentage', 'Time & Work, Time & Distance, SI & CI', 'Profit & Loss, Elementary Algebra, Geometry & Trigonometry', 'Elementary Statistics (Mean, Median, Mode, Standard Deviation)'],
        chapters: [
          { unit: 'Maths Chapters', topics: ['Number System, Decimals, Fractions, LCM, HCF', 'Ratio and Proportions, Percentage, Mensuration', 'Time and Work, Time and Distance, Simple and Compound Interest', 'Profit and Loss, Elementary Algebra, Geometry and Trigonometry', 'Elementary Statistics (Mean, Median, Mode, Variance)'] },
        ],
      },
      {
        subject: 'General Intelligence & Reasoning',
        highWeightageTopics: ['Analogies & Coding-Decoding', 'Mathematical Operations & Relationships', 'Syllogism, Jumbling & Venn Diagrams', 'Data Interpretation & Sufficiency', 'Statement-Conclusion, Statement-Courses of Action'],
        chapters: [
          { unit: 'Reasoning Chapters', topics: ['Analogies, Completion of Number and Alphabetical Series', 'Coding and Decoding, Mathematical Operations, Similarities and Differences', 'Relationships, Analytical Reasoning, Syllogism, Jumbling', 'Venn Diagrams, Puzzle, Data Sufficiency', 'Statement- Conclusion, Statement- Courses of Action', 'Decision Making, Maps, Interpretation of Graphs'] },
        ],
      },
    ],
    preparationTips: [
      'Focus Strongly on General Science & Railways GK: Science and Railway facts comprise over 40% of the General Awareness section.',
      'Speed in Arithmetic: Master rapid calculation methods to answer 120 questions within 90 minutes in CBT 2.',
    ],
    howSadhyaHelps: [
      'Practice high-yield Railway GK and Science fact flashcards calibrated to recent RRB exam trends.',
      'Generate timed 90-minute CBT simulations with accurate 1/3rd negative marking penalty tracking.',
    ],
    keywords: ['RRB NTPC preparation', 'RRB NTPC AI tutor', 'railway recruitment exam India'],
  },
  {
    slug: 'ugc-net',
    name: 'UGC NET',
    fullName: 'University Grants Commission National Eligibility Test (JRF & Assistant Professor)',
    category: 'Academia',
    conductedBy: 'National Testing Agency (NTA)',
    officialSite: 'https://ugcnet.nta.ac.in/',
    about: 'UGC NET determines eligibility for Assistant Professorship and the award of Junior Research Fellowship (JRF) in Indian Universities and Colleges across 83 postgraduate disciplines, serving as the benchmark credential for academic careers in higher education.',
    structure: 'Single continuous 3-hour Computer Based Test comprising Paper 1 (Teaching & Research Aptitude - 50 Qs) and Paper 2 (Chosen Subject Domain - 100 Qs).',
    mode: 'Computer Based Test (CBT Online)',
    frequency: 'Twice a year (June and December cycles)',
    totalMarks: '300 Marks (Paper 1: 100 Marks + Paper 2: 200 Marks)',
    duration: '3 Hours (180 minutes) with no break between papers',
    markingScheme: '+2 for each correct answer. No negative marking.',
    eligibility: {
      qualification: 'Master’s Degree or equivalent with at least 55% marks (50% for OBC-NCL/SC/ST/PwD) from recognized Universities.',
      ageLimit: 'JRF: Maximum 30 years (with 5 years relaxation for OBC/SC/ST/Women). Assistant Professor: No upper age limit.',
      attemptsLimit: 'No attempt limit.',
      languageMedium: 'Bilingual (Hindi and English).',
    },
    stages: [
      {
        name: 'Single Stage CBT Examination',
        type: 'Objective Multiple Choice (No Break)',
        duration: '180 Minutes',
        totalMarks: '300 Marks',
        markingScheme: '+2 correct / 0 negative marks',
        sections: [
          { name: 'Paper 1: General Teaching and Research Aptitude (Common to All)', questions: '50 Qs', marks: '100 Marks' },
          { name: 'Paper 2: Subject Domain Specific (Chosen from 83 PG Subjects)', questions: '100 Qs', marks: '200 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Paper 1: Teaching & Research Aptitude (10 Core Units)',
        highWeightageTopics: ['Teaching Aptitude (Levels of Teaching, Evaluation Systems, CBCS)', 'Research Aptitude (Methods, Thesis Writing, Ethics, Positivism)', 'Reading Comprehension & Communication Models', 'Mathematical Reasoning, Logical Reasoning (Indian Logic, Pramanas)', 'Information & Communication Technology (ICT)', 'People, Development and Environment (SDGs, MDGs, Pollution, Protocols)', 'Higher Education System (Governance, NEP 2020, Ancient Universities)'],
        chapters: [
          { unit: 'Unit I & II: Teaching & Research Aptitude', topics: ['Teaching: Concept, Objectives, Levels (Memory, Understanding, Reflective), Characteristics', 'Learner’s characteristics, Factors affecting teaching, Methods of teaching in Higher learning institutions', 'Online vs. Offline methods (Swayam, Swayamprabha, MOOCs), Evaluation Systems (CBCS, Computer based testing)', 'Research: Meaning, Types, Characteristics, Positivism & Post-positivistic approach to research', 'Methods of Research (Experimental, Descriptive, Historical, Qualitative and Quantitative)', 'Steps of Research, Thesis and Article writing: Format and styles of referencing, Application of ICT, Research ethics'] },
          { unit: 'Unit III to VI: Comprehension, Communication & Logic', topics: ['Comprehension: A passage of text with questions to be answered', 'Communication: Meaning, types, characteristics, Effective communication (Verbal, Non-verbal, Inter-cultural, Classroom)', 'Barriers to effective communication, Mass-Media and Society', 'Mathematical Reasoning and Aptitude: Types of reasoning, Number series, Letter series, Codes and Relationships', 'Fractions, Time & Distance, Ratio, Proportion, Percentage, Profit and Loss, Interest and Discounting, Averages', 'Logical Reasoning: Understanding structure of arguments, Categorical propositions, Mood and Figure, Formal and Informal fallacies', 'Uses of language, Connotations and denotations of terms, Classical square of opposition', 'Indian Logic: Means of knowledge (Pramanas: Pratyaksha, Anumana, Upamana, Shabda, Arthapatti, Anupalabddhi), Vyapti, Hetvabhasas'] },
          { unit: 'Unit VII to X: Data, ICT, Environment & Higher Education', topics: ['Data Interpretation: Sources, acquisition and classification of data, Quantitative and Qualitative data, Graphical representation', 'ICT: General abbreviations and terminology, Basics of Internet, Intranet, E-mail, Audio and Video-conferencing, Digital initiatives in higher education, ICT and Governance', 'People, Development and Environment: Development and environment: Millennium development and Sustainable development goals', 'Human and environment interaction: Anthropogenic activities and their impacts on environment', 'Environmental issues: Air, water, soil, noise, waste, Climate change and its socio-economic and political dimensions', 'Natural and energy resources: Solar, Wind, Soil, Hydro, Geothermal, Biomass, Nuclear and Forests', 'Environmental Protection Act (1986), National Action Plan on Climate Change, International agreements (Montreal Protocol, Rio Summit, CBD, Kyoto Protocol, Paris Agreement, ISA)', 'Higher Education System: Institutions of higher learning and education in ancient India, Evolution of higher learning and research in Post Independence India, Oriental, Conventional and Non-conventional learning programmes in India', 'Professional, Technical and Skill Based education, Value education and environmental education, Policies, Governance, and Administration, NEP 2020'] },
        ],
      },
      {
        subject: 'Paper 2: Subject Domain (Postgraduate Depth)',
        highWeightageTopics: ['Comprehensive coverage of the candidate’s specific Master’s discipline (e.g. Commerce, Management, Economics, Political Science, History, Computer Science, English, Education, Sociology, Law)'],
        chapters: [
          { unit: 'Master’s Level Core Syllabus', topics: ['In-depth conceptual, theoretical, and analytical mastery across all 10 specialized units of the chosen Paper 2 subject'] },
        ],
      },
    ],
    preparationTips: [
      'Maximize Paper 1 Score: Target 80+ marks in Paper 1 (Indian Logic, Research Aptitude, Higher Education) to guarantee a JRF cutoff.',
      'Indian Logic (Pramanas & Hetvabhasa): Dedicate focused revision to classical Indian logic terms which appear every cycle.',
    ],
    howSadhyaHelps: [
      'Break down intricate concepts in Indian Logic, Research Methodology, and Higher Education policies into straightforward, relatable explainers.',
      'Practice chapter-by-chapter Paper 1 questions and subject-specific Paper 2 mock simulations.',
    ],
    keywords: ['UGC NET preparation', 'UGC NET AI tutor', 'NET JRF exam India', 'assistant professor eligibility exam'],
  },
  {
    slug: 'state-pscs',
    name: 'State PSCs',
    fullName: 'State Public Service Commission Examinations (UPPSC, MPPSC, RAS, WBPSC, TNPSC, MPSC, etc.)',
    category: 'Civil Services',
    conductedBy: 'Individual State Public Service Commissions',
    officialSite: 'https://uppsc.up.nic.in/',
    about: 'State Public Service Commissions conduct recruitment into state administrative, police, accounts, and revenue services (Deputy Collector, DSP, Commercial Tax Officer, Tehsildar, and Block Development Officer) tailored to state-specific governance and culture.',
    structure: '3-Tier Pattern: Preliminary Examination (Objective) + Main Examination (Descriptive Written) + Personality Test (Interview).',
    mode: 'Offline Pen & Paper (OMR for Prelims, Descriptive for Mains)',
    frequency: 'Annual / Regular cycles per State',
    totalMarks: 'Varies by state (e.g. UPPSC: 1500 Mains + 100 Interview = 1600 Marks)',
    duration: 'Prelims: Two 2-Hour Papers | Mains: 3 Hours per descriptive paper',
    markingScheme: 'Prelims: Negative marking (typically 1/3rd). Mains: Descriptive qualitative evaluation.',
    eligibility: {
      qualification: 'Bachelor’s Degree in any discipline from a recognized University.',
      ageLimit: '21 to 40/42 years (varies by state with standard caste/domicile relaxations).',
      attemptsLimit: 'No attempt limit as long as candidate is within the prescribed age bracket.',
      languageMedium: 'State Official Language, Hindi, and English.',
    },
    stages: [
      {
        name: 'Preliminary Examination (Screening)',
        type: 'Objective OMR MCQ',
        duration: '4 Hours (Two 2-Hour Papers)',
        totalMarks: '400 Marks',
        markingScheme: '+2 correct / -0.66 incorrect in GS 1; CSAT Paper 2 qualifying at 33%',
        sections: [
          { name: 'Paper I: General Studies (National & State Specific)', questions: '150 Qs', marks: '200 Marks' },
          { name: 'Paper II: General Studies II / CSAT (Qualifying 33%)', questions: '100 Qs', marks: '200 Marks' },
        ],
      },
      {
        name: 'Main Examination (Written)',
        type: 'Descriptive Essay & General Studies Papers',
        duration: '3 Hours per paper',
        totalMarks: '1400–1500 Marks',
        markingScheme: 'Analytical descriptive assessment',
        sections: [
          { name: 'General Hindi / Language Paper', questions: 'Subjective', marks: '150 Marks' },
          { name: 'Essay Paper', questions: '3 Essays', marks: '150 Marks' },
          { name: 'General Studies Papers I to IV (Core National Syllabus)', questions: 'Subjective', marks: '200 Marks each' },
          { name: 'State Specific General Studies Papers (e.g., UPPSC GS V & VI / MPPSC / RAS specific)', questions: 'Subjective', marks: '200 Marks each' },
        ],
      },
      {
        name: 'Personality Test (Interview)',
        type: 'In-person Board Interview at State PSC Headquarters',
        duration: '20–30 Minutes',
        totalMarks: '100–175 Marks',
        markingScheme: 'Assessment of state administrative acumen, cultural familiarity, and decision-making clarity',
        sections: [
          { name: 'State Administrative Panel Interview', questions: 'Personality & State issues', marks: '100–175 Marks' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'State-Specific General Studies (Core Pillar)',
        highWeightageTopics: ['State History, Dynasties, Freedom Movement & Tribal Leaders', 'State Geography, Rivers, Forests, Climate & Minerals', 'State Economy, Budget, Industrial Policies & Agriculture', 'State Polity, Panchayats, Administrative Structure & Culture/Festivals'],
        chapters: [
          { unit: 'State Heritage & History', topics: ['Ancient, Medieval, and Modern History of the specific State', 'Role of the State in 1857 Revolt and Freedom Struggle', 'Folk culture, fairs, festivals, dialects, art, music, and heritage sites'] },
          { unit: 'State Economy & Geography', topics: ['State Budget, Economic Survey, flagship social schemes', 'Agricultural zones, major crops, irrigation infrastructure', 'Forest resources, wildlife sanctuaries, mineral belts, industrial corridors'] },
        ],
      },
      {
        subject: 'General Studies I–IV (National Core)',
        highWeightageTopics: ['Indian Polity, Constitution & Governance', 'Indian History, Modern National Movement & Culture', 'Physical, Human & Economic Geography of India', 'Indian Economy, Agriculture, Sci-Tech & Environment', 'Ethics, Human Values & Administrative Case Studies'],
        chapters: [
          { unit: 'Standard GS Modules', topics: ['Complete alignment with national civil services GS 1, GS 2, GS 3, GS 4 framework'] },
        ],
      },
    ],
    preparationTips: [
      'Prioritize State GK Papers: State-specific papers (e.g., UP GS Papers 5 & 6) now carry equal weight to national GS papers.',
      'State Economic Survey & Budget: Read the latest State Budget and Economic Survey for direct data points in Mains answers.',
    ],
    howSadhyaHelps: [
      'Tailor study material to your specific State PSC (UPPSC, MPPSC, RAS, etc.) with dedicated state-specific notes.',
      'Generate adaptive prelims tests and practice analytical Mains answers with state-focused case studies.',
    ],
    keywords: ['State PSC preparation', 'State Public Service Commission exam AI tutor', 'UPPSC MPPSC RPSC preparation'],
  },
  {
    slug: 'cbse-icse',
    name: 'CBSE & ICSE',
    fullName: 'CBSE & ICSE Board Curriculum (Class 6 to 12)',
    category: 'School Board',
    conductedBy: 'Central Board of Secondary Education (CBSE) & CISCE (ICSE / ISC)',
    officialSite: 'https://cbse.gov.in/',
    about: 'Sadhya provides end-to-end academic tutoring, homework assistance, concept clarifications, and board examination preparation for Class 6 through 12 students enrolled in CBSE and ICSE/ISC schools nationwide.',
    structure: 'Continuous school assessments, periodic term tests, practicals/internals, and annual Central Board Examinations for Class 10 & Class 12.',
    mode: 'Pen & Paper School & Board Examinations',
    frequency: 'Annual Board Exam Cycles (Feb to April)',
    totalMarks: '100 Marks per subject (80 Theory + 20 Internal/Practical, or 70 Theory + 30 Practical for Sciences)',
    duration: '3 Hours per board theory paper',
    markingScheme: 'Step-by-step marking scheme as per official CBSE/ICSE marking rubrics.',
    eligibility: {
      qualification: 'Students enrolled in Class 6, 7, 8, 9, 10, 11, or 12 in recognized CBSE, ICSE, or State board schools.',
      ageLimit: 'Age-appropriate school class levels.',
      attemptsLimit: 'Regular academic year examinations + Supplementary/Compartment opportunities.',
      languageMedium: 'English, Hindi, and Regional Language mediums.',
    },
    stages: [
      {
        name: 'Class 10 Board Examination Pattern',
        type: 'Descriptive Theory + Case-Based Questions + Practical/Internal',
        duration: '180 Minutes per subject',
        totalMarks: '100 Marks (80 Theory + 20 Internal)',
        markingScheme: 'Step-by-step marks with competency-focused questions (50% MCQs/Case based)',
        sections: [
          { name: 'Mathematics (Standard / Basic)', questions: '38 Questions', marks: '80 Marks', timing: '3 Hours' },
          { name: 'Science (Physics, Chemistry, Biology)', questions: '39 Questions', marks: '80 Marks', timing: '3 Hours' },
          { name: 'Social Science (History, Geography, Civics, Economics)', questions: '37 Questions', marks: '80 Marks', timing: '3 Hours' },
          { name: 'English Language & Literature', questions: 'Reading, Writing, Grammar, Literature', marks: '80 Marks', timing: '3 Hours' },
          { name: 'Second Language (Hindi / Sanskrit / Regional)', questions: 'Grammar, Writing, Literature', marks: '80 Marks', timing: '3 Hours' },
        ],
      },
      {
        name: 'Class 12 Board Examination Pattern',
        type: 'Descriptive Theory + Numerical/Derivation + Practicals',
        duration: '180 Minutes per subject',
        totalMarks: '100 Marks (70 Theory + 30 Practical for Science; 80 Theory + 20 Internal for Commerce/Arts)',
        markingScheme: 'Competency-based questions (50%), short answer, long answer, and practical viva',
        sections: [
          { name: 'Physics / Accountancy / Political Science', questions: '33–34 Questions', marks: '70–80 Marks', timing: '3 Hours' },
          { name: 'Chemistry / Business Studies / History', questions: '33–34 Questions', marks: '70–80 Marks', timing: '3 Hours' },
          { name: 'Mathematics / Applied Mathematics', questions: '38 Questions', marks: '80 Marks', timing: '3 Hours' },
          { name: 'Biology / Economics / Geography', questions: '33 Questions', marks: '70–80 Marks', timing: '3 Hours' },
          { name: 'English Core / Elective', questions: 'Reading, Creative Writing, Literature', marks: '80 Marks', timing: '3 Hours' },
        ],
      },
    ],
    syllabus: [
      {
        subject: 'Class 10 & 12 Science Stream (NCERT & ICSE)',
        highWeightageTopics: ['Class 10: Chemical Reactions, Light & Electricity, Life Processes, Heredity', 'Class 12 Physics: Electrostatics, Optics, Current Electricity, Modern Physics', 'Class 12 Chemistry: Organic Mechanisms, Solutions, Electrochemistry, Coordination Compounds', 'Class 12 Biology: Genetics, Reproduction, Biotechnology, Ecology'],
        chapters: [
          { unit: 'Class 10 Core Science', topics: ['Chemical Reactions & Equations, Acids Bases & Salts, Metals & Non-Metals, Carbon & its Compounds', 'Life Processes, Control and Coordination, How do Organisms Reproduce?, Heredity', 'Light: Reflection and Refraction, Human Eye and Colourful World', 'Electricity, Magnetic Effects of Electric Current, Our Environment'] },
          { unit: 'Class 12 Core Science', topics: ['Full alignment with latest CBSE & CISCE Class 12 curricula across Physics, Chemistry, Biology, and Mathematics'] },
        ],
      },
      {
        subject: 'Class 10 & 12 Commerce & Humanities Stream',
        highWeightageTopics: ['Accountancy (Partnership, Company Accounts, Cash Flow Statements)', 'Economics (Macroeconomics, National Income, Indian Economic Development)', 'Business Studies (Principles of Management, Financial Management, Marketing)', 'History, Political Science & Geography (Thematic Historical analysis, Contemporary World Politics)'],
        chapters: [
          { unit: 'Commerce & Arts Syllabi', topics: ['Full chapter-wise alignment with Class 11 and 12 NCERT and ISC textbooks'] },
        ],
      },
    ],
    preparationTips: [
      'Master Step Marking: Board examiners assign marks for each formula written, diagram labeled, and step shown.',
      'Solve Previous 5 Years Board Papers: 60%+ of question formats repeat with numerical modifications.',
    ],
    howSadhyaHelps: [
      'Snap a photo of any homework question or textbook problem and get a step-by-step NCERT-aligned explanation.',
      'Organize your study notes by chapter with interactive quizzes matching exact board exam marking criteria.',
    ],
    keywords: ['CBSE homework help', 'ICSE homework help', 'Class 10 12 board exam preparation', 'school AI tutor India'],
  },
];

export const getExamBySlug = (slug: string): ExamEntry | undefined =>
  EXAM_CATALOG.find((e) => e.slug === slug);
