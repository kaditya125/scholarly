/**
 * UGC NET Paper I (General Paper on Teaching & Research Aptitude - Subject Code 00)
 * Canonical Syllabus Taxonomy based on official UGC NET guidelines.
 * Paper I comprises 50 objective-type questions (2 marks each = 100 marks).
 * Standard design: Exactly 5 questions drawn from each of the 10 units.
 */

export interface Paper1Subtopic {
  id: string;
  name: string;
  description: string;
  keywords: string[];
}

export interface Paper1Unit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  expectedQuestions: number;
  subtopics: Paper1Subtopic[];
}

export const UGC_NET_PAPER1_TAXONOMY: Paper1Unit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_TEACHING_APTITUDE',
    unitName: 'Teaching Aptitude',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U1_CONCEPTS',
        name: 'Teaching Concepts & Objectives',
        description: 'Nature, objectives, levels of teaching (memory, understanding and reflective), characteristics and basic requirements.',
        keywords: ['memory level', 'reflective level', 'understanding level', 'teaching objectives', 'morrison', 'herbart', 'hunt', 'pedagogy']
      },
      {
        id: 'P1_U1_LEARNER_CHAR',
        name: 'Learner Characteristics',
        description: 'Characteristics of adolescent and adult learners (academic, social, emotional and cognitive), individual differences.',
        keywords: ['adolescent', 'adult learner', 'cognitive', 'emotional', 'individual differences', 'learning styles']
      },
      {
        id: 'P1_U1_FACTORS_AFFECTING',
        name: 'Factors Affecting Teaching',
        description: 'Teacher, learner, support material, instructional facilities, learning environment and institution.',
        keywords: ['instructional facilities', 'support material', 'teacher characteristics', 'classroom climate']
      },
      {
        id: 'P1_U1_METHODS',
        name: 'Methods of Teaching in Higher Learning',
        description: 'Teacher-centred vs learner-centred methods; offline vs online methods (Swayam, Swayamprabha, MOOCs etc.).',
        keywords: ['teacher-centred', 'learner-centred', 'moocs', 'swayam', 'swayamprabha', 'blended learning', 'flipped classroom']
      },
      {
        id: 'P1_U1_EVALUATION',
        name: 'Evaluation Systems',
        description: 'Elements and types of evaluation, evaluation in Choice Based Credit System (CBCS), computer based testing, innovations in evaluation systems.',
        keywords: ['formative evaluation', 'summative evaluation', 'norm-referenced', 'criterion-referenced', 'diagnostic', 'cbcs', 'cbt']
      }
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_RESEARCH_APTITUDE',
    unitName: 'Research Aptitude',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U2_MEANING_TYPES',
        name: 'Research Meaning, Types and Characteristics',
        description: 'Positivism and post-positivistic approach to research, fundamental, applied, action research, qualitative and quantitative methods.',
        keywords: ['positivism', 'post-positivism', 'action research', 'fundamental research', 'applied research', 'empirical', 'qualitative', 'quantitative']
      },
      {
        id: 'P1_U2_METHODS',
        name: 'Methods of Research',
        description: 'Experimental, descriptive, historical, qualitative and quantitative methods.',
        keywords: ['experimental research', 'independent variable', 'dependent variable', 'descriptive research', 'historical research', 'ex-post facto', 'control group']
      },
      {
        id: 'P1_U2_STEPS',
        name: 'Steps of Research',
        description: 'Identification of problem, literature review, formulation of hypothesis, research design, data collection, data analysis, hypothesis testing.',
        keywords: ['hypothesis', 'null hypothesis', 'sampling', 'stratified sampling', 'snowball', 'data collection', 'type i error', 'type ii error']
      },
      {
        id: 'P1_U2_THESIS_WRITING',
        name: 'Thesis and Article Writing',
        description: 'Format and styles of referencing, citations (APA, MLA, Chicago).',
        keywords: ['apa style', 'mla style', 'referencing', 'bibliography', 'citation', 'footnotes', 'endnotes']
      },
      {
        id: 'P1_U2_ICT_ETHICS',
        name: 'Application of ICT in Research & Research Ethics',
        description: 'ICT tools in research, research integrity, plagiarism, ethics in data reporting.',
        keywords: ['research ethics', 'plagiarism', 'turnitin', 'urkund', 'shodhganga', 'spss', 'ict in research']
      }
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_COMPREHENSION',
    unitName: 'Comprehension',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U3_PASSAGE',
        name: 'Reading Comprehension',
        description: 'A passage of text is given. Questions to be asked from the passage to be answered.',
        keywords: ['passage', 'reading comprehension', 'inference', 'contextual meaning', 'central theme', 'author intent']
      }
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_COMMUNICATION',
    unitName: 'Communication',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U4_MEANING_TYPES',
        name: 'Communication Meaning, Types & Characteristics',
        description: 'Verbal and non-verbal, inter-cultural and group communications, classroom communication.',
        keywords: ['verbal communication', 'non-verbal', 'kinesics', 'proxemics', 'paralanguage', 'classroom communication', 'interpersonal', 'intrapersonal']
      },
      {
        id: 'P1_U4_EFFECTIVE_COMM',
        name: 'Effective Communication',
        description: '7 Cs of communication, active listening, feedback mechanisms.',
        keywords: ['clarity', 'conciseness', 'concreteness', 'active listening', 'feedback', 'encoding', 'decoding']
      },
      {
        id: 'P1_U4_BARRIERS',
        name: 'Barriers to Effective Communication',
        description: 'Physical, psychological, semantic, organizational and cultural barriers.',
        keywords: ['barriers', 'noise', 'semantic barrier', 'psychological barrier', 'cultural filter']
      },
      {
        id: 'P1_U4_MASS_MEDIA',
        name: 'Mass-Media and Society',
        description: 'Role of radio, television, newspapers, internet and digital media in society.',
        keywords: ['mass media', 'social media', 'broadcasting', 'agenda setting', 'fourth estate']
      }
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_MATH_REASONING',
    unitName: 'Mathematical Reasoning and Aptitude',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U5_TYPES_REASONING',
        name: 'Types of Reasoning',
        description: 'Number series, letter series, codes and relationships.',
        keywords: ['number series', 'letter series', 'coding decoding', 'blood relation', 'direction sense']
      },
      {
        id: 'P1_U5_MATH_APTITUDE',
        name: 'Mathematical Aptitude',
        description: 'Fraction, time & distance, ratio, proportion and percentage, profit and loss, interest and discounting, averages etc.',
        keywords: ['percentage', 'ratio and proportion', 'profit and loss', 'simple interest', 'compound interest', 'average', 'speed distance time', 'fractions']
      }
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_LOGICAL_REASONING',
    unitName: 'Logical Reasoning',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U6_ARGUMENTS',
        name: 'Structure of Arguments',
        description: 'Argument forms, structure of categorical propositions, mood and figure, formal and informal fallacies, uses of language, connotations and denotations of terms, classical square of opposition.',
        keywords: ['square of opposition', 'contrary', 'contradictory', 'subaltern', 'subcontrary', 'fallacy', 'syllogism', 'premise', 'conclusion']
      },
      {
        id: 'P1_U6_DEDUCTIVE_INDUCTIVE',
        name: 'Deductive and Inductive Reasoning',
        description: 'Evaluating and distinguishing deductive and inductive reasoning, analogies.',
        keywords: ['deductive reasoning', 'inductive reasoning', 'analogy', 'validity', 'soundness']
      },
      {
        id: 'P1_U6_VENN_DIAGRAMS',
        name: 'Venn Diagram',
        description: 'Simple and multiple use for establishing validity of arguments.',
        keywords: ['venn diagram', 'euler diagram', 'set representation']
      },
      {
        id: 'P1_U6_INDIAN_LOGIC',
        name: 'Indian Logic (Pramanas)',
        description: 'Means of knowledge: Pratyaksha (Perception), Anumana (Inference), Upamana (Comparison), Shabda (Verbal testimony), Arthapatti (Implication) and Anupalabddhi (Non-apprehension).',
        keywords: ['pramanas', 'pratyaksha', 'anumana', 'upamana', 'shabda', 'arthapatti', 'anupalabdhi', 'nyaya', 'vyapti', 'hetu', 'sadhya', 'paksha', 'hetvabhasa']
      }
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_DATA_INTERPRETATION',
    unitName: 'Data Interpretation',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U7_SOURCES_CLASSIFICATION',
        name: 'Sources, Acquisition and Classification of Data',
        description: 'Quantitative and qualitative data, primary and secondary data.',
        keywords: ['primary data', 'secondary data', 'quantitative data', 'qualitative data']
      },
      {
        id: 'P1_U7_GRAPHICAL_REP',
        name: 'Graphical Representation and Mapping of Data',
        description: 'Bar-chart, histograms, pie-chart, table-chart and line-chart.',
        keywords: ['bar chart', 'pie chart', 'histogram', 'table chart', 'line chart', 'data interpretation']
      },
      {
        id: 'P1_U7_DATA_GOVERNANCE',
        name: 'Data and Governance',
        description: 'Data analytics, open data, evidence-based decision making.',
        keywords: ['data governance', 'open data', 'big data in policy']
      }
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_ICT',
    unitName: 'Information and Communication Technology (ICT)',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U8_GENERAL_ABBR',
        name: 'ICT General Abbreviations and Terminology',
        description: 'Basics of internet, intranet, e-mail, audio and video-conferencing.',
        keywords: ['ram', 'rom', 'cache', 'url', 'http', 'https', 'ftp', 'ip address', 'dns', 'firewall', 'malware', 'phishing', 'ransomware']
      },
      {
        id: 'P1_U8_DIGITAL_INITIATIVES',
        name: 'Digital Initiatives in Higher Education',
        description: 'NPTEL, SWAYAM, SWAYAMPRABHA, National Digital Library (NDL), e-ShodhSindhu, ShodhGangotri, DigiLocker.',
        keywords: ['swayam', 'swayamprabha', 'ndl', 'e-shodhsindhu', 'shodhgangotri', 'digilocker', 'samarth', 'nad']
      },
      {
        id: 'P1_U8_ICT_GOVERNANCE',
        name: 'ICT and Governance',
        description: 'E-governance initiatives, smart governance, digital delivery of public services.',
        keywords: ['e-governance', 'smart governance', 'g2c', 'g2b', 'g2g', 'digital india']
      }
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_PEOPLE_ENVIRONMENT',
    unitName: 'People, Development and Environment',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U9_DEV_ENVIRONMENT',
        name: 'Development and Environment',
        description: 'Millennium Development Goals (MDGs) and Sustainable Development Goals (SDGs).',
        keywords: ['mdgs', 'millennium development goals', 'sdgs', 'sustainable development goals', 'sdg 2030']
      },
      {
        id: 'P1_U9_HUMAN_ENVIRONMENT',
        name: 'Human and Environment Interaction',
        description: 'Anthropogenic activities and their impacts on environment.',
        keywords: ['anthropogenic', 'carbon footprint', 'deforestation', 'greenhouse gas', 'global warming']
      },
      {
        id: 'P1_U9_ENVIRONMENTAL_ISSUES',
        name: 'Environmental Issues',
        description: 'Air pollution, water pollution, soil pollution, noise pollution, waste (solid, liquid, biomedical, hazardous, e-waste), climate change.',
        keywords: ['air pollution', 'pm2.5', 'pm10', 'water pollution', 'bod', 'cod', 'e-waste', 'biomedical waste', 'acid rain', 'ozone layer', 'montreal protocol']
      },
      {
        id: 'P1_U9_ENERGY_RESOURCES',
        name: 'Natural and Energy Resources',
        description: 'Solar, wind, soil, hydro, geothermal, biomass, nuclear and forests.',
        keywords: ['solar energy', 'wind energy', 'geothermal', 'biomass', 'renewable energy', 'international solar alliance']
      },
      {
        id: 'P1_U9_PROTECTION_ACTS',
        name: 'Environmental Protection Acts & International Agreements',
        description: 'Environment Protection Act 1986, National Action Plan on Climate Change (NAPCC), Paris Agreement, Montreal Protocol, Kyoto Protocol, Rio Summit.',
        keywords: ['environment protection act 1986', 'napcc', 'paris agreement', 'kyoto protocol', 'montreal protocol', 'cop28', 'cbd']
      }
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_HIGHER_EDUCATION',
    unitName: 'Higher Education System',
    expectedQuestions: 5,
    subtopics: [
      {
        id: 'P1_U10_ANCIENT_INDIA',
        name: 'Institutions of Higher Learning and Education in Ancient India',
        description: 'Takshashila, Nalanda, Valabhi, Vikramashila, gurukul system, education in ancient scriptures.',
        keywords: ['takshashila', 'nalanda', 'valabhi', 'vikramashila', 'gurukul', 'ancient universities']
      },
      {
        id: 'P1_U10_POST_INDEPENDENCE',
        name: 'Evolution of Higher Learning and Research in Post Independence India',
        description: 'Radhakrishnan Commission, Mudaliar Commission, Kothari Commission, NEP 1968, NEP 1986, NEP 2020.',
        keywords: ['radhakrishnan commission', 'kothari commission', 'nep 2020', 'national education policy', 'rusa', 'heci']
      },
      {
        id: 'P1_U10_ORIENTAL_CONVENTIONAL',
        name: 'Oriental, Conventional and Non-Conventional Learning Programmes in India',
        description: 'Open and distance learning, non-formal education, adult education, traditional knowledge systems.',
        keywords: ['ignou', 'open university', 'distance learning', 'non-conventional education', 'traditional knowledge']
      },
      {
        id: 'P1_U10_VALUE_POLICIES',
        name: 'Professional, Technical and Skill Based Education; Value and Environmental Education',
        description: 'AICTE, UGC, NAAC, NIRF, value education, constitutional values and environmental education.',
        keywords: ['aicte', 'ugc', 'naac', 'nirf', 'value education', 'governance in higher education']
      }
    ]
  }
];

export function mapPaper1QuestionToUnit(text: string, optionsText: string = ''): { unitNumber: number; unitCode: string; subtopicId: string; confidence: number } {
  const combined = (text + ' ' + optionsText).toLowerCase();
  
  let bestUnit = UGC_NET_PAPER1_TAXONOMY[0];
  let bestSubtopic = bestUnit.subtopics[0];
  let maxScore = 0;

  for (const unit of UGC_NET_PAPER1_TAXONOMY) {
    for (const sub of unit.subtopics) {
      let score = 0;
      for (const kw of sub.keywords) {
        if (combined.includes(kw.toLowerCase())) {
          score += 3;
        }
      }
      if (score > maxScore) {
        maxScore = score;
        bestUnit = unit;
        bestSubtopic = sub;
      }
    }
  }

  const confidence = maxScore > 0 ? Math.min(0.95, 0.5 + (maxScore * 0.08)) : 0.4;

  return {
    unitNumber: bestUnit.unitNumber,
    unitCode: bestUnit.unitCode,
    subtopicId: bestSubtopic.id,
    confidence
  };
}
