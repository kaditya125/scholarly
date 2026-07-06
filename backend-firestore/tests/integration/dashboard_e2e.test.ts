import { UserStatsService } from '../../src/services/userStats.service';
import { TestsService } from '../../src/services/tests.service';

describe('Dashboard & Gamification E2E Validation', () => {
  let statsService: UserStatsService;
  let testsService: TestsService;
  const testUserId = 'test-e2e-user';

  beforeAll(() => {
    statsService = new UserStatsService();
    testsService = new TestsService();
  });

  it('should update Mastery, XP, and Retention Score when a quiz is completed', async () => {
    // 1. Get initial stats
    const initialStats = await statsService.getUserStats(testUserId);
    const initialXP = initialStats.gamification.xp;
    
    // 2. Simulate Quiz Completion
    await testsService.submitTestResult(testUserId, 'test-quiz-1', {
      score: 85,
      totalQuestions: 10,
      topic: 'Polity'
    });

    // 3. Award XP for Quiz Complete
    await statsService.awardXP(testUserId, 'QUIZ_HIGH_SCORE');

    // 4. Verify updates
    const updatedStats = await statsService.getUserStats(testUserId);
    
    expect(updatedStats.gamification.xp).toBeGreaterThan(initialXP);
    expect(updatedStats.totalTestsAttempted).toBeGreaterThan(initialStats.totalTestsAttempted);
    
    // Check if Heatmap got a new entry for today
    const today = new Date().toISOString().split('T')[0];
    const todayHeatmap = updatedStats.activityHeatmap.find(h => h.date === today);
    expect(todayHeatmap).toBeDefined();
    
    // AI Recommendations should trigger if they have weak topics
    if (updatedStats.weakTopics.length > 0) {
      const hasReviewRec = updatedStats.aiRecommendations.some(r => r.type === 'review');
      expect(hasReviewRec).toBe(true);
    }
  });
});
