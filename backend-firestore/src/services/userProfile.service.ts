import { db } from '../config/firebase';
import { StudentProfile } from '../types/studentContext.types';
import { GeminiProvider } from './ai/gemini.provider';

/**
 * UserProfileService
 * 
 * Persists and retrieves the student's onboarding profile from Firestore.
 * Collection path: users/{userId}/profile/onboarding
 */
export class UserProfileService {
  private llmProvider: GeminiProvider;

  constructor() {
    this.llmProvider = new GeminiProvider();
  }

  /**
   * Retrieve the student's onboarding profile.
   */
  async getProfile(userId: string): Promise<StudentProfile | null> {
    try {
      const doc = await db.collection('users').doc(userId).collection('profile').doc('onboarding').get();
      if (doc.exists) {
        return doc.data() as StudentProfile;
      }
      return null;
    } catch (e) {
      console.error('Failed to get user profile:', e);
      return null;
    }
  }

  /**
   * Save or update the student's onboarding profile.
   */
  async saveProfile(userId: string, profile: Partial<StudentProfile>): Promise<void> {
    try {
      await db.collection('users').doc(userId).collection('profile').doc('onboarding').set(
        {
          ...profile,
          onboardedAt: profile.onboardedAt || new Date().toISOString(),
          isComplete: profile.isComplete ?? true,
        },
        { merge: true }
      );
    } catch (e) {
      console.error('Failed to save user profile:', e);
    }
  }

  /**
   * Check if the user has completed onboarding (has a profile with targetExam).
   */
  async isOnboarded(userId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    return !!(profile && profile.targetExam && profile.isComplete);
  }

  /**
   * Analyze an AI conversation response to extract onboarding profile data.
   * 
   * This is called after onboarding conversations to automatically persist
   * profile data revealed by the student (exam name, target year, etc.).
   */
  async extractProfileFromConversation(userId: string, userMessage: string, aiResponse: string): Promise<void> {
    try {
      const currentProfile = await this.getProfile(userId);

      const prompt = `Analyze this conversation between a student and Scholarly AI.
      
Student: "${userMessage}"
AI: "${aiResponse}"

Extract any onboarding profile information the student revealed. Return a JSON object with ONLY the fields that were clearly mentioned. Use these exact field names:

{
  "targetExam": "exact exam name if mentioned (e.g., SSC CGL, UPSC CSE, JEE Main, NEET UG, Bihar TRE PRT)",
  "targetYear": "year if mentioned (e.g., 2026, 2027)",
  "dailyStudyHours": number if mentioned,
  "preferredLanguage": "language if mentioned (English, Hindi, Hinglish)",
  "preparationLevel": "beginner or intermediate or advanced if mentioned",
  "subjects": ["array", "of", "subjects"] if mentioned,
  "weakAreas": ["array", "of", "weak", "topics"] if mentioned
}

Rules:
- Only include fields that the student CLEARLY mentioned. Do NOT guess.
- If nothing relevant was mentioned, return: {}
- Return ONLY the JSON object, nothing else.`;

      const result = await this.llmProvider.generateResponse([
        { role: 'user', content: prompt, timestamp: Date.now() }
      ] as any);

      // Parse the JSON response
      const jsonMatch = result.reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const extracted = JSON.parse(jsonMatch[0]);

      // Filter out empty values
      const cleanExtracted: Partial<StudentProfile> = {};
      if (extracted.targetExam) cleanExtracted.targetExam = extracted.targetExam;
      if (extracted.targetYear) cleanExtracted.targetYear = extracted.targetYear;
      if (extracted.dailyStudyHours) cleanExtracted.dailyStudyHours = extracted.dailyStudyHours;
      if (extracted.preferredLanguage) cleanExtracted.preferredLanguage = extracted.preferredLanguage;
      if (extracted.preparationLevel) cleanExtracted.preparationLevel = extracted.preparationLevel;
      if (extracted.subjects && extracted.subjects.length > 0) cleanExtracted.subjects = extracted.subjects;
      if (extracted.weakAreas && extracted.weakAreas.length > 0) cleanExtracted.weakAreas = extracted.weakAreas;

      // Only save if we actually extracted something
      if (Object.keys(cleanExtracted).length > 0) {
        // Determine if onboarding is now complete (at least has targetExam)
        const hasExam = cleanExtracted.targetExam || currentProfile?.targetExam;
        cleanExtracted.isComplete = !!hasExam;

        await this.saveProfile(userId, cleanExtracted);
        console.log(`📝 Extracted profile data for ${userId}:`, cleanExtracted);
      }
    } catch (e) {
      console.error('Failed to extract profile from conversation:', e);
    }
  }
}

export const userProfileService = new UserProfileService();
