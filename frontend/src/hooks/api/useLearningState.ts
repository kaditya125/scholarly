import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useAuth } from '../../lib/AuthContext';

/**
 * GET /learning-state — the composed, evidence-graded picture of what a student is measured
 * to be weak/strong at, and what to work on next. Backed by MasteryEngine + quiz history, not
 * an LLM guess (see backend services/learningState.service.ts's own header for why observations,
 * analysis and decisions are kept separate and never fabricated).
 *
 * Only the fields the dashboard widget actually renders are typed here — same convention
 * useUserStats.ts already uses for its own narrower mirror of a richer backend shape.
 */

export type MetricStatus = 'AVAILABLE' | 'INSUFFICIENT_DATA' | 'NOT_SET' | 'STALE' | 'UNAVAILABLE';

export interface Metric<T> {
  status: MetricStatus;
  value: T | null;
  confidence: number | null;
  reason?: string;
}

export type Severity = 'LOW' | 'MODERATE' | 'HIGH';

export interface Weakness {
  topicId: string;
  topicLabel: string;
  subject?: string;
  severity: Severity;
  confidence: number;
  accuracy: number | null;
  mastery: number | null;
  trend: 'improving' | 'declining' | 'steady' | null;
}

export interface Strength {
  topicId: string;
  topicLabel: string;
  accuracy: number;
}

export interface CurrentPriority {
  status: MetricStatus;
  topicId: string | null;
  topicLabel: string | null;
  priority: Severity | null;
  reasonCodes: string[];
}

export interface StudentLearningState {
  studentId: string;
  analysis: {
    strengths: Strength[];
    weaknesses: Weakness[];
    trend: Metric<'improving' | 'declining' | 'steady'>;
  };
  decisions: {
    currentPriority: CurrentPriority;
  };
  metadata: {
    generatedAt: number;
    lastEvidenceAt: number | null;
    degraded: string[];
  };
}

export function useLearningState() {
  const { user } = useAuth();

  const query = useQuery<StudentLearningState>({
    queryKey: ['learningState', user?.uid],
    queryFn: async () => {
      const { data } = await api.get('/learning-state');
      return data;
    },
    enabled: !!user?.uid,
    staleTime: 1000 * 60 * 5, // 5 minutes — changes only on a new graded attempt
    retry: 1,
  });

  return {
    learningState: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
