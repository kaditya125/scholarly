"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerController = void 0;
const planner_service_1 = require("../services/planner.service");
class PlannerController {
    service = new planner_service_1.PlannerService();
    getTasks = async (req, res, next) => {
        try {
            // In a real app, you would get userId from req.user (auth middleware)
            const userId = req.query.userId || 'default-user';
            const groupedTasks = await this.service.getTasksGroupedByStatus(userId);
            // Transform record into an array mapping as required by the frontend
            const kanbanData = Object.entries(groupedTasks).map(([status, tasks]) => {
                return {
                    status,
                    count: tasks.length.toString().padStart(2, '0'),
                    // UI specific styling might be best handled in frontend, 
                    // but we'll return raw data here
                    tasks
                };
            });
            res.json(kanbanData);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.PlannerController = PlannerController;
