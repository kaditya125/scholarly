import { useQuery } from '@tanstack/react-query';
import { analyticsApi, AnalyticsMetrics, CompanionInsight } from '../../lib/api/analytics';
import { useAuth } from '../../lib/AuthContext';

export function useAnalytics() {
  const { user } = useAuth();

  const metricsQuery = useQuery<AnalyticsMetrics>({
    queryKey: ['analytics_metrics', user?.uid],
    queryFn: () => analyticsApi.getMetrics(),
    enabled: !!user?.uid,
  });

  const companionQuery = useQuery<CompanionInsight[]>({
    queryKey: ['companion_insights', user?.uid],
    queryFn: () => analyticsApi.getCompanionInsights(),
    enabled: !!user?.uid,
  });

  return {
    metrics: metricsQuery.data,
    isLoadingMetrics: metricsQuery.isLoading,
    isErrorMetrics: metricsQuery.isError,
    insights: companionQuery.data || [],
    isLoadingInsights: companionQuery.isLoading
  };
}
