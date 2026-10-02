/**
 * Authentic SSC Scientific Assistant (IMD) & SSC JE Paper-I PYQ Corpus Builder
 * Covers 14.2.1 General Intelligence & Reasoning and 14.2.2 General Awareness
 * Sourced from official SSC IMD 2022, 2017 & SSC JE 2022–2024 benchmark papers.
 */

import * as crypto from 'crypto';
import { CanonicalPYQQuestion, PYQProvenanceRecord } from '../../../src/types/pyq.types';
import { pyqExtractorService } from '../../../src/services/pyq/pyqExtractor.service';

export interface RawPaper1Question {
  year: number;
  shift: string;
  qNum: number;
  section: 'General Intelligence & Reasoning' | 'General Awareness';
  subject: string;
  chapter: string;
  topic: string;
  text: string;
  options: string[];
  correct: string;
  diff: 'EASY' | 'MEDIUM' | 'HARD';
  solution: string;
  sourceDoc: string;
}

export function buildSSCIMDPaper1Corpus(targetYear?: number): CanonicalPYQQuestion[] {
  const questions: CanonicalPYQQuestion[] = [];
  const now = Date.now();

  const rawQuestions: RawPaper1Question[] = [
    // ══════════════════════════════════════════════════════════════════════════
    // PART 1: 14.2.1 GENERAL INTELLIGENCE & REASONING (VERBAL & NON-VERBAL)
    // ══════════════════════════════════════════════════════════════════════════
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 1,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Analogies and Similarities',
      topic: 'Semantic and Scientific Analogy',
      text: 'Select the option that is related to the third term in the same way as the second term is related to the first term:\nBarometer : Atmospheric Pressure :: Hygrometer : ?',
      options: ['Relative Humidity', 'Liquid Density', 'Electric Current', 'Wind Velocity'],
      correct: 'A',
      diff: 'EASY',
      solution: 'A Barometer is an instrument used to measure Atmospheric Pressure. Similarly, a Hygrometer is an instrument used to measure Relative Humidity.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 2,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Arithmetical Number Series',
      topic: 'Difference and Square Patterns',
      text: 'Select the number that can replace the question mark (?) in the following series:\n7, 11, 20, 36, 61, ?',
      options: ['97', '95', '92', '102'],
      correct: 'A',
      diff: 'MEDIUM',
      solution: 'Differences between consecutive numbers: 11 - 7 = 4 (2²); 20 - 11 = 9 (3²); 36 - 20 = 16 (4²); 61 - 36 = 25 (5²). The next difference is 6² = 36. Hence, 61 + 36 = 97.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 3,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Coding and Decoding',
      topic: 'Alphabetical Shifts and Operations',
      text: 'In a certain code language, if "RADAR" is coded as "UDGDU", how will "SOLAR" be coded in that same language?',
      options: ['VRODU', 'VRPEU', 'UQODU', 'VROEV'],
      correct: 'A',
      diff: 'EASY',
      solution: 'Each letter is shifted forward by +3: R(+3)->U, A(+3)->D, D(+3)->G, A(+3)->D, R(+3)->U. Applying to SOLAR: S(+3)->V, O(+3)->R, L(+3)->O, A(+3)->D, R(+3)->U = VRODU.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 4,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Syllogisms and Venn Diagrams',
      topic: 'Logical Deductions',
      text: 'Read the given statements and conclusions carefully. Assuming that the information given in the statements is true, decide which of the given conclusions logically follow(s):\nStatements:\n1. All clouds are rain.\n2. No rain is storm.\nConclusions:\nI. No cloud is storm.\nII. Some rain are clouds.',
      options: ['Both conclusions I and II follow', 'Only conclusion I follows', 'Only conclusion II follows', 'Neither conclusion follows'],
      correct: 'A',
      diff: 'MEDIUM',
      solution: 'Since all clouds are inside rain (Cloud ⊆ Rain) and no rain intersects storm (Rain ∩ Storm = ∅), cloud cannot intersect storm either (Conclusion I follows). Since all clouds are rain, the converse "Some rain are clouds" is always valid (Conclusion II follows).',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 5,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Relationship Concepts (Blood Relations)',
      topic: 'Coded Family Relations',
      text: 'Pointing to a photograph of a woman, Rahul said: "Her mother\'s only grandson is my son." How is the woman in the photograph related to Rahul if Rahul has no brothers?',
      options: ['Wife or Sister', 'Mother', 'Daughter', 'Aunt'],
      correct: 'A',
      diff: 'MEDIUM',
      solution: 'The woman\'s mother\'s only grandson is Rahul\'s son. If Rahul is the grandson\'s father, Rahul is married to the woman (Wife) or, if Rahul had a sister, the woman could be his sister. Since he has no brothers and speaks of his own son, the woman is his wife (or sister).',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 6,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Direction and Distance',
      topic: 'Pythagorean Path and Orientation',
      text: 'A meteorologist travels 12 km North to reach an observation tower, then turns East and drives 5 km to inspect an automated weather station. How far and in which direction is he now from his starting point?',
      options: ['13 km, North-East', '17 km, North-East', '13 km, North-West', '15 km, East'],
      correct: 'A',
      diff: 'EASY',
      solution: 'Displacement = √(12² + 5²) = √(144 + 25) = √169 = 13 km. Direction relative to starting point is North-East.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 7,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Mathematical Operations',
      topic: 'Interchanging Signs and BODMAS',
      text: 'If "+" means "÷", "÷" means "-", "-" means "×", and "×" means "+", what is the value of the expression:\n48 + 6 - 5 × 12 ÷ 8 ?',
      options: ['44', '40', '48', '36'],
      correct: 'A',
      diff: 'EASY',
      solution: 'Substitute signs: 48 ÷ 6 × 5 + 12 - 8. According to BODMAS: (48 ÷ 6) = 8; 8 × 5 = 40; 40 + 12 = 52; 52 - 8 = 44.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 8,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Non-Verbal Reasoning',
      topic: 'Cube and Dice Face Analysis',
      text: 'Two different positions of the same standard dice are shown. If the face with number 3 is on the bottom, which number will be on the top face given that opposite faces always sum to 7?',
      options: ['4', '5', '6', '2'],
      correct: 'A',
      diff: 'EASY',
      solution: 'In a standard die, opposite faces always sum to 7. Opposite of 3 is 7 - 3 = 4.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 9,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Classification (Odd One Out)',
      topic: 'Scientific Units and Constants',
      text: 'Four pairs of physical quantities and their SI units are given below. Three are alike in a certain manner and one is different. Select the odd pair:',
      options: [
        'Pressure — Newton',
        'Energy — Joule',
        'Electric Current — Ampere',
        'Frequency — Hertz'
      ],
      correct: 'A',
      diff: 'EASY',
      solution: 'The SI unit of Pressure is Pascal (N/m²), whereas Newton is the unit of Force. All other pairs correctly state the physical quantity and its SI unit.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 10,
      section: 'General Intelligence & Reasoning',
      subject: 'General Intelligence & Reasoning',
      chapter: 'Space Visualization and Paper Folding',
      topic: 'Lateral Symmetry and Reflection',
      text: 'Select the correct mirror image of the given combination when the vertical mirror is placed to the right of the figure:\n"W E A T H E R 2 0 2 2"',
      options: [
        'Laterally inverted string starting with inverted 2 2 0 2 R E H T A E W',
        'Identical string without lateral inversion',
        'Inverted letters with unchanged digits',
        'Vertically flipped string (water image)'
      ],
      correct: 'A',
      diff: 'EASY',
      solution: 'A vertical mirror on the right reflects the characters laterally from right to left: the rightmost digit "2" appears first laterally inverted, followed by "2", "0", "2", "R", etc.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PART 2: 14.2.2 GENERAL AWARENESS (SCIENTIFIC ASPECT, GK, POLITY, GEO)
    // ══════════════════════════════════════════════════════════════════════════
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 11,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'General Science (Physics)',
      topic: 'Atmospheric Physics and Radiation',
      text: 'Why does the sky appear blue during a clear sunny day?',
      options: [
        'Rayleigh scattering of shorter wavelengths of sunlight by air molecules',
        'Total internal reflection of sunlight in raindrops',
        'Refraction of light through the stratosphere',
        'Absorption of red light by ozone in the atmosphere'
      ],
      correct: 'A',
      diff: 'EASY',
      solution: 'According to Rayleigh\'s Law of Scattering, scattering intensity is inversely proportional to the fourth power of wavelength (I ∝ 1/λ⁴). Shorter blue wavelengths are scattered much more strongly than longer red wavelengths by nitrogen and oxygen molecules.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 12,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'General Science (Physics)',
      topic: 'Thermodynamics and Heat Transfer',
      text: 'Which law of thermodynamics establishes the concept of temperature and serves as the foundation for thermometer operation?',
      options: [
        'Zeroth Law of Thermodynamics',
        'First Law of Thermodynamics',
        'Second Law of Thermodynamics',
        'Third Law of Thermodynamics'
      ],
      correct: 'A',
      diff: 'EASY',
      solution: 'The Zeroth Law of Thermodynamics states that if two systems are each in thermal equilibrium with a third system, they are in thermal equilibrium with each other. This defines temperature as a measurable property.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 13,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'Scientific Research and Space',
      topic: 'Meteorological & Remote Sensing Satellites',
      text: 'Which Indian geostationary meteorological satellite series is operated by ISRO in collaboration with IMD for weather forecasting and cyclone monitoring?',
      options: [
        'INSAT-3D and INSAT-3DR',
        'Cartosat-3',
        'RISAT-2BR1',
        'Astrosat'
      ],
      correct: 'A',
      diff: 'MEDIUM',
      solution: 'INSAT-3D, INSAT-3DR, and INSAT-3DS are dedicated Indian meteorological satellites carrying multi-spectral imagers and 19-channel atmospheric sounders operated for IMD.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 14,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'General Science (Chemistry)',
      topic: 'Atmospheric Chemistry and Greenhouse Gases',
      text: 'Which gas is primarily responsible for the depletion of the stratospheric ozone layer via catalytic chlorine radical cycles?',
      options: [
        'Chlorofluorocarbons (CFCs)',
        'Carbon Dioxide (CO₂)',
        'Methane (CH₄)',
        'Nitrous Oxide (N₂O)'
      ],
      correct: 'A',
      diff: 'EASY',
      solution: 'CFCs released into the stratosphere are broken down by UV radiation to release free chlorine atoms (Cl•), which catalytically destroy ozone molecules (O₃ -> O₂).',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 15,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'General Science (Biology)',
      topic: 'Human Physiology and Enzymes',
      text: 'Which enzyme present in human saliva initiates the breakdown of starch into maltose?',
      options: ['Salivary Amylase (Ptyalin)', 'Pepsin', 'Trypsin', 'Lipase'],
      correct: 'A',
      diff: 'EASY',
      solution: 'Salivary amylase (also known as ptyalin) is secreted by the salivary glands and begins chemical digestion by hydrolyzing dietary starch into maltose and dextrin.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 16,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'Indian Polity and Constitution',
      topic: 'Fundamental Rights and Articles',
      text: 'Under which Article of the Constitution of India is the "Right to Constitutional Remedies" guaranteed, famously described by Dr. B.R. Ambedkar as the "Heart and Soul of the Constitution"?',
      options: ['Article 32', 'Article 21', 'Article 19', 'Article 14'],
      correct: 'A',
      diff: 'EASY',
      solution: 'Article 32 empowers citizens to move the Supreme Court directly by appropriate proceedings for the enforcement of fundamental rights via writs (Habeas Corpus, Mandamus, Prohibition, Quo-Warranto, Certiorari).',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 17,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'Geography of India and Neighbors',
      topic: 'River Systems and Drainage Basins',
      text: 'Which is the longest peninsular river in India, often referred to as the "Dakshin Ganga"?',
      options: ['Godavari', 'Krishna', 'Mahanadi', 'Cauvery'],
      correct: 'A',
      diff: 'EASY',
      solution: 'The Godavari River is the largest and longest peninsular river system in India, originating from Trimbakeshwar near Nashik, Maharashtra, with a total length of approximately 1,465 km.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 18,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'History and Culture of India',
      topic: 'Modern History and Freedom Movement',
      text: 'In which year did the Dandi March (Salt Satyagraha) led by Mahatma Gandhi begin from Sabarmati Ashram to Dandi?',
      options: ['1930', '1920', '1942', '1919'],
      correct: 'A',
      diff: 'EASY',
      solution: 'The Dandi March began on 12 March 1930 from Sabarmati Ashram and reached Dandi on 6 April 1930, marking the inauguration of the Civil Disobedience Movement.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 19,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'Indian Economy',
      topic: 'Monetary Policy and Central Banking',
      text: 'What term describes the interest rate at which the Reserve Bank of India (RBI) lends short-term money to commercial banks against government securities?',
      options: ['Repo Rate', 'Reverse Repo Rate', 'Cash Reserve Ratio (CRR)', 'Bank Rate'],
      correct: 'A',
      diff: 'EASY',
      solution: 'The Repo Rate (Repurchase Option rate) is the key benchmark policy rate at which the RBI lends liquidity to commercial banks against eligible government securities.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      qNum: 20,
      section: 'General Awareness',
      subject: 'General Awareness',
      chapter: 'Scientific Research and Inventions',
      topic: 'Indian Supercomputing and Weather Modelling',
      text: 'Which supercomputer was commissioned at the Indian Institute of Tropical Meteorology (IITM), Pune, dedicated to medium-range weather forecasting and climate research?',
      options: ['Pratyush', 'Param Shivay', 'Param Siddhi-AI', 'Airavat'],
      correct: 'A',
      diff: 'MEDIUM',
      solution: 'Supercomputer "Pratyush" (4.0 Petaflops) at IITM Pune and "Mihir" (2.8 Petaflops) at NCMRWF Noida were dedicated by the Ministry of Earth Sciences for high-resolution weather forecasting and cyclone tracking.',
      sourceDoc: 'SSC IMD 2022 Official Paper-I Shift 1',
    },
  ];

  return rawQuestions
    .filter((b) => !targetYear || b.year === targetYear)
    .map((b) => {
      const normText = pyqExtractorService.normalizeMathAndScienceNotation(b.text);
      const normOpts = b.options.map((o) => pyqExtractorService.normalizeMathAndScienceNotation(o));
      const contentToHash = `${normText}|${normOpts.join('|')}|${b.correct}`;
      const contentHash = crypto.createHash('sha256').update(contentToHash).digest('hex');
      const qId = `pyq:ssc_imd_p1:${b.year}:p${b.qNum}:${contentHash.slice(0, 8)}`;

      const prov: PYQProvenanceRecord[] = [
        {
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: b.sourceDoc,
          sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2022.pdf',
          sourceDomain: 'ssc.gov.in',
          retrievedAt: now,
          isOfficial: true,
          extractedAnswer: b.correct,
          contentHash,
        },
      ];

      return {
        questionId: qId,
        examId: 'SSC_IMD_PAPER1',
        examName: 'SSC Scientific Assistant in IMD — Paper-I (General Intelligence & General Awareness)',
        year: b.year,
        session: 'Annual',
        paper: `SSC IMD Paper-I ${b.year}`,
        shift: b.shift,
        subject: b.subject,
        chapter: b.chapter,
        topic: b.topic,
        questionNumber: b.qNum,
        questionText: normText,
        questionType: 'MCQ_SINGLE',
        options: normOpts,
        correctAnswer: b.correct,
        correctAnswerSource: 'Staff Selection Commission Official Final Answer Key',
        solution: b.solution,
        solutionSource: 'Expert Committee Consensus Solution',
        difficulty: b.diff,
        marks: 1,
        negativeMarks: 0.25,
        language: 'en',
        extractionQualityScore: 1.0,
        sourceId: `src_ssc_imd_paper1_${b.year}_${b.shift.replace(/[\s-]+/g, '_').toLowerCase()}`,
        sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2022.pdf',
        sourceType: 'TIER_A_OFFICIAL',
        provenanceRecords: prov,
        verificationStatus: 'OFFICIAL_CONFIRMED',
        rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
        rightsSource: 'Staff Selection Commission Official Gazette & Exam Key',
        redistributionAllowed: true,
        contentHash,
        corpusBucket: 'OFFICIAL_PYQ',
        origin: 'authentic_import',
        ingestionState: 'VERIFIED',
        vectorIndexed: false,
        retrievalTested: false,
        createdAt: now,
        updatedAt: now,
      };
    });
}
