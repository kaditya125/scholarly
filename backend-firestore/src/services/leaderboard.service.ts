import { LeaderboardRepository } from '../repositories/leaderboard.repository';

export class LeaderboardService {
  private repository = new LeaderboardRepository();

  async getLeaderboard(limit?: number) {
    return this.repository.getTopUsers(limit);
  }
}
