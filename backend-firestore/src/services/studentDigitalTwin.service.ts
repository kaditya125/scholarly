import { db } from '../config/firebase';
import { StudentDigitalTwin } from '../types/studentDigitalTwin.types';
import { UserProfileService } from './userProfile.service';
import { container, TOKENS } from '../core/di/container';
import { IAIProvider } from '../core/interfaces/IAIProvider';

export class StudentDigitalTwinService {
  private profileService: UserProfileService;

  constructor() {
    this.profileService = new UserProfileService();
  }

  /**
   * Retrieves the student digital twin for a user from Firestore.
   */
  async getDigitalTwin(userId: string): Promise<StudentDigitalTwin | null> {
    try {
      const docRef = db.collection('users').doc(userId).collection('profile').doc('studentDigitalTwin');
      const docSnap = await docRef.get();
      if (!docSnap.exists) return null;
      return docSnap.data() as StudentDigitalTwin;
    } catch (error) {
      console.warn(`StudentDigitalTwinService: Failed to fetch digital twin for ${userId}`, error);
      return null;
    }
  }

  /**
   * Incremental real-time update to the Digital Twin from any platform event
   * (e.g. after a Practice Test, AI Tutor Chat, Notebook generation, Flashcard review).
   */
  async updateDigitalTwinIncremental(
    userId: string,
    patch: Partial<StudentDigitalTwin>,
    sourceEvent: string
  ): Promise<StudentDigitalTwin | null> {
    try {
      const current = await this.getDigitalTwin(userId);
      const docRef = db.collection('users').doc(userId).collection('profile').doc('studentDigitalTwin');

      const updatedVersion = (current?.version || 0) + 1;
      const updated: Partial<StudentDigitalTwin> = {
        ...current,
        ...patch,
        userId,
        updatedAt: Date.now(),
        version: updatedVersion,
      };

      await docRef.set(updated, { merge: true });
      console.log(`🧠 Updated Student Digital Twin v${updatedVersion} for user ${userId} via ${sourceEvent}`);
      return updated as StudentDigitalTwin;
    } catch (error) {
      console.error(`Failed to incrementally update Digital Twin for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Generates the initial Student Digital Twin from a completed baseline assessment.
   */
  async generateInitialDigitalTwin(
    userId: string,
    submission: any
  ): Promise<StudentDigitalTwin> {
    const profile = await this.profileService.getProfile(userId);
    const aiProvider = container.resolve<IAIProvider>(TOKENS.ReasoningProvider);

    const prompt = `You are the lead AI Cognitive Scientist and Psychometric Assessment Engine for Sadhya.
Analyze this completed baseline assessment to construct a detailed Student Digital Twin model.

STUDENT PROFILE:
- Board: ${profile?.board || 'CBSE'}
- Class: ${profile?.classLevel || 'Class 10'}
- Stream: ${profile?.stream || 'General'}
- Target Exam: ${profile?.targetExam || 'Board Exam'}
- Target Score: ${profile?.target || '95%'}
- Focus Subjects: ${JSON.stringify(profile?.subjects || ['Physics', 'Chemistry', 'Mathematics'])}

ASSESSMENT SUBMISSION STATS:
- Total Questions: ${submission.totalQuestions}
- Correct Answers: ${submission.correctCount}
- Accuracy: ${submission.accuracyPct}%
- Avg Time Per Question: ${submission.avgTimePerQSec} seconds
- Total Time Taken: ${submission.totalTimeSec} seconds
- Behavioral Signals: ${JSON.stringify(submission.behavioralSignals || {})}
- Confidence Ratings Summary: ${JSON.stringify(submission.confidenceSummary || {})}
- Questions & Responses Breakdown: ${JSON.stringify(submission.responses || [])}

Generate a comprehensive JSON matching the Student Digital Twin specification:
{
  "overallReadinessScore": <number 0-100>,
  "subjectMastery": { "<subject>": <number 0-100> },
  "topicMastery": { "<topic>": <number 0-100> },
  "knowledgeGraph": {
    "<conceptId>": {
      "conceptId": "<id>",
      "conceptName": "<name>",
      "subject": "<subject>",
      "topic": "<topic>",
      "dependencyWeight": <0.1-1.0>,
      "masteryScore": <0-100>,
      "status": "<mastered|learning|weak|untested>"
    }
  },
  "confidenceProfile": {
    "confidenceAccuracyGap": <number -50 to +50>,
    "overconfidenceScore": <number 0-100>,
    "underconfidenceScore": <number 0-100>,
    "guessAccuracy": <number 0-100>,
    "confidenceConsistency": <number 0-100>
  },
  "behavioralProfile": {
    "avgReadingTimeSeconds": <number>,
    "avgThinkingTimeSeconds": <number>,
    "optionHoverFrequency": <number>,
    "rapidGuessCount": <number>,
    "answerSwitchCount": <number>,
    "fatigueIndex": <number 0-100>,
    "revisitCount": <number>,
    "idleDurationSeconds": <number>
  },
  "learnerPersona": {
    "learningStyle": "<Visual-Analytical|Conceptual|Practical-Application|Step-by-Step|Intuitive>",
    "problemSolvingStyle": "<Methodical|Intuitive-Fast|Analytical-Cautious|Guess-Prone>",
    "motivationType": "<Goal-Driven|Mastery-Driven|Competitive|Structured>",
    "attentionPattern": "<Sustained|Burst|Wandering-Under-Fatigue>",
    "revisionPattern": "<Spaced-Repetition|Cramming-Prone|Consistent-Daily>",
    "conceptualStrength": "<High|Moderate|Needs-Foundational-Support>",
    "preferredExplanationStyle": "<Analogy-Rich|First-Principles|Formula-First|Visual-Diagram>",
    "preferredDifficulty": "<Easy|Medium|Hard|Adaptive>"
  },
  "predictions": {
    "expectedBoardScore": <number e.g. 92>,
    "expectedExamRank": "<e.g. AIR < 2500 or Top 5%>",
    "targetProbabilityPercentage": <number 0-100>,
    "estimatedCompletionWeeks": <number>,
    "recommendedDailyHours": <number>,
    "riskOfMissingTarget": "<Low|Moderate|High>",
    "potentialBoostIfHoursIncrease": <number percentage>
  },
  "firstWeekRoadmap": [
    {
      "day": 1,
      "title": "Foundation & Core Concepts",
      "focusSubject": "<Subject>",
      "activities": [
        { "type": "notebook", "title": "Interactive Chapter Review", "durationMins": 25, "targetConcept": "<Concept>" },
        { "type": "tutor", "title": "Step-by-step AI Deep Dive", "durationMins": 15, "targetConcept": "<Concept>" },
        { "type": "quiz", "title": "Adaptive Baseline Practice", "durationMins": 15, "targetConcept": "<Concept>" }
      ]
    }
  ]
}

Return ONLY valid JSON. No Markdown fencing or preamble.`;

    let parsed: any = {};
    try {
      const res = await aiProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }] as any);
      const jsonMatch = res.reply ? res.reply.match(/\{[\s\S]*\}/) : null;
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('StudentDigitalTwinService: LLM parsing hiccup, using calculated defaults', e);
    }

    const digitalTwin: StudentDigitalTwin = {
      userId,
      updatedAt: Date.now(),
      version: 1,
      academicProfile: {
        board: profile?.board || 'CBSE',
        classLevel: profile?.classLevel || 'Class 10',
        stream: profile?.stream,
        targetExam: profile?.targetExam || 'Board Exam',
        targetScore: profile?.target || '95%',
        targetYear: profile?.targetYear || '2026',
        subjects: profile?.subjects || ['Physics', 'Chemistry', 'Mathematics'],
        weakAreas: profile?.weakAreas || [],
        strongAreas: profile?.learningStyles || [],
      },
      // ── Fallbacks removed on purpose ──────────────────────────────────────────
      // These fields previously fell back to invented values when the LLM call failed or
      // returned unparseable output: readiness 75, expected score 90, "Top 5%", 82% chance of
      // hitting target, risk "Low", plus a full fabricated behavioural and confidence profile.
      // That meant a student whose analysis silently failed was told they were in good shape,
      // on numbers derived from nothing. For a student making real decisions about what to
      // study, a confidently wrong number is worse than no number.
      //
      // Everything here is now either what the model actually returned, or absent. Consumers
      // must treat absence as "not yet measured" and say so. The real replacements are
      // deterministic: readiness and mastery come from measured performance (Phase B), not
      // from a single LLM call over one baseline assessment.
      /*
       * ── EXAM-SPECIFIC CLAIMS REQUIRE CANONICAL EVIDENCE (J.7.2) ────────────────────────────
       *
       * `overallReadinessScore` and `predictions` are statements about how this student will
       * perform in THEIR EXAM: the report screen renders them as "Expected Board / Exam Score",
       * "Target Achievement Probability" and "Risk of Missing Target", and this record is stamped
       * with `academicProfile.targetExam`.
       *
       * The baseline that produces them is served by the legacy demo bank: twelve hardcoded
       * Physics/Chemistry/Mathematics templates with no canonical syllabus identity. An SSC CGL
       * candidate answers questions on kinematics and Ohm's law, and the model is then asked for
       * their expected exam rank. That number is not a measurement of anything — it is an exam
       * prediction derived from evidence that has no connection to the exam.
       *
       * Earlier work removed the FALLBACK versions of these fields (readiness 75, "Top 5%", 82%
       * chance) for the case where the model failed. This closes the remaining half: when the model
       * SUCCEEDS, its output was stored verbatim, so the fabrication simply moved from our defaults
       * into the model's response.
       *
       * Null is already a first-class state here — the report renders "—" and "Not established" —
       * so withholding is honest and safe. These become real numbers when the assessment is
       * canonical, which is what `evidenceIsCanonical` tracks.
       */
      overallReadinessScore: submission.evidenceIsCanonical
        && typeof parsed.overallReadinessScore === 'number' ? parsed.overallReadinessScore : null,
      // Subject/topic mastery are descriptive of the questions actually answered, not claims about
      // the exam, so they are retained as-is.
      subjectMastery: parsed.subjectMastery || {},
      topicMastery: parsed.topicMastery || {},
      knowledgeGraph: parsed.knowledgeGraph || {},
      confidenceProfile: parsed.confidenceProfile ?? null,
      behavioralProfile: parsed.behavioralProfile ?? null,
      learnerPersona: parsed.learnerPersona ?? null,
      predictions: submission.evidenceIsCanonical ? (parsed.predictions ?? null) : null,
      firstWeekRoadmap: parsed.firstWeekRoadmap || [],
      latestAssessmentSummary: {
        totalQuestions: submission.totalQuestions,
        correctAnswers: submission.correctCount,
        accuracyPercentage: submission.accuracyPct,
        avgTimePerQuestionSec: submission.avgTimePerQSec,
        completedAt: Date.now(),
      },
    };

    // Save Digital Twin to Firestore
    const docRef = db.collection('users').doc(userId).collection('profile').doc('studentDigitalTwin');
    await docRef.set(digitalTwin);

    // Also mark onboarding complete & save readiness in user stats
    await this.profileService.updateProfile(userId, { isComplete: true });

    console.log(`🚀 Generated Student Digital Twin v1 for ${userId} with Readiness Score: ${digitalTwin.overallReadinessScore}%`);
    return digitalTwin;
  }
}

export const studentDigitalTwinService = new StudentDigitalTwinService();
