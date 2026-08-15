import { EligibilityCheckerService } from '../../src/services/exam/eligibilityChecker.service';
import { ExamOfficialNotification } from '../../src/types/exam.types';

describe('EligibilityCheckerService', () => {
  let eligibilityService: EligibilityCheckerService;

  const mockNotification: ExamOfficialNotification = {
    notificationId: 'notif_ssc_cgl_2026',
    examId: 'SSC_CGL',
    cycleId: '2026',
    notificationType: 'ADV_NOTIFICATION',
    title: 'SSC CGL 2026 Official Notification',
    publishDate: 1700000000000,
    sourceUrl: 'https://ssc.gov.in/cgl2026.pdf',
    sourceDocumentHash: 'hash123',
    status: 'ACTIVE',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    importantDates: {},
    feeStructure: {
      general: 100,
      reserved: 0,
      female: 0,
    },
    eligibility: {
      ageLimit: {
        min: 18,
        max: 30,
        asOnDate: '2026-08-01',
        relaxations: [
          { category: 'OBC', years: 3 },
          { category: 'SC', years: 5 },
          { category: 'ST', years: 5 },
          { category: 'PwD', years: 10 },
        ],
      },
      educationalQualifications: {
        minimumDegree: "Bachelor's Degree from a recognized University",
        cutoffDate: '2026-08-01',
      },
    },
    vacancies: {
      total: 15000,
      isTentative: true,
      breakdownByPost: [
        {
          postCode: 'B01',
          postName: 'Assistant Section Officer (CSS)',
          department: 'DoPT',
          vacancies: 500,
          ageLimit: { min: 20, max: 30 },
        },
        {
          postCode: 'C01',
          postName: 'Auditor',
          department: 'C&AG',
          vacancies: 1200,
          ageLimit: { min: 18, max: 27 },
        },
      ],
    },
  };

  beforeEach(() => {
    eligibilityService = new EligibilityCheckerService();
  });

  describe('calculateAgeAsOn', () => {
    it('accurately computes age in years as on cutoff date', () => {
      // Born 2001-08-01 -> 25.0 years on 2026-08-01
      const age = eligibilityService.calculateAgeAsOn('2001-08-01', '2026-08-01');
      expect(Math.floor(age)).toBe(25);
    });

    it('handles leap years and date bounds cleanly', () => {
      const age = eligibilityService.calculateAgeAsOn('2000-02-29', '2026-02-28');
      expect(Math.floor(age)).toBe(25);
    });
  });

  describe('evaluateEligibility', () => {
    it('approves eligible General candidate within age bracket and with degree completed', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '2001-05-15', // ~25 yrs on 2026-08-01
        category: 'UR',
        gender: 'MALE',
        highestQualification: 'B.Tech',
        hasDegreeCompleted: true,
      });

      expect(res.isEligible).toBe(true);
      expect(res.feeAmount).toBe(100);
      expect(res.eligiblePosts).toContain('Assistant Section Officer (CSS)');
      expect(res.eligiblePosts).toContain('Auditor');
    });

    it('rejects candidate who has not completed bachelor degree', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '2001-05-15',
        category: 'UR',
        gender: 'MALE',
        highestQualification: 'Class 12',
        hasDegreeCompleted: false,
      });

      expect(res.isEligible).toBe(false);
      expect(res.reasons.some((r) => r.includes('degree'))).toBe(true);
    });

    it('rejects General candidate over the max age limit (30 yrs)', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '1994-01-01', // ~32.5 yrs on 2026-08-01
        category: 'UR',
        gender: 'MALE',
        highestQualification: 'B.A.',
        hasDegreeCompleted: true,
      });

      expect(res.isEligible).toBe(false);
      expect(res.reasons.some((r) => r.includes('Overage'))).toBe(true);
    });

    it('approves OBC candidate who is 32 years old using 3-year category relaxation (max 33 yrs)', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '1994-05-01', // ~32.25 yrs on 2026-08-01
        category: 'OBC',
        gender: 'MALE',
        highestQualification: 'B.Sc',
        hasDegreeCompleted: true,
      });

      expect(res.isEligible).toBe(true);
      expect(res.categoryRelaxationYears).toBe(3);
      expect(res.applicableMaxAge).toBe(33);
      expect(res.feeAmount).toBe(100);
    });

    it('approves SC/ST candidate who is 34 years old using 5-year category relaxation and sets fee to 0', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '1992-05-01', // ~34.25 yrs on 2026-08-01
        category: 'SC',
        gender: 'MALE',
        highestQualification: 'B.Com',
        hasDegreeCompleted: true,
      });

      expect(res.isEligible).toBe(true);
      expect(res.categoryRelaxationYears).toBe(5);
      expect(res.applicableMaxAge).toBe(35);
      expect(res.feeAmount).toBe(0);
    });

    it('exempts female candidates from application fee regardless of category', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '2002-01-01',
        category: 'UR',
        gender: 'FEMALE',
        highestQualification: 'B.A.',
        hasDegreeCompleted: true,
      });

      expect(res.isEligible).toBe(true);
      expect(res.feeAmount).toBe(0);
    });

    it('evaluates post-wise age criteria: 28 yr General candidate eligible for ASO (max 30) but ineligible for Auditor (max 27)', () => {
      const res = eligibilityService.evaluateEligibility(mockNotification, {
        dob: '1998-05-01', // ~28.25 yrs on 2026-08-01
        category: 'UR',
        gender: 'MALE',
        highestQualification: 'B.Tech',
        hasDegreeCompleted: true,
      });

      expect(res.isEligible).toBe(true);
      expect(res.eligiblePosts).toContain('Assistant Section Officer (CSS)');
      expect(res.ineligiblePosts.some((p) => p.postName === 'Auditor')).toBe(true);
    });
  });
});
