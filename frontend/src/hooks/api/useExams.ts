/**
 * React Query hooks for Exam Intelligence & Student Command Center
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { examApi, StudentEligibilityEvaluation } from '../../lib/api/exams';

export function useExamsList(category?: string) {
  return useQuery({
    queryKey: ['exams-list', category],
    queryFn: () => examApi.getExams(category),
    staleTime: 1000 * 60 * 5, // 5 mins
  });
}

export function useExamDetail(examId: string | null | undefined) {
  return useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: () => (examId ? examApi.getExamDetail(examId) : Promise.resolve(null)),
    enabled: Boolean(examId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useExamTimeline(examId: string | null | undefined, cycleId?: string) {
  return useQuery({
    queryKey: ['exam-timeline', examId, cycleId],
    queryFn: () => (examId ? examApi.getExamTimeline(examId, cycleId) : Promise.resolve({ timeline: [] })),
    enabled: Boolean(examId),
    staleTime: 1000 * 60 * 2, // 2 mins
  });
}

export function useExamSyllabus(examId: string | null | undefined, cycleId?: string) {
  return useQuery({
    queryKey: ['exam-syllabus', examId, cycleId],
    queryFn: () => (examId ? examApi.getExamSyllabus(examId, cycleId) : Promise.resolve(null)),
    enabled: Boolean(examId),
    staleTime: 1000 * 60 * 10,
  });
}

export function useExamNotification(examId: string | null | undefined, cycleId?: string) {
  return useQuery({
    queryKey: ['exam-notification', examId, cycleId],
    queryFn: () => (examId ? examApi.getExamNotification(examId, cycleId) : Promise.resolve(null)),
    enabled: Boolean(examId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useEvaluateEligibility() {
  return useMutation<{ evaluation: StudentEligibilityEvaluation }, Error, {
    examId: string;
    dob: string;
    category: string;
    gender?: string;
    highestQualification: string;
    hasDegreeCompleted: boolean;
    cycleId?: string;
  }>({
    mutationFn: ({ examId, ...payload }) => examApi.evaluateEligibility(examId, payload),
  });
}
