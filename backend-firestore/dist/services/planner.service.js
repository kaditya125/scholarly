"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerService = void 0;
const planner_repository_1 = require("../repositories/planner.repository");
class PlannerService {
    repository = new planner_repository_1.PlannerRepository();
    async getTasksGroupedByStatus(userId) {
        const tasks = await this.repository.findAllByUser(userId);
        // Group tasks by status for the Kanban board
        const grouped = {
            "To do": [],
            "In Progress": [],
            "Under Review": [],
            "Completed": []
        };
        tasks.forEach(task => {
            if (grouped[task.status]) {
                grouped[task.status].push(task);
            }
        });
        return grouped;
    }
}
exports.PlannerService = PlannerService;
