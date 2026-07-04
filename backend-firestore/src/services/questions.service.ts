import { QuestionsRepository } from '../repositories/questions.repository';
import { Subject, Level } from '../types';

export class QuestionsService {
  private repository = new QuestionsRepository();

  async getQuestions(subject?: Subject, level?: Level, limit?: number) {
    return this.repository.findAll(subject, level, limit);
  }
}
