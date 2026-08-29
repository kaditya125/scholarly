import { LeaderboardRepository } from '../repositories/leaderboard.repository';

export class LeaderboardService {
  private repository = new LeaderboardRepository();

  async getLeaderboard(limit?: number, targetExam?: string) {
    return this.repository.getTopUsers(limit, targetExam);
  }
}
