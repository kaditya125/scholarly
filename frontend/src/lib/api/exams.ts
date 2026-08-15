/**
 * Exam Intelligence Client API
 * Connects frontend to the canonical Exam Master, Timeline, Syllabus, and Eligibility endpoints.
 */

import { api } from './client';

export interface VerifiedOfficialUrls {
  authorityHome: string;
  examPortal?: string;
  syllabusPage?: string;
  notificationPage?: string;
  applicationPortal?: string;
  admitCardPortal?: string;
  resultPortal?: string;
}

export interface ExamMaster {
  examId: string;
  name: string;
  shortName: string;
  conductingAuthority: string;
  category: string;
  country: 'IN';
  aliases: string[];
  officialDomains: string[];
  currentCycle?: string;
  activeSyllabusVersionId?: string;
  verifiedOfficialUrls: VerifiedOfficialUrls;
  status: string;
  description?: string;
  eligibilitySummary?: string;
}

export interface ExamCycle {
  cycleId: string;
  examId: string;
  label: string;
  year: string;
  status: string;
  activeSyllabusVersionId?: string;
  notificationDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  tentativeExamDate?: string;
}

export interface ExamTimelineCountdown {
  examId: string;
  cycleId: string;
  currentStage: string;
  daysRemaining?: number;
  status: 'UPCOMING' | 'ONGOING' | 'PASSED' | 'TENTATIVE';
  targetDate: string;
  label: string;
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PostVacancy {
  postCode: string;
  postName: string;
  department: string;
  payLevel?: number;
  vacancies: number;
  ageLimit?: { min: number; max: number };
  qualifications?: string;
}

export interface ExamOfficialNotification {
  notificationId: string;
  examId: string;
  cycleId: string;
  notificationType: string;
  advtNumber?: string;
  title: string;
  publishDate: number;
  sourceUrl: string;
  sourceDocumentHash: string;
  importantDates: {
    notificationReleaseDate?: string;
    applicationStartDate?: string;
    applicationEndDate?: string;
    feePaymentDeadline?: string;
    correctionWindow?: { startDate: string; endDate: string };
    admitCardDate?: string;
    examStagesDates?: {
      stageId: string;
      stageName: string;
      startDate: string;
      endDate?: string;
    }[];
    resultDate?: string;
  };
  vacancies?: {
    total: number;
    isTentative: boolean;
    breakdownByCategory?: Record<string, number>;
    breakdownByPost?: PostVacancy[];
  };
  eligibility?: {
    ageLimit: {
      min: number;
      max: number;
      asOnDate: string;
      relaxations?: { category: string; years: number }[];
    };
    educationalQualifications: {
      minimumDegree: string;
      cutoffDate?: string;
    };
  };
  feeStructure?: {
    general: number;
    reserved: number;
    female: number;
  };
}

export interface StudentEligibilityEvaluation {
  isEligible: boolean;
  reasons: string[];
  calculatedAge: number;
  cutoffDate: string;
  categoryRelaxationYears: number;
  applicableMaxAge: number;
  feeAmount: number;
  eligiblePosts: string[];
  ineligiblePosts: { postName: string; reason: string }[];
}

export interface ExamSyllabus {
  syllabusId: string;
  examId: string;
  cycleId: string;
  version: string;
  authority: string;
  status: string;
  sourceDocumentUrl: string;
  sourceDocumentHash: string;
  stages: {
    stageId: string;
    name: string;
    order: number;
    papers: {
      paperId: string;
      name: string;
      order: number;
      subjects: {
        subjectId: string;
        name: string;
        order: number;
        marks?: number;
        questionCount?: number;
        topics: {
          topicId: string;
          name: string;
          order: number;
          officialSourceRef?: string;
          subtopics?: { subtopicId: string; name: string; order: number }[];
        }[];
      }[];
    }[];
  }[];
}

export const examApi = {
  getExams: async (category?: string): Promise<{ exams: ExamMaster[] }> => {
    const params = category && category !== 'ALL' ? { category } : undefined;
    const res = await api.get('/exams', { params });
    return res.data;
  },

  getExamDetail: async (examId: string): Promise<{ exam: ExamMaster }> => {
    const res = await api.get(`/exams/${examId}`);
    return res.data;
  },

  resolveExam: async (query: string): Promise<{ exam: ExamMaster }> => {
    const res = await api.get(`/exams/resolve/${encodeURIComponent(query)}`);
    return res.data;
  },

  getExamCycles: async (examId: string): Promise<{ cycles: ExamCycle[] }> => {
    const res = await api.get(`/exams/${examId}/cycles`);
    return res.data;
  },

  getExamTimeline: async (examId: string, cycleId?: string): Promise<{ timeline: ExamTimelineCountdown[] }> => {
    const params = cycleId ? { cycleId } : undefined;
    const res = await api.get(`/exams/${examId}/timeline`, { params });
    return res.data;
  },

  getExamSyllabus: async (examId: string, cycleId?: string): Promise<{ syllabus: ExamSyllabus }> => {
    const params = cycleId ? { cycleId } : undefined;
    const res = await api.get(`/exams/${examId}/syllabus`, { params });
    return res.data;
  },

  getExamNotification: async (examId: string, cycleId?: string): Promise<{ notification: ExamOfficialNotification }> => {
    const params = cycleId ? { cycleId } : undefined;
    const res = await api.get(`/exams/${examId}/notification`, { params });
    return res.data;
  },

  evaluateEligibility: async (
    examId: string,
    payload: {
      dob: string;
      category: string;
      gender?: string;
      highestQualification: string;
      hasDegreeCompleted: boolean;
      cycleId?: string;
    }
  ): Promise<{ evaluation: StudentEligibilityEvaluation }> => {
    const res = await api.post(`/exams/${examId}/eligibility`, payload);
    return res.data;
  },
};
