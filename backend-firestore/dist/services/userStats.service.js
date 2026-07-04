"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatsService = void 0;
const userStats_repository_1 = require("../repositories/userStats.repository");
class UserStatsService {
    repository = new userStats_repository_1.UserStatsRepository();
    async getUserStats(userId) {
        return this.repository.findByUserId(userId);
    }
}
exports.UserStatsService = UserStatsService;
