"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardService = void 0;
const leaderboard_repository_1 = require("../repositories/leaderboard.repository");
class LeaderboardService {
    repository = new leaderboard_repository_1.LeaderboardRepository();
    async getLeaderboard(limit) {
        return this.repository.getTopUsers(limit);
    }
}
exports.LeaderboardService = LeaderboardService;
