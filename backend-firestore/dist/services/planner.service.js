"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerService = void 0;
const planner_repository_1 = require("../repositories/planner.repository");
const PlannerAgent_1 = require("../core/agents/PlannerAgent");
class PlannerService {
    repository = new planner_repository_1.PlannerRepository();
    agent = new PlannerAgent_1.PlannerAgent();
    async createGoalAndGenerateTimetable(userId, goalData) {
        const goal = await this.repository.createGoal({
            ...goalData,
            userId,
            createdAt: Date.now()
        });
        const schedule = await this.agent.generatePlan(goal, null);
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 7);
        const timetableData = {
            userId,
            goalId: goal.id,
            startDate: today.toISOString(),
            endDate: endDate.toISOString(),
            schedule,
            lastAdaptedAt: Date.now()
        };
        const savedTimetable = await this.repository.upsertTimetable(userId, timetableData);
        return { goal, timetable: savedTimetable };
    }
    async getTimetable(userId) {
        return this.repository.getTimetableByUserId(userId);
    }
    async markTaskCompleted(userId, date, taskId) {
        const timetable = await this.repository.getTimetableByUserId(userId);
        if (!timetable)
            return null;
        const dayTasks = timetable.schedule[date];
        if (dayTasks) {
            const task = dayTasks.find(t => t.id === taskId);
            if (task) {
                task.completed = true;
                if (task.type === 'revision' || task.type === 'quiz') {
                    console.log(`[Knowledge Graph] Mock updating mastery metric for node: ${task.blueprintNodeId || task.topic || 'unknown'} (Task Type: ${task.type})`);
                }
            }
        }
        await this.repository.upsertTimetable(userId, timetable);
        return timetable;
    }
    async addTask(userId, date, task) {
        const timetable = await this.repository.getTimetableByUserId(userId);
        if (!timetable)
            return null;
        if (!timetable.schedule[date]) {
            timetable.schedule[date] = [];
        }
        timetable.schedule[date].push(task);
        await this.repository.upsertTimetable(userId, timetable);
        return timetable;
    }
    // Hook triggered when user misses tasks or fails a quiz
    async adaptRebalanceTimetable(userId) {
        const timetable = await this.repository.getTimetableByUserId(userId);
        if (!timetable)
            return null;
        // Find uncompleted tasks in the past
        const missedTasks = [];
        const todayStr = new Date().toISOString().split('T')[0];
        for (const [date, tasks] of Object.entries(timetable.schedule)) {
            if (date < todayStr) {
                const uncompleted = tasks.filter(t => !t.completed);
                missedTasks.push(...uncompleted);
            }
        }
        if (missedTasks.length > 0) {
            // Burnout Detection
            if (missedTasks.length > 5) {
                console.log(`[Burnout Detection] User ${userId} has missed ${missedTasks.length} tasks. Injecting a break.`);
                const breakTask = {
                    id: `break_${Date.now()}`,
                    title: 'Take a Rest',
                    type: 'break',
                    chapter: '',
                    topic: 'Mental Health',
                    estimatedMinutes: 60,
                    completed: false,
                    priority: 'high'
                };
                // Inject break today
                if (!timetable.schedule[todayStr]) {
                    timetable.schedule[todayStr] = [];
                }
                timetable.schedule[todayStr].unshift(breakTask);
            }
            // Rebalance plan using PlannerAgent
            const newSchedule = await this.agent.rebalancePlan(timetable, missedTasks);
            // Update timetable schedule
            timetable.schedule = newSchedule;
        }
        timetable.lastAdaptedAt = Date.now();
        await this.repository.upsertTimetable(userId, timetable);
        return timetable;
    }
}
exports.PlannerService = PlannerService;
