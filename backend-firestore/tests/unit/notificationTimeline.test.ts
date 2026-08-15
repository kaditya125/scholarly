import { NotificationTimelineService } from '../../src/services/exam/notificationTimeline.service';
import { ExamOfficialNotification } from '../../src/types/exam.types';

describe('NotificationTimelineService', () => {
  let timelineService: NotificationTimelineService;

  beforeEach(() => {
    timelineService = new NotificationTimelineService();
  });

  it('computes timeline countdowns with correct urgency levels', () => {
    // Generate dates relative to today
    const today = new Date();
    const addDays = (d: number) => {
      const target = new Date(today);
      target.setDate(today.getDate() + d);
      return target.toISOString().split('T')[0];
    };

    const notif: ExamOfficialNotification = {
      notificationId: 'notif_1',
      examId: 'SSC_CGL',
      cycleId: '2026',
      notificationType: 'ADV_NOTIFICATION',
      title: 'SSC CGL 2026',
      publishDate: Date.now(),
      sourceUrl: 'https://ssc.gov.in/notice.pdf',
      sourceDocumentHash: 'hash',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      importantDates: {
        applicationStartDate: addDays(-20),
        applicationEndDate: addDays(2), // Critical: in 2 days
        correctionWindow: {
          startDate: addDays(4),
          endDate: addDays(6), // High: in 6 days
        },
        examStagesDates: [
          { stageId: 'tier_1', stageName: 'Tier I', startDate: addDays(30) }, // Medium: in 30 days
          { stageId: 'tier_2', stageName: 'Tier II', startDate: addDays(90) }, // Low: in 90 days
        ],
        resultDate: addDays(150),
      },
    };

    const timeline = timelineService.computeTimeline(notif);

    expect(timeline.length).toBe(5);

    const appClose = timeline.find((t) => t.currentStage === 'APPLICATION_CLOSE');
    expect(appClose).toBeDefined();
    expect(appClose?.urgencyLevel).toBe('CRITICAL');
    expect(appClose?.status).toBe('UPCOMING');
    expect(appClose?.daysRemaining).toBeLessThanOrEqual(3);

    const tier1 = timeline.find((t) => t.currentStage === 'tier_1');
    expect(tier1).toBeDefined();
    expect(tier1?.urgencyLevel).toBe('MEDIUM');

    const tier2 = timeline.find((t) => t.currentStage === 'tier_2');
    expect(tier2).toBeDefined();
    expect(tier2?.urgencyLevel).toBe('LOW');
  });

  it('marks dates in the past as PASSED', () => {
    const notif: ExamOfficialNotification = {
      notificationId: 'notif_past',
      examId: 'SSC_CGL',
      cycleId: '2025',
      notificationType: 'ADV_NOTIFICATION',
      title: 'SSC CGL 2025',
      publishDate: Date.now(),
      sourceUrl: 'https://ssc.gov.in/notice.pdf',
      sourceDocumentHash: 'hash',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      importantDates: {
        applicationStartDate: '2025-01-01',
        applicationEndDate: '2025-01-31',
      },
    };

    const timeline = timelineService.computeTimeline(notif);
    expect(timeline[0].status).toBe('PASSED');
    expect(timeline[0].daysRemaining).toBeUndefined();
  });
});
