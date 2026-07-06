import { PlannerService } from '../../src/services/planner.service';

describe('Planner Adaptive Rebalancing E2E Validation', () => {
  let service: PlannerService;
  const testUserId = 'test-planner-user';

  beforeAll(() => {
    service = new PlannerService();
  });

  it('should generate a timetable and adapt it when tasks are missed', async () => {
    // 1. Generate Timetable
    const { timetable } = await service.createGoalAndGenerateTimetable(testUserId, {
      targetExam: 'UPSC CSE 2025',
      examDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      subjects: ['History', 'Polity'],
      weeklyHours: 15
    });

    expect(timetable).toBeDefined();
    expect(Object.keys(timetable.schedule).length).toBe(7); // 7 day mock schedule
    
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = timetable.schedule[today];
    expect(todayTasks.length).toBeGreaterThan(0);

    // 2. Mark one task as completed
    const taskIdToComplete = todayTasks[0].id;
    await service.markTaskCompleted(testUserId, today, taskIdToComplete);
    
    const updated = await service.getTimetable(testUserId);
    expect(updated?.schedule[today].find(t => t.id === taskIdToComplete)?.completed).toBe(true);

    // 3. Trigger Rebalance
    const initialAdaptedAt = updated?.lastAdaptedAt;
    
    // Wait slightly to ensure timestamp change
    await new Promise(r => setTimeout(r, 10));
    
    const adaptedTimetable = await service.adaptRebalanceTimetable(testUserId);
    expect(adaptedTimetable).toBeDefined();
    expect(adaptedTimetable?.lastAdaptedAt).toBeGreaterThan(initialAdaptedAt!);
    
    // In full implementation, we'd check if uncompleted past tasks moved to tomorrow.
  });
});
