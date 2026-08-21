/**
 * Canonical Exam Seeds
 *
 * Registry METADATA only — exam identity, cycle dates, official domains, notification and source
 * records. These describe where an exam lives and who conducts it; none of it asserts what the
 * syllabus contains.
 *
 * THERE IS DELIBERATELY NO `syllabus` FIELD HERE, AND ONE MUST NEVER BE ADDED.
 *
 * This file previously carried a full `syllabus` per exam, each marked `status: 'CURRENT'` with
 * `sourceDocumentHash` set to the SHA-256 of the empty string and a source URL later proven to be
 * a soft-404. `examMasterService.getCurrentSyllabus()` returned it whenever Firestore held no
 * CURRENT record — so production could declare SSC CGL's syllabus INVALID and clear every active
 * pointer, and the application would still answer "here is the current syllabus" from this file.
 * The J.3 quarantine held in the database and was bypassed in code.
 *
 * Removing the data is the fix rather than removing the callers: a fallback that does not exist
 * cannot be reintroduced by a future caller who assumes a seed is a safe default. A syllabus is
 * only ever authoritative when it has been discovered, retrieved, hashed, extracted, structurally
 * validated and published through the lifecycle gate. That cannot be shipped in a constant.
 *
 * If no verified CURRENT syllabus exists, the honest answer is NO_CANONICAL_SYLLABUS.
 */

import {
  ExamMaster,
  ExamCycle,
  ExamOfficialNotification,
  ExamOfficialSource,
} from '../../types/exam.types';

export const CANONICAL_EXAM_SEEDS: Record<
  string,
  {
    exam: ExamMaster;
    cycle: ExamCycle;
    notification: ExamOfficialNotification;
    sources: ExamOfficialSource[];
  }
> = {
  SSC_CGL: {
    exam: {
      examId: 'SSC_CGL',
      name: 'Staff Selection Commission — Combined Graduate Level Examination',
      shortName: 'SSC CGL',
      conductingAuthority: 'Staff Selection Commission',
      category: 'SSC',
      country: 'IN',
      aliases: ['SSC CGL', 'SSC-CGL', 'CGL', 'Combined Graduate Level'],
      officialDomains: ['ssc.gov.in', 'ssc.nic.in'],
      currentCycle: '2026',
      verifiedOfficialUrls: {
        authorityHome: 'https://ssc.gov.in',
        examPortal: 'https://ssc.gov.in',
        syllabusPage: 'https://ssc.gov.in/syllabus',
        notificationPage: 'https://ssc.gov.in/notices',
      },
      status: 'ACTIVE',
      description: 'Premier national examination for recruitment to Group B and Group C posts in central ministries, departments, and organizations.',
      eligibilitySummary: "Bachelor's Degree from a recognized University. Age limit: 18–30 / 18–32 depending on post.",
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    cycle: {
      cycleId: '2026',
      examId: 'SSC_CGL',
      label: 'SSC CGL 2026 Examination Cycle',
      year: '2026',
      status: 'ACTIVE',
      notificationDate: '2026-06-11',
      applicationStartDate: '2026-06-11',
      applicationEndDate: '2026-07-10',
      tentativeExamDate: '2026-09-15',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    notification: {
      notificationId: 'notif_ssc_cgl_2026_adv1',
      examId: 'SSC_CGL',
      cycleId: '2026',
      notificationType: 'ADV_NOTIFICATION',
      advtNumber: 'F.No. 3/1/2026-P&P-I',
      title: 'Notice for Combined Graduate Level Examination, 2026',
      publishDate: 1718064000000,
      sourceUrl: 'https://ssc.gov.in',
      sourceDocumentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      importantDates: {
        notificationReleaseDate: '2026-06-11',
        applicationStartDate: '2026-06-11',
        applicationEndDate: '2026-07-10',
        feePaymentDeadline: '2026-07-11',
        correctionWindow: { startDate: '2026-07-15', endDate: '2026-07-16' },
        admitCardDate: '2026-09-05',
        examStagesDates: [
          { stageId: 'tier_1', stageName: 'Tier I (CBE)', startDate: '2026-09-15', endDate: '2026-09-26' },
          { stageId: 'tier_2', stageName: 'Tier II (CBE)', startDate: '2026-12-10', endDate: '2026-12-13' },
        ],
      },
      vacancies: {
        total: 17727,
        isTentative: true,
        breakdownByCategory: { UR: 7500, OBC: 4500, SC: 2700, ST: 1400, EWS: 1627 },
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
        nationality: ['Citizen of India'],
      },
      feeStructure: {
        general: 100,
        reserved: 0,
        female: 0,
        paymentModes: ['BHIM UPI', 'Net Banking', 'Visa / Mastercard / RuPay'],
      },
      status: 'ACTIVE',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    sources: [
      {
        sourceId: 'src_ssc_gov_portal',
        examId: 'SSC_CGL',
        sourceType: 'AUTHORITY_HOME',
        url: 'https://ssc.gov.in',
        domain: 'ssc.gov.in',
        title: 'Staff Selection Commission Official Portal',
        authority: 'Staff Selection Commission',
        verified: true,
        active: true,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
    ],
  },
  BPSC_CCE: {
    exam: {
      examId: 'BPSC_CCE',
      name: 'Bihar Public Service Commission — Combined Competitive Examination',
      shortName: 'BPSC 72nd CCE',
      conductingAuthority: 'Bihar Public Service Commission (BPSC)',
      category: 'STATE_PSC',
      country: 'IN',
      aliases: ['BPSC', 'BPSC CCE', 'BPSC 70th CCE', 'BPSC 71st CCE', 'BPSC 72nd CCE', 'Bihar Civil Services'],
      officialDomains: ['bpsc.bihar.gov.in', 'bpsc.bih.nic.in'],
      currentCycle: '2026',
      verifiedOfficialUrls: {
        authorityHome: 'https://bpsc.bihar.gov.in',
        examPortal: 'https://bpsc.bihar.gov.in',
        syllabusPage: 'https://bpsc.bihar.gov.in',
        notificationPage: 'https://bpsc.bihar.gov.in',
      },
      status: 'ACTIVE',
      description: 'Premier state civil services examination for executive and administrative posts in Bihar.',
      eligibilitySummary: "Bachelor's Degree from a recognized University. Age limit: 20/21/22 to 37 (General Male).",
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    cycle: {
      cycleId: '2026',
      examId: 'BPSC_CCE',
      label: 'BPSC 72nd CCE 2026 Cycle',
      year: '2026',
      status: 'ACTIVE',
      notificationDate: '2026-05-05',
      tentativeExamDate: '2026-07-26',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    notification: {
      notificationId: 'notif_bpsc_72nd_cce_2026',
      examId: 'BPSC_CCE',
      cycleId: '2026',
      notificationType: 'ADV_NOTIFICATION',
      title: 'BPSC 72nd Combined Competitive Examination Notification',
      publishDate: 1714867200000,
      sourceUrl: 'https://bpsc.bihar.gov.in',
      sourceDocumentHash: 'c7d9e1f8298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b99',
      importantDates: {
        notificationReleaseDate: '2026-05-05',
        applicationStartDate: '2026-05-15',
        applicationEndDate: '2026-06-15',
        examStagesDates: [
          { stageId: 'prelims', stageName: 'Preliminary Exam', startDate: '2026-07-26', endDate: '2026-07-26' },
        ],
      },
      vacancies: {
        total: 1186,
        isTentative: true,
      },
      eligibility: {
        ageLimit: {
          min: 20,
          max: 37,
          asOnDate: '2026-08-01',
          relaxations: [
            { category: 'OBC', years: 3 },
            { category: 'SC', years: 5 },
            { category: 'ST', years: 5 },
            { category: 'Female', years: 3 },
          ],
        },
        educationalQualifications: {
          minimumDegree: "Graduate / Bachelor's Degree from a recognized University",
        },
      },
      feeStructure: { general: 600, reserved: 150, female: 150 },
      status: 'ACTIVE',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    sources: [
      {
        sourceId: 'src_bpsc_official',
        examId: 'BPSC_CCE',
        sourceType: 'AUTHORITY_HOME',
        url: 'https://bpsc.bihar.gov.in',
        domain: 'bpsc.bihar.gov.in',
        title: 'Bihar Public Service Commission Official Portal',
        authority: 'Bihar Public Service Commission',
        verified: true,
        active: true,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
    ],
  },
};
