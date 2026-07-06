import { eventBus, EventNames } from '../core/workflow/EventBus';
import { aiCoachAgent } from '../core/agents/AICoachAgent';

// Mock services to be called by event listeners
const graphService = {
  updateGraph: async (userId: string, data: any) => {
    console.log(`Knowledge Graph updated for user ${userId}`, data);
  }
};

const plannerService = {
  updatePlan: async (userId: string, data: any) => {
    console.log(`Planner updated for user ${userId}`, data);
  }
};

class AICoachService {
  constructor() {
    this.initializeListeners();
  }

  private initializeListeners() {
    eventBus.on(EventNames.TEST_COMPLETED, async (payload: { userId: string, testId: string, score: number }) => {
      console.log('Received TEST_COMPLETED event', payload);
      
      // Trigger updates to Knowledge Graph and Planner
      await graphService.updateGraph(payload.userId, { testScore: payload.score });
      await plannerService.updatePlan(payload.userId, { testCompleted: payload.testId });
      
      // Update exam readiness
      await this.updateExamReadiness(payload.userId, { score: payload.score });
    });
  }

  public async calculateLearningHealthScore(userId: string): Promise<number> {
    // Calculate and store learningHealthScore (0-100)
    // Mock logic
    const healthScore = Math.floor(Math.random() * 30) + 70; // 70-100
    console.log(`Updated learning health score for ${userId}: ${healthScore}`);
    
    // Store in DB (mocked)
    return healthScore;
  }

  public async updateExamReadiness(userId: string, context: any): Promise<number> {
    // Use AICoachAgent to update examReadiness
    const readiness = await aiCoachAgent.analyzeExamReadiness(context);
    console.log(`Exam readiness for ${userId} updated to: ${readiness}`);
    return readiness;
  }
}

export const aiCoachService = new AICoachService();
