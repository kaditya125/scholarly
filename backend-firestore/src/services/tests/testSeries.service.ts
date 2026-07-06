import { testsRepository } from '../../repositories/tests.repository';
import { TestSeries, MockTest, TestAttempt } from '../../types/tests.types';

export class TestSeriesService {
  async getFeaturedTestSeries(): Promise<TestSeries[]> {
    return testsRepository.getFeaturedTestSeries();
  }

  async getTestSeriesByCategory(category: string): Promise<TestSeries[]> {
    return testsRepository.getTestSeriesByCategory(category);
  }

  async getTestsByType(type: string, limit?: number): Promise<MockTest[]> {
    return testsRepository.getTestsByType(type, limit);
  }

  async getIncompleteAttempts(userId: string): Promise<TestAttempt[]> {
    return testsRepository.getIncompleteAttempts(userId);
  }
}

export const testSeriesService = new TestSeriesService();
