"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerController = void 0;
const planner_service_1 = require("../services/planner.service");
class PlannerController {
    service = new planner_service_1.PlannerService();
    generateTimetable = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const goalData = req.body;
            const result = await this.service.createGoalAndGenerateTimetable(userId, goalData);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    };
    getTimetable = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const timetable = await this.service.getTimetable(userId);
            if (!timetable) {
                return res.status(404).json({ error: 'Timetable not found' });
            }
            res.json(timetable);
        }
        catch (error) {
            next(error);
        }
    };
    markTaskCompleted = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { date, taskId } = req.body;
            const timetable = await this.service.markTaskCompleted(userId, date, taskId);
            res.json(timetable);
        }
        catch (error) {
            next(error);
        }
    };
    adaptTimetable = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const timetable = await this.service.adaptRebalanceTimetable(userId);
            res.json(timetable);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.PlannerController = PlannerController;
