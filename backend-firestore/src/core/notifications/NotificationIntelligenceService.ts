import { studentContextService } from '../../services/studentContext.service';
import { getResilientClients, runResilient } from '../../services/ai/googleGenAIClient';
import { NotificationPayload } from './NotificationEngine';
import { logger } from '../../utils/logger';

export interface IntelligenceRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low' | 'silent';
  recommendedChannels: ('in_app' | 'push' | 'email' | 'whatsapp' | 'sms')[];
  deliveryTimeDelayMs: number; // 0 for immediate
  predictedCtr: number; // 0..1 probability
  customBody?: string; // AI personalized summary/text
}

export class NotificationIntelligenceService {
  private clients = getResilientClients();

  async evaluate(payload: NotificationPayload): Promise<IntelligenceRecommendation> {
    const userId = payload.userId;
    
    // 1. Fetch student context in parallel
    const context = await studentContextService.aggregateContext(userId);
    
    // 2. Build structured prompt for Gemini model
    const prompt = `
You are an AI notification dispatcher for Sadhya AI (an Indian competitive exam prep app).
We need to determine the optimal delivery channels, timing, priority, and engagement probability for a notification event.

Student Context:
- Target Exam: ${context.profile?.targetExam || 'N/A'}
- Exam Target Year: ${context.stats?.targetYear || 'N/A'}
- Average Mastery Score: ${context.analytics?.masteryPercentage || 0}%
- Weak Topics: ${JSON.stringify(context.memory?.weakTopics || [])}
- Study Streak: ${context.stats?.studyStreakDays || 0} days
- Today's Pending Tasks: ${JSON.stringify(context.planner?.todayTasks || [])}
- Overdue Tasks: ${context.planner?.overdueCount || 0}

Notification Event:
- Title: ${payload.title}
- Body: ${payload.body}
- Category: ${payload.category}
- Base Priority: ${payload.priority || 'medium'}

Task:
Determine the following:
1. Urgency/Priority: critical (immediate safety/payment issues), high (time-sensitive study alerts/direct tasks), medium (standard progress/notebooks), low (streak reminders/achievements), or silent.
2. Recommended Delivery Channels: Select a subset of ["in_app", "push", "email", "whatsapp", "sms"].
   - SMS and WhatsApp are reserved ONLY for critical alerts (e.g. security breach, payment failed) OR highly urgent exam prep (e.g. mock test results ready when exam is close, or exam reminder tomorrow).
3. Delivery Delay (in milliseconds): Choose 0 for immediate delivery, or delay it if it is quiet hours or a better time (e.g. 3600000 to delay by 1 hour).
4. Predicted Click-Through-Rate (CTR): Probability from 0.0 to 1.0.
5. Personalized Message Body: A friendly, short, exam-oriented version of the notification body.
   - If the student has a study streak, encourage them to maintain it (e.g. 'Keep up your X days streak!').
   - If the notification is about a weak topic or revision, suggest practicing it (e.g. 'You're close to mastering X, let's practice!').
   - If the student has an exam tomorrow or pending overdue tasks, elevate the urgency and emphasize how this content will help them clear the exam.
   - Personalize with the student's target exam (e.g. NEET Prep, JEE Advanced) to make it feel extremely relevant.
   - Keep the length under 160 characters for SMS compatibility if SMS is a recommended channel.

Return your response in EXACTLY this JSON format:
{
  "priority": "high",
  "recommendedChannels": ["in_app", "push"],
  "deliveryTimeDelayMs": 0,
  "predictedCtr": 0.85,
  "customBody": "Hey! Your Class 10 Biology podcast is ready. Let's study for your upcoming boards!"
}
`;

    try {
      const response = await runResilient(this.clients, async (ai) => {
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        return result.text;
      });

      const data = JSON.parse(response?.trim() || '{}') as IntelligenceRecommendation;
      
      return {
        priority: data.priority || 'medium',
        recommendedChannels: data.recommendedChannels || ['in_app'],
        deliveryTimeDelayMs: data.deliveryTimeDelayMs || 0,
        predictedCtr: data.predictedCtr || 0.5,
        customBody: data.customBody || payload.body
      };
    } catch (e: any) {
      logger.error('[NotificationIntel] AI Evaluation failed, falling back to defaults', e);
      return {
        priority: payload.priority || 'medium',
        recommendedChannels: ['in_app', 'push'],
        deliveryTimeDelayMs: 0,
        predictedCtr: 0.5,
        customBody: payload.body
      };
    }
  }
}

export const notificationIntelligenceService = new NotificationIntelligenceService();
