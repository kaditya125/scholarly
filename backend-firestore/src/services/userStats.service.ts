import { UserStatsRepository } from '../repositories/userStats.repository';

export class UserStatsService {
  private repository = new UserStatsRepository();

  async getUserStats(userId: string) {
    return this.repository.findByUserId(userId);
  }
}
