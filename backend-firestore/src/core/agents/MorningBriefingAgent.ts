import { container, TOKENS } from '../di/container';
import { IAIProvider } from '../interfaces/IAIProvider';
import { StudentContext } from '../../types/studentContext.types';
import { BriefingResponse } from '../../types/briefing.types';

export class MorningBriefingAgent {
  /**
   * Generates a personalized daily briefing for the student.
   * Forces the LLM to output strictly in JSON format matching BriefingResponse.
   */
  async generateBriefing(studentContext: StudentContext): Promise<BriefingResponse> {
    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);

    const systemPrompt = `You are Scholarly AI, a highly intelligent and personal educational mentor.
Your task is to analyze the student's context and generate a highly personalized daily "Morning Briefing".

You MUST output ONLY a valid JSON object matching the exact structure requested. Do NOT include markdown code blocks (e.g. \`\`\`json) or any conversational text. ONLY JSON.

Analyze this student data:
${JSON.stringify(studentContext, null, 2)}

Expected JSON Structure:
{
  "welcomeMessage": {
    "greeting": "Warm greeting using the student's name (if known) or a friendly opening",
    "examContext": "Mention their target exam and year",
    "overview": "A brief, encouraging sentence about their progress"
  },
  "studyStreak": {
    "days": number (use stats.studyStreakDays, default to 0),
    "yesterdayTime": "string (e.g., '2h 15m', estimate based on recent activity or use '0m')",
    "thisWeekTime": "string (estimate or use '0m')",
    "consistencyScore": number (0-100, use analytics.studyConsistencyScore or 0)
  },
  "yesterdaysProgress": {
    "summary": "1-2 sentences summarizing recent activity",
    "completedItems": ["array of 2-4 strings describing completed tasks (e.g., 'Algebra Quiz', 'Read Chapter 3')"]
  },
  "continueLearning": {
    "lastNotebookId": "string or null",
    "lastNotebookName": "Name of the most recent notebook from context, or a default subject",
    "chapter": "Name of the chapter",
    "topic": "Name of the topic",
    "lastConversationId": "string or null",
    "suggestion": "Brief suggestion on what to do next in this topic"
  },
  "aiMemorySummary": {
    "struggles": ["array of weak topics"],
    "improvements": ["array of strong or improving topics"],
    "overdueRevisions": ["array of topics needing revision"]
  },
  "todayRecommendations": [
    {
      "id": "unique-id",
      "type": "revision|quiz|flashcard|reading|mock_test",
      "title": "Actionable title",
      "estimatedMinutes": number
    }
  ],
  "plannerSummary": {
    "sessionsCount": number,
    "quizCount": number,
    "revisionCount": number,
    "totalEstimatedMinutes": number
  },
  "mockTestSummary": {
    "nextTestName": "Name of appropriate mock test",
    "status": "Ready|Upcoming",
    "estimatedMinutes": number,
    "difficulty": "Easy|Medium|Hard"
  },
  "notebookSummary": {
    "activeNotebooks": [
      {
        "id": "notebook-id",
        "name": "notebook name",
        "completionPercentage": number (0-100)
      }
    ]
  },
  "learningAnalytics": {
    "masteryPercentage": number,
    "retentionPercentage": number,
    "learningVelocity": "Slow|Steady|Fast",
    "confidencePercentage": number
  },
  "motivation": {
    "message": "A deeply personalized, unique motivational message. Don't repeat generic quotes. Relate it to their specific exam and weak areas."
  },
  "generatedAt": "ISO date string"
}

Fill in all fields thoughtfully. If specific data is missing from the student context, make reasonable educational assumptions or provide encouraging default values suitable for a new student. Make it feel premium, intelligent, and deeply personal.`;

    try {
      const response = await aiProvider.generateResponse([
        { role: 'user', content: 'Generate the daily briefing JSON now.' }
      ], systemPrompt);

      let jsonStr = response.reply.trim();
      // Clean up markdown block if the model ignored the instruction
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.substring(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }

      return JSON.parse(jsonStr) as BriefingResponse;
    } catch (error) {
      console.error('Failed to generate Morning Briefing JSON:', error);
      // Fallback response
      return {
        welcomeMessage: { greeting: "Welcome back!", examContext: "Let's continue your preparation.", overview: "Ready for another great day?" },
        studyStreak: { days: 0, yesterdayTime: "0m", thisWeekTime: "0m", consistencyScore: 0 },
        yesterdaysProgress: { summary: "Ready to start learning.", completedItems: [] },
        continueLearning: { lastNotebookName: "General Studies", suggestion: "Pick up where you left off." },
        aiMemorySummary: { struggles: [], improvements: [], overdueRevisions: [] },
        todayRecommendations: [],
        plannerSummary: { sessionsCount: 0, quizCount: 0, revisionCount: 0, totalEstimatedMinutes: 0 },
        mockTestSummary: { nextTestName: "General Mock", status: "Upcoming", estimatedMinutes: 60, difficulty: "Medium" },
        notebookSummary: { activeNotebooks: [] },
        learningAnalytics: { masteryPercentage: 0, retentionPercentage: 0, learningVelocity: "Steady", confidencePercentage: 0 },
        motivation: { message: "Every small step counts towards your big goal. Let's make today productive!" },
        generatedAt: new Date().toISOString()
      };
    }
  }
}
