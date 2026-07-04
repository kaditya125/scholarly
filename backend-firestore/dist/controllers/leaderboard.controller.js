"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardController = void 0;
const leaderboard_service_1 = require("../services/leaderboard.service");
class LeaderboardController {
    service = new leaderboard_service_1.LeaderboardService();
    getLeaderboard = async (req, res, next) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
            const leaderboard = await this.service.getLeaderboard(limit);
            res.json(leaderboard);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.LeaderboardController = LeaderboardController;
