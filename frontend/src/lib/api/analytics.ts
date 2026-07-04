import { api } from './client';

export interface AnalyticsMetrics {
  totalStudyHours: number;
  topicsMastered: number;
  averageScore: number;
  streakDays: number;
  recentActivity: ActivityItem[];
  weeklyProgress: WeeklyProgress[];
  strengths: string[];
  weaknesses: string[];
}

export interface ActivityItem {
  id: string;
  type: 'chat' | 'quiz' | 'upload' | 'flashcard';
  title: string;
  timestamp: string;
}

export interface WeeklyProgress {
  day: string;
  hours: number;
}

export interface CompanionInsight {
  type: 'revision' | 'burnout' | 'test' | 'motivation';
  message: string;
  actionText: string;
  actionUrl: string;
}

export const analyticsApi = {
  async getMetrics(): Promise<AnalyticsMetrics> {
    const response = await api.get('/analytics/metrics');
    return response.data;
  },
  
  async getCompanionInsights(): Promise<CompanionInsight[]> {
    const response = await api.get('/companion/evaluate');
    return response.data;
  }
};
