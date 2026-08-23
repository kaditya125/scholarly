import { UserProfileService } from './userProfile.service';
import { GeminiProvider } from './ai/gemini.provider';
import { logger } from '../utils/logger';

export interface AdaptiveQuestion {
  id: string;
  batchIndex: number;
  questionNumber: number;
  subject: string;
  topic: string;
  subtopic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Challenge';
  type: 'MCQ' | 'Assertion-Reason' | 'Match' | 'Numerical' | 'Short Answer' | 'Case-Based';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  estimatedTimeSeconds: number;
  knowledgeGraphTag: string;
  identityStatus: 'UNANCHORED';
  isLegacyDemo: boolean;
}

/**
 * Multi-subject offline fallback bank for instant loading or when AI is unavailable.
 */
const INSTANT_QUESTION_BANK: Record<string, Record<string, Partial<AdaptiveQuestion>[]>> = {
  Physics: {
    Easy: [
      {
        topic: 'Kinematics', subtopic: 'Speed & Velocity', type: 'MCQ',
        question: 'Which of the following physical quantities is a vector quantity?',
        options: ['Distance', 'Speed', 'Velocity', 'Energy'],
        correctAnswer: 'Velocity', explanation: 'Velocity has both magnitude and direction, making it a vector quantity.',
        knowledgeGraphTag: 'Physics > Kinematics > Vectors'
      },
      {
        topic: 'Work & Energy', subtopic: 'Kinetic Energy', type: 'MCQ',
        question: 'What happens to the kinetic energy of a body if its velocity is doubled?',
        options: ['Doubled', 'Halved', 'Quadrupled', 'Remains Same'],
        correctAnswer: 'Quadrupled', explanation: 'Kinetic Energy KE = (1/2)mv^2, so doubling v quadruples KE.',
        knowledgeGraphTag: 'Physics > Energy > Kinetic Energy'
      }
    ],
    Medium: [
      {
        topic: 'Laws of Motion', subtopic: 'Newton’s Second Law', type: 'MCQ',
        question: 'A force of 20 N acts on a mass of 4 kg. What is the acceleration produced?',
        options: ['2 m/s²', '5 m/s²', '10 m/s²', '80 m/s²'],
        correctAnswer: '5 m/s²', explanation: 'Using F = ma, a = F / m = 20 / 4 = 5 m/s².',
        knowledgeGraphTag: 'Physics > Dynamics > Force & Acceleration'
      },
      {
        topic: 'Electricity', subtopic: 'Ohm’s Law', type: 'MCQ',
        question: 'If the resistance of a conductor is doubled while voltage remains constant, current becomes:',
        options: ['Doubled', 'Halved', 'Four times', 'Unchanged'],
        correctAnswer: 'Halved', explanation: 'Current I = V / R. Doubling R halves current I.',
        knowledgeGraphTag: 'Physics > Current Electricity > Ohm’s Law'
      }
    ],
    Hard: [
      {
        topic: 'Electromagnetism', subtopic: 'Induction', type: 'MCQ',
        question: 'Lenz’s law is a direct consequence of which fundamental conservation law?',
        options: ['Conservation of Charge', 'Conservation of Momentum', 'Conservation of Energy', 'Conservation of Mass'],
        correctAnswer: 'Conservation of Energy', explanation: 'Lenz’s law ensures electrical energy induced comes from mechanical work done, obeying Conservation of Energy.',
        knowledgeGraphTag: 'Physics > Electromagnetism > Lenz Law'
      }
    ],
    Challenge: [
      {
        topic: 'Optics', subtopic: 'Wave Optics', type: 'MCQ',
        question: 'In Young’s double slit experiment, if slit separation is halved and screen distance is doubled, fringe width:',
        options: ['Remains same', 'Doubles', 'Becomes 4 times', 'Halves'],
        correctAnswer: 'Becomes 4 times', explanation: 'Fringe width β = λD / d. Doubling D and halving d multiplies β by 4.',
        knowledgeGraphTag: 'Physics > Wave Optics > Fringe Width'
      }
    ]
  },
  Chemistry: {
    Easy: [
      {
        topic: 'Chemical Reactions', subtopic: 'Types of Reactions', type: 'MCQ',
        question: 'Which of the following is an example of an exothermic reaction?',
        options: ['Photosynthesis', 'Respiration', 'Evaporation of water', 'Melting of ice'],
        correctAnswer: 'Respiration', explanation: 'Respiration releases thermal energy when glucose reacts with oxygen.',
        knowledgeGraphTag: 'Chemistry > Reactions > Exothermic'
      }
    ],
    Medium: [
      {
        topic: 'Periodic Table', subtopic: 'Trends', type: 'MCQ',
        question: 'Which element has the highest electronegativity in the periodic table?',
        options: ['Oxygen', 'Chlorine', 'Fluorine', 'Nitrogen'],
        correctAnswer: 'Fluorine', explanation: 'Fluorine has the highest Pauling electronegativity value of 4.0.',
        knowledgeGraphTag: 'Chemistry > Periodic Trends > Electronegativity'
      }
    ],
    Hard: [
      {
        topic: 'Organic Chemistry', subtopic: 'Hydrocarbons', type: 'MCQ',
        question: 'Which functional group is present in aldehydes?',
        options: ['-COOH', '-CHO', '-OH', '-CO-'],
        correctAnswer: '-CHO', explanation: 'Aldehydes contain the terminal formyl group -CHO.',
        knowledgeGraphTag: 'Chemistry > Organic > Functional Groups'
      }
    ],
    Challenge: [
      {
        topic: 'Thermodynamics', subtopic: 'Gibbs Free Energy', type: 'MCQ',
        question: 'A reaction is spontaneous at all temperatures when:',
        options: ['ΔH < 0 and ΔS > 0', 'ΔH > 0 and ΔS > 0', 'ΔH < 0 and ΔS < 0', 'ΔH > 0 and ΔS < 0'],
        correctAnswer: 'ΔH < 0 and ΔS > 0', explanation: 'ΔG = ΔH - TΔS is always negative when ΔH < 0 and ΔS > 0.',
        knowledgeGraphTag: 'Chemistry > Thermodynamics > Spontaneity'
      }
    ]
  },
  Mathematics: {
    Easy: [
      {
        topic: 'Algebra', subtopic: 'Quadratic Equations', type: 'MCQ',
        question: 'If the discriminant of a quadratic equation is zero, its roots are:',
        options: ['Real and equal', 'Real and distinct', 'Imaginary', 'Zero'],
        correctAnswer: 'Real and equal', explanation: 'When D = b² - 4ac = 0, the equation has two real and equal roots.',
        knowledgeGraphTag: 'Mathematics > Algebra > Quadratic Roots'
      }
    ],
    Medium: [
      {
        topic: 'Trigonometry', subtopic: 'Identities', type: 'MCQ',
        question: 'What is the value of sin²(θ) + cos²(θ)?',
        options: ['0', '1', '2', 'tan(θ)'],
        correctAnswer: '1', explanation: 'Pythagorean trigonometric identity states sin²(θ) + cos²(θ) = 1.',
        knowledgeGraphTag: 'Mathematics > Trigonometry > Fundamental Identity'
      }
    ],
    Hard: [
      {
        topic: 'Calculus', subtopic: 'Differentiation', type: 'MCQ',
        question: 'What is the derivative of sin(x²) with respect to x?',
        options: ['cos(x²)', '2x cos(x²)', '-cos(x²)', '2x sin(x²)'],
        correctAnswer: '2x cos(x²)', explanation: 'Using the chain rule: d/dx[sin(u)] = cos(u) * du/dx = 2x cos(x²).',
        knowledgeGraphTag: 'Mathematics > Calculus > Chain Rule'
      }
    ],
    Challenge: [
      {
        topic: 'Probability', subtopic: 'Conditional Probability', type: 'MCQ',
        question: 'If P(A) = 0.6, P(B) = 0.5, and P(A ∩ B) = 0.3, what is P(A|B)?',
        options: ['0.3', '0.5', '0.6', '0.8'],
        correctAnswer: '0.6', explanation: 'P(A|B) = P(A ∩ B) / P(B) = 0.3 / 0.5 = 0.6.',
        knowledgeGraphTag: 'Mathematics > Probability > Conditional'
      }
    ]
  },
  'Reasoning': {
    Easy: [
      {
        topic: 'Analogy', subtopic: 'Word Relationship', type: 'MCQ',
        question: 'Book is to Reading as Fork is to:',
        options: ['Eating', 'Writing', 'Cooking', 'Drinking'],
        correctAnswer: 'Eating', explanation: 'A book is a tool used for reading; a fork is a tool used for eating.',
        knowledgeGraphTag: 'Reasoning > Verbal > Analogy'
      },
      {
        topic: 'Number Series', subtopic: 'Arithmetic Progression', type: 'MCQ',
        question: 'Find the next number in the series: 4, 9, 14, 19, ?',
        options: ['22', '24', '25', '29'],
        correctAnswer: '24', explanation: 'The series increments by +5 at each step: 19 + 5 = 24.',
        knowledgeGraphTag: 'Reasoning > Series > Number Series'
      }
    ],
    Medium: [
      {
        topic: 'Coding-Decoding', subtopic: 'Letter Shift', type: 'MCQ',
        question: 'In a certain code, if CAT is written as DBU, how is DOG written in that code?',
        options: ['EPH', 'EPF', 'FQI', 'DPH'],
        correctAnswer: 'EPH', explanation: 'Each letter is shifted forward by +1 in the alphabet (D->E, O->P, G->H).',
        knowledgeGraphTag: 'Reasoning > Coding > Letter Shift'
      },
      {
        topic: 'Direction Sense', subtopic: 'Cardinal Navigation', type: 'MCQ',
        question: 'A person walks 5 km North, turns right and walks 3 km, then turns right and walks 5 km. In which direction is he from the start?',
        options: ['North', 'East', 'South', 'West'],
        correctAnswer: 'East', explanation: 'The North and South 5 km movements cancel out, leaving the person 3 km East of the starting point.',
        knowledgeGraphTag: 'Reasoning > Spatial > Direction Sense'
      }
    ],
    Hard: [
      {
        topic: 'Syllogism', subtopic: 'Logical Deductions', type: 'MCQ',
        question: 'Statements: All mangoes are golden. No golden things are cheap. Conclusion: Mangoes are not cheap.',
        options: ['Conclusion follows', 'Conclusion does not follow', 'Either follows', 'Neither follows'],
        correctAnswer: 'Conclusion follows', explanation: 'Since all mangoes belong to golden, and golden is disjoint from cheap, mangoes are not cheap.',
        knowledgeGraphTag: 'Reasoning > Logic > Syllogisms'
      }
    ],
    Challenge: [
      {
        topic: 'Seating Arrangement', subtopic: 'Circular Permutations', type: 'MCQ',
        question: 'Six friends A, B, C, D, E, F sit in a circle facing inward. If A is opposite D and B is to the immediate right of A, who is opposite B?',
        options: ['E', 'C', 'F', 'Cannot be determined without more info'],
        correctAnswer: 'Cannot be determined without more info', explanation: 'With 6 seats, the seat opposite B depends on the placement of C, E, and F.',
        knowledgeGraphTag: 'Reasoning > Analytical > Seating Arrangement'
      }
    ]
  },
  'General Awareness': {
    Easy: [
      {
        topic: 'Indian Polity', subtopic: 'Constitution Basics', type: 'MCQ',
        question: 'Who is known as the Father of the Indian Constitution?',
        options: ['Dr. B.R. Ambedkar', 'Mahatma Gandhi', 'Jawaharlal Nehru', 'Sardar Vallabhbhai Patel'],
        correctAnswer: 'Dr. B.R. Ambedkar', explanation: 'Dr. B.R. Ambedkar was the Chairman of the Drafting Committee of the Constituent Assembly.',
        knowledgeGraphTag: 'General Awareness > Polity > Constitution'
      }
    ],
    Medium: [
      {
        topic: 'Geography', subtopic: 'Rivers of India', type: 'MCQ',
        question: 'Which river is known as the "Dakshin Ganga"?',
        options: ['Godavari', 'Krishna', 'Cauvery', 'Mahanadi'],
        correctAnswer: 'Godavari', explanation: 'Godavari is the largest river system in peninsular India, hence called Dakshin Ganga.',
        knowledgeGraphTag: 'General Awareness > Geography > Rivers'
      }
    ],
    Hard: [
      {
        topic: 'Economics', subtopic: 'Monetary Policy', type: 'MCQ',
        question: 'The rate at which RBI lends money to commercial banks against government securities is known as:',
        options: ['Repo Rate', 'Reverse Repo Rate', 'Bank Rate', 'CRR'],
        correctAnswer: 'Repo Rate', explanation: 'Repo (Repurchasing Option) Rate is the benchmark rate at which the central bank lends short-term funds to commercial banks.',
        knowledgeGraphTag: 'General Awareness > Economy > Monetary Policy'
      }
    ],
    Challenge: [
      {
        topic: 'Modern History', subtopic: 'Freedom Movement', type: 'MCQ',
        question: 'The famous "Poona Pact" of 1932 was signed between Mahatma Gandhi and:',
        options: ['Dr. B.R. Ambedkar', 'Lord Irwin', 'Muhammad Ali Jinnah', 'Subhash Chandra Bose'],
        correctAnswer: 'Dr. B.R. Ambedkar', explanation: 'The Poona Pact was agreed upon in Yerwada Central Jail between Gandhi and Ambedkar on reserved legislative seats.',
        knowledgeGraphTag: 'General Awareness > History > Modern India'
      }
    ]
  },
  'Quantitative Aptitude': {
    Easy: [
      {
        topic: 'Percentage', subtopic: 'Basic Calculation', type: 'MCQ',
        question: 'If 25% of a number is 60, what is the number?',
        options: ['240', '180', '150', '300'],
        correctAnswer: '240', explanation: 'Number = 60 / 0.25 = 240.',
        knowledgeGraphTag: 'Quantitative Aptitude > Arithmetic > Percentages'
      }
    ],
    Medium: [
      {
        topic: 'Profit & Loss', subtopic: 'Cost & Selling Price', type: 'MCQ',
        question: 'An item bought for ₹800 is sold for ₹1000. What is the profit percentage?',
        options: ['20%', '25%', '30%', '15%'],
        correctAnswer: '25%', explanation: 'Profit = ₹200. Profit % = (200 / 800) * 100 = 25%.',
        knowledgeGraphTag: 'Quantitative Aptitude > Arithmetic > Profit & Loss'
      }
    ],
    Hard: [
      {
        topic: 'Time & Work', subtopic: 'Combined Efficiency', type: 'MCQ',
        question: 'A can finish a work in 12 days and B in 24 days. Working together, in how many days will they finish it?',
        options: ['8 days', '6 days', '9 days', '10 days'],
        correctAnswer: '8 days', explanation: 'Combined rate = 1/12 + 1/24 = 3/24 = 1/8. Total days = 8.',
        knowledgeGraphTag: 'Quantitative Aptitude > Arithmetic > Time & Work'
      }
    ],
    Challenge: [
      {
        topic: 'Speed & Distance', subtopic: 'Relative Speed', type: 'MCQ',
        question: 'Two trains 150m and 250m long run towards each other at 54 km/h and 90 km/h. How many seconds do they take to cross each other?',
        options: ['10 seconds', '12 seconds', '8 seconds', '15 seconds'],
        correctAnswer: '10 seconds', explanation: 'Relative speed = 54 + 90 = 144 km/h = 40 m/s. Total distance = 150 + 250 = 400m. Time = 400 / 40 = 10s.',
        knowledgeGraphTag: 'Quantitative Aptitude > Arithmetic > Time & Distance'
      }
    ]
  },
  'Biology': {
    Easy: [
      {
        topic: 'Cell Biology', subtopic: 'Organelles', type: 'MCQ',
        question: 'Which cell organelle is known as the "Powerhouse of the Cell"?',
        options: ['Mitochondria', 'Ribosome', 'Golgi apparatus', 'Nucleus'],
        correctAnswer: 'Mitochondria', explanation: 'Mitochondria generate most of the cell\'s supply of adenosine triphosphate (ATP), used as a source of chemical energy.',
        knowledgeGraphTag: 'Biology > Cell Structure > Mitochondria'
      }
    ],
    Medium: [
      {
        topic: 'Genetics', subtopic: 'Mendelian Inheritance', type: 'MCQ',
        question: 'What is the phenotypic ratio of a monohybrid cross in the F2 generation under complete dominance?',
        options: ['3:1', '1:2:1', '9:3:3:1', '1:1'],
        correctAnswer: '3:1', explanation: 'Mendel\'s monohybrid F2 phenotypic ratio is 3 dominant to 1 recessive (3:1).',
        knowledgeGraphTag: 'Biology > Genetics > Mendelian Ratios'
      }
    ],
    Hard: [
      {
        topic: 'Human Physiology', subtopic: 'Cardiovascular', type: 'MCQ',
        question: 'Which heart chamber pumps oxygenated blood into the systemic aorta?',
        options: ['Left Ventricle', 'Right Ventricle', 'Left Atrium', 'Right Atrium'],
        correctAnswer: 'Left Ventricle', explanation: 'The left ventricle receives oxygenated blood from the left atrium and contracts forcefully into the aorta.',
        knowledgeGraphTag: 'Biology > Human Physiology > Circulatory System'
      }
    ],
    Challenge: [
      {
        topic: 'Biomolecules', subtopic: 'Enzyme Kinetics', type: 'MCQ',
        question: 'Competitive enzyme inhibitors affect which kinetic parameter?',
        options: ['Increases Km, Vmax unchanged', 'Decreases Vmax, Km unchanged', 'Decreases both Km and Vmax', 'Increases Vmax'],
        correctAnswer: 'Increases Km, Vmax unchanged', explanation: 'Competitive inhibitors compete with substrate for active site, raising the apparent Km without altering Vmax.',
        knowledgeGraphTag: 'Biology > Biochemistry > Enzyme Kinetics'
      }
    ]
  },
  'English': {
    Easy: [
      {
        topic: 'Vocabulary', subtopic: 'Synonyms', type: 'MCQ',
        question: 'Choose the synonym of the word "BENEVOLENT":',
        options: ['Kind', 'Hostile', 'Cruel', 'Greedy'],
        correctAnswer: 'Kind', explanation: 'Benevolent means well-meaning, generous, and kindly.',
        knowledgeGraphTag: 'English > Vocabulary > Synonyms'
      }
    ],
    Medium: [
      {
        topic: 'Grammar', subtopic: 'Subject-Verb Agreement', type: 'MCQ',
        question: 'Identify the grammatically correct sentence:',
        options: [
          'Neither of the students was present.',
          'Neither of the students were present.',
          'Neither of the students are present.',
          'Neither of the student were present.'
        ],
        correctAnswer: 'Neither of the students was present.', explanation: '"Neither" as a singular pronoun takes a singular verb "was".',
        knowledgeGraphTag: 'English > Grammar > Subject-Verb Agreement'
      }
    ],
    Hard: [
      {
        topic: 'Idioms & Phrases', subtopic: 'Usage', type: 'MCQ',
        question: 'What is the meaning of the idiom "Burn the midnight oil"?',
        options: [
          'Work or study late into the night',
          'Waste precious energy',
          'Cause accidental damage',
          'Celebrate late at night'
        ],
        correctAnswer: 'Work or study late into the night', explanation: '"Burn the midnight oil" refers to working or studying late into the night.',
        knowledgeGraphTag: 'English > Idioms > Standard Meanings'
      }
    ],
    Challenge: [
      {
        topic: 'Sentence Correction', subtopic: 'Subjunctive Mood', type: 'MCQ',
        question: 'Choose the correct form: "If I _____ you, I would accept the offer."',
        options: ['were', 'was', 'am', 'had been'],
        correctAnswer: 'were', explanation: 'Hypothetical or contrary-to-fact conditional clauses use the subjunctive "were".',
        knowledgeGraphTag: 'English > Grammar > Subjunctive Mood'
      }
    ]
  }
};

export class AdaptiveCatService {
  private profileService: UserProfileService;
  private llm: GeminiProvider;

  constructor() {
    this.profileService = new UserProfileService();
    this.llm = new GeminiProvider();
  }

  /**
   * Generates a dynamic batch of 4 questions tailored to the student's exam and subjects.
   */
  async generateAdaptiveBatch(
    userId: string,
    batchIndex: number,
    previousResponses: any[]
  ): Promise<{
    questions: AdaptiveQuestion[];
    isComplete: boolean;
    unsupportedSubjects: string[];
    offProfile: boolean;
  }> {
    const profile = await this.profileService.getProfile(userId);
    const targetExam = profile?.targetExam || profile?.goal || 'General Exam';

    // Infer or select real subjects for this student's exam
    const requested = Array.isArray(profile?.subjects) && profile.subjects.length > 0 ? profile.subjects : [];
    let subjects = requested;

    if (subjects.length === 0) {
      const examLower = targetExam.toLowerCase();
      if (examLower.includes('ssc') || examLower.includes('cgl') || examLower.includes('bank') || examLower.includes('govt')) {
        subjects = ['Reasoning', 'Quantitative Aptitude', 'General Awareness', 'English'];
      } else if (examLower.includes('neet') || examLower.includes('medical')) {
        subjects = ['Biology', 'Physics', 'Chemistry'];
      } else if (examLower.includes('jee') || examLower.includes('engineering')) {
        subjects = ['Mathematics', 'Physics', 'Chemistry'];
      } else if (examLower.includes('upsc') || examLower.includes('civil')) {
        subjects = ['General Awareness', 'Reasoning', 'Quantitative Aptitude', 'English'];
      } else if (examLower.includes('class 10') || examLower.includes('cbse') || examLower.includes('icse')) {
        subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology'];
      } else {
        subjects = ['Quantitative Aptitude', 'Reasoning', 'General Awareness', 'English'];
      }
    }

    const currentSubject = subjects[batchIndex % subjects.length];
    const totalPrevious = previousResponses.length;

    // Determine dynamic difficulty calibration
    let currentDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Challenge' = 'Medium';
    if (totalPrevious > 0) {
      const correct = previousResponses.filter((r: any) => r.isCorrect).length;
      const recentAccuracy = correct / totalPrevious;
      if (recentAccuracy >= 0.8) {
        currentDifficulty = batchIndex > 2 ? 'Challenge' : 'Hard';
      } else if (recentAccuracy >= 0.5) {
        currentDifficulty = 'Medium';
      } else {
        currentDifficulty = 'Easy';
      }
    }

    const questionCount = 4;
    const startQNum = totalPrevious + 1;
    let questions: AdaptiveQuestion[] = [];

    // Attempt 1: Generate dynamic, syllabus-accurate questions with Gemini AI
    try {
      const prompt = `Generate exactly ${questionCount} multiple-choice diagnostic test questions for a student.
Target Exam: ${targetExam}
Subject: ${currentSubject}
Difficulty: ${currentDifficulty}
Question numbering starts at #${startQNum}.

Rules:
- Questions must be syllabus-accurate and realistic for ${targetExam}.
- Each question must have EXACTLY 4 options.
- "correctAnswer" must match one of the 4 options verbatim.
- "explanation" must be 1-2 clear, informative sentences.
- "topic" and "subtopic" should be real curriculum topics.

Output ONLY a raw JSON array of ${questionCount} objects (no markdown, no formatting fences):
[
  {
    "topic": "Topic Name",
    "subtopic": "Subtopic Name",
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A",
    "explanation": "Why Option A is correct",
    "knowledgeGraphTag": "${currentSubject} > Topic > Subtopic"
  }
]`;

      const aiResp = await this.llm.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        'You are an expert exam question author. Output strictly valid JSON arrays without markdown ticks.',
        { userId, operation: 'baseline_adaptive_cat', temperature: 0.6 }
      );

      let raw = (aiResp.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        questions = parsed.slice(0, questionCount).map((q, idx) => {
          const opts = Array.isArray(q.options) && q.options.length === 4
            ? q.options.map((o: any) => String(o).trim())
            : ['Option A', 'Option B', 'Option C', 'Option D'];
          const correct = q.correctAnswer ? String(q.correctAnswer).trim() : opts[0];
          return {
            id: `cat_ai_${batchIndex}_${startQNum + idx}_${Date.now()}`,
            batchIndex,
            questionNumber: startQNum + idx,
            subject: currentSubject,
            topic: String(q.topic || `${currentSubject} Core`).trim(),
            subtopic: String(q.subtopic || 'Fundamentals').trim(),
            difficulty: currentDifficulty,
            type: 'MCQ' as const,
            question: String(q.question || q.text || '').trim(),
            options: opts,
            correctAnswer: opts.includes(correct) ? correct : opts[0],
            explanation: String(q.explanation || 'Refer to core concepts.').trim(),
            estimatedTimeSeconds: 60,
            knowledgeGraphTag: String(q.knowledgeGraphTag || `${currentSubject} > ${q.topic || 'General'}`).trim(),
            identityStatus: 'UNANCHORED' as const,
            isLegacyDemo: false,
          };
        }).filter(q => q.question.length > 0 && q.options?.length === 4);
      }
    } catch (err: any) {
      logger.warn('[AdaptiveCat] LLM generation skipped/fell back to offline pool', {
        userId, targetExam, currentSubject, error: err?.message,
      });
    }

    // Fallback: If AI is unavailable or returned incomplete results, use the multi-subject bank
    if (!questions || questions.length < questionCount) {
      // Find closest matching subject key in bank
      const bankKeys = Object.keys(INSTANT_QUESTION_BANK);
      const matchedKey = bankKeys.find(k => k.toLowerCase() === currentSubject.toLowerCase())
        || bankKeys.find(k => currentSubject.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(currentSubject.toLowerCase()))
        || 'Reasoning';

      const subjectBank = INSTANT_QUESTION_BANK[matchedKey] || INSTANT_QUESTION_BANK['Reasoning'];
      const pool = [
        ...(subjectBank[currentDifficulty] || []),
        ...(subjectBank['Medium'] || []),
        ...(subjectBank['Easy'] || []),
        ...(subjectBank['Hard'] || []),
      ];

      const needed = questionCount - questions.length;
      for (let i = 0; i < needed; i++) {
        const template = pool[i % pool.length] || {
          topic: `${currentSubject} Core`,
          subtopic: 'Application',
          type: 'MCQ',
          question: `Analyze this fundamental ${currentSubject} concept for ${targetExam} (#${startQNum + questions.length}):`,
          options: ['Concept Principle A', 'Concept Principle B', 'Concept Principle C', 'Concept Principle D'],
          correctAnswer: 'Concept Principle A',
          explanation: `Fundamental concept for ${currentSubject} under ${targetExam}.`,
          knowledgeGraphTag: `${currentSubject} > Fundamentals`
        };

        questions.push({
          id: `cat_fb_${batchIndex}_${startQNum + questions.length}`,
          batchIndex,
          questionNumber: startQNum + questions.length,
          subject: currentSubject,
          topic: template.topic || `${currentSubject} Concept`,
          subtopic: template.subtopic || 'Fundamentals',
          difficulty: currentDifficulty,
          type: 'MCQ' as const,
          question: template.question || `Core problem in ${currentSubject}`,
          options: template.options || ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: template.correctAnswer || 'Option A',
          explanation: template.explanation || `Core ${currentSubject} principle.`,
          estimatedTimeSeconds: 60,
          knowledgeGraphTag: template.knowledgeGraphTag || `${currentSubject} > General`,
          identityStatus: 'UNANCHORED' as const,
          isLegacyDemo: true,
        });
      }
    }

    const isComplete = startQNum + questionCount - 1 >= 20;
    return {
      questions,
      isComplete,
      unsupportedSubjects: [],
      offProfile: false,
    };
  }
}

export const adaptiveCatService = new AdaptiveCatService();
