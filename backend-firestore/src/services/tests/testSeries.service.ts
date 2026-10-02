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

  async getTestById(testId: string): Promise<MockTest | null> {
    return testsRepository.getTestById(testId);
  }

  async getTestWithQuestions(testId: string) {
    return testsRepository.getTestWithQuestions(testId);
  }

  async getTestsBySeries(seriesId: string): Promise<MockTest[]> {
    return testsRepository.getTestsBySeriesId(seriesId);
  }
}

export const testSeriesService = new TestSeriesService();
