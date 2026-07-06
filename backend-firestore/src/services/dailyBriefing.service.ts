import { db } from '../config/firebase';
import { MorningBriefingAgent } from '../core/agents/MorningBriefingAgent';
import { studentContextService } from './studentContext.service';
import { BriefingResponse } from '../types/briefing.types';

export class DailyBriefingService {
  private agent: MorningBriefingAgent;

  constructor() {
    this.agent = new MorningBriefingAgent();
  }

  /**
   * Generates or retrieves the daily briefing for a user.
   * Caches the briefing for the current day to avoid redundant LLM calls.
   */
  async getTodayBriefing(userId: string, forceRegenerate: boolean = false): Promise<BriefingResponse> {
    const todayStr = new Date().toISOString().split('T')[0];
    const docRef = db.collection('users').doc(userId).collection('daily_briefings').doc(todayStr);

    if (!forceRegenerate) {
      const doc = await docRef.get();
      if (doc.exists) {
        return doc.data() as BriefingResponse;
      }
    }

    // Generate new briefing
    const studentContext = await studentContextService.aggregateContext(userId);
    const briefing = await this.agent.generateBriefing(studentContext);

    // Save to Firestore
    await docRef.set(briefing);

    // Log login activity
    await db.collection('users').doc(userId).collection('login_activity').add({
      timestamp: new Date().toISOString(),
      date: todayStr,
      briefingGenerated: true
    });

    return briefing;
  }
}

export const dailyBriefingService = new DailyBriefingService();
