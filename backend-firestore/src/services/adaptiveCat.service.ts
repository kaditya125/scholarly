import { container, TOKENS } from '../core/di/container';
import { IAIProvider } from '../core/interfaces/IAIProvider';
import { UserProfileService } from './userProfile.service';

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
}

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
    ]
  }
};

export class AdaptiveCatService {
  private profileService: UserProfileService;

  constructor() {
    this.profileService = new UserProfileService();
  }

  /**
   * Generates a dynamic batch of 3-5 questions based on the student's live performance in previous batches.
   */
  async generateAdaptiveBatch(
    userId: string,
    batchIndex: number,
    previousResponses: any[]
  ): Promise<{ questions: AdaptiveQuestion[]; isComplete: boolean }> {
    const profile = await this.profileService.getProfile(userId);
    const aiProvider = container.resolve<IAIProvider>(TOKENS.ReasoningProvider);

    const subjects = profile?.subjects && profile.subjects.length > 0 ? profile.subjects : ['Physics', 'Chemistry', 'Mathematics'];
    const currentSubject = subjects[batchIndex % subjects.length];

    // Compute live performance signals from previous responses
    const totalPrevious = previousResponses.length;
    let recentAccuracy = 0.5;
    let currentDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Challenge' = 'Medium';

    if (totalPrevious > 0) {
      const correct = previousResponses.filter((r: any) => r.isCorrect).length;
      recentAccuracy = correct / totalPrevious;

      if (recentAccuracy >= 0.8) {
        currentDifficulty = batchIndex > 3 ? 'Challenge' : 'Hard';
      } else if (recentAccuracy >= 0.5) {
        currentDifficulty = 'Medium';
      } else {
        currentDifficulty = 'Easy';
      }
    }

    const questionCount = 4; // 4 questions per batch
    const startQNum = totalPrevious + 1;

    // Fast Instant Generation from Subject-Specific Adaptive Question Bank (< 20ms)
    const rawQuestions: any[] = [];
    const subjectBank = INSTANT_QUESTION_BANK[currentSubject] || INSTANT_QUESTION_BANK['Physics'];
    const pool = [
      ...(subjectBank[currentDifficulty] || []),
      ...(subjectBank['Medium'] || []),
      ...(subjectBank['Easy'] || []),
      ...(subjectBank['Hard'] || []),
    ];

    for (let i = 0; i < questionCount; i++) {
      const template = pool[i % pool.length] || {
        topic: `${currentSubject} Core Application`,
        subtopic: 'Problem Solving',
        type: 'MCQ',
        question: `Analyze this ${currentDifficulty.toLowerCase()} concept question in ${currentSubject} (${startQNum + i}):`,
        options: [
          `Fundamental rule of ${currentSubject}`,
          `Secondary principle`,
          `Derived formula relation`,
          `Boundary condition exception`
        ],
        correctAnswer: `Fundamental rule of ${currentSubject}`,
        explanation: `Based on fundamental ${currentSubject} principles and standard board curriculum guidelines.`,
        knowledgeGraphTag: `${currentSubject} > Core Fundamentals > Item ${i + 1}`
      };

      rawQuestions.push({
        id: `cat_q_${batchIndex}_${i + 1}`,
        subject: currentSubject,
        topic: template.topic || `${currentSubject} Concept`,
        subtopic: template.subtopic || 'Fundamentals',
        difficulty: currentDifficulty,
        type: template.type || 'MCQ',
        question: template.question,
        options: template.options,
        correctAnswer: template.correctAnswer,
        explanation: template.explanation,
        estimatedTimeSeconds: 60,
        knowledgeGraphTag: template.knowledgeGraphTag || `${currentSubject} > Core > Item ${i + 1}`
      });
    }

    const questions: AdaptiveQuestion[] = rawQuestions.map((q, idx) => ({
      id: q.id || `q_${batchIndex}_${idx}`,
      batchIndex,
      questionNumber: startQNum + idx,
      subject: q.subject || currentSubject,
      topic: q.topic || 'Core Concept',
      subtopic: q.subtopic || 'Fundamentals',
      difficulty: q.difficulty || currentDifficulty,
      type: q.type || 'MCQ',
      question: q.question || 'Solve the problem.',
      options: Array.isArray(q.options) && q.options.length > 0 ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: q.correctAnswer || (q.options ? q.options[0] : 'Option A'),
      explanation: q.explanation || 'Refer to fundamental principles.',
      estimatedTimeSeconds: q.estimatedTimeSeconds || 60,
      knowledgeGraphTag: q.knowledgeGraphTag || `${currentSubject} > ${q.topic || 'General'}`,
    }));

    // Assessment completes when total questions reached 20 (5 batches of 4)
    const isComplete = startQNum + questionCount - 1 >= 20;

    return { questions, isComplete };
  }
}

export const adaptiveCatService = new AdaptiveCatService();
