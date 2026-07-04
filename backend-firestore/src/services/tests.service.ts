import { TestsRepository } from '../repositories/tests.repository';
import { Subject, Difficulty } from '../types';

export class TestsService {
  private repository = new TestsRepository();

  async getTests(subject?: Subject, difficulty?: Difficulty, maxMins?: number, limit?: number) {
    return this.repository.findAll(subject, difficulty, maxMins, limit);
  }
}
