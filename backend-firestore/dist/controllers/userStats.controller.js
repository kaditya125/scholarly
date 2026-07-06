"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatsController = void 0;
const userStats_service_1 = require("../services/userStats.service");
class UserStatsController {
    service = new userStats_service_1.UserStatsService();
    getUserStats = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const stats = await this.service.getUserStats(userId);
            if (!stats) {
                return res.status(404).json({ error: "User stats not found" });
            }
            res.json(stats);
        }
        catch (error) {
            next(error);
        }
    };
    awardXP = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { actionType } = req.body; // e.g. 'LOGIN', 'STUDY_30'
            await this.service.awardXP(userId, actionType);
            const updatedStats = await this.service.getUserStats(userId);
            res.json(updatedStats);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.UserStatsController = UserStatsController;
