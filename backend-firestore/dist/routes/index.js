"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const questions_routes_1 = __importDefault(require("./questions.routes"));
const tests_routes_1 = __importDefault(require("./tests.routes"));
const planner_routes_1 = __importDefault(require("./planner.routes"));
const leaderboard_routes_1 = __importDefault(require("./leaderboard.routes"));
const discussions_routes_1 = __importDefault(require("./discussions.routes"));
const rooms_routes_1 = __importDefault(require("./rooms.routes"));
const users_routes_1 = __importDefault(require("./users.routes"));
const teacher_routes_1 = __importDefault(require("./teacher.routes"));
const classes_routes_1 = __importDefault(require("./classes.routes"));
const enrollments_routes_1 = __importStar(require("./enrollments.routes"));
const chat_routes_1 = __importDefault(require("./chat.routes"));
const companion_routes_1 = __importDefault(require("./companion.routes"));
const notebooks_routes_1 = __importDefault(require("./notebooks.routes"));
const studyGroups_routes_1 = __importDefault(require("./studyGroups.routes"));
const publishedAssets_routes_1 = __importDefault(require("./publishedAssets.routes"));
const briefing_routes_1 = __importDefault(require("./briefing.routes"));
const graph_routes_1 = __importDefault(require("./graph.routes"));
const assets_routes_1 = __importDefault(require("./assets.routes"));
const feedback_routes_1 = __importDefault(require("./feedback.routes"));
const admin_routes_1 = __importDefault(require("../admin/routes/admin.routes"));
const analytics_routes_1 = __importDefault(require("./analytics.routes"));
// Modern Routes
const baselineAssessment_routes_1 = __importDefault(require("./baselineAssessment.routes"));
const connections_routes_1 = __importDefault(require("./connections.routes"));
const cron_routes_1 = __importDefault(require("./cron.routes"));
const dm_routes_1 = __importDefault(require("./dm.routes"));
const documents_routes_1 = __importDefault(require("./documents.routes"));
const doubts_routes_1 = __importDefault(require("./doubts.routes"));
const media_routes_1 = __importDefault(require("./media.routes"));
const notifications_routes_1 = __importDefault(require("./notifications.routes"));
const payments_routes_1 = __importDefault(require("./payments.routes"));
const planning_routes_1 = __importDefault(require("./planning.routes"));
const podcasts_routes_1 = __importDefault(require("./podcasts.routes"));
const quiz_routes_1 = __importDefault(require("./quiz.routes"));
const scan_routes_1 = __importDefault(require("./scan.routes"));
const trash_routes_1 = __importDefault(require("./trash.routes"));
const uploads_routes_1 = __importDefault(require("./uploads.routes"));
const video_lesson_routes_1 = __importDefault(require("./video-lesson.routes"));
const webhooks_routes_1 = __importDefault(require("./webhooks.routes"));
const help_routes_1 = __importDefault(require("./help.routes"));
const router = (0, express_1.Router)();
router.use('/analytics', analytics_routes_1.default);
router.use('/briefing', briefing_routes_1.default);
router.use('/questions', questions_routes_1.default);
router.use('/tests', tests_routes_1.default);
router.use('/planner', planner_routes_1.default);
router.use('/leaderboard', leaderboard_routes_1.default);
router.use('/discussions', discussions_routes_1.default);
router.use('/rooms', rooms_routes_1.default);
router.use('/users', users_routes_1.default);
router.use('/teacher', teacher_routes_1.default);
router.use('/classes', classes_routes_1.default);
router.use('/enrollments', enrollments_routes_1.default);
router.use('/invitations', enrollments_routes_1.invitationsRouter);
router.use('/chat', chat_routes_1.default);
router.use('/chat', feedback_routes_1.default);
router.use('/companion', companion_routes_1.default);
router.use('/notebooks', notebooks_routes_1.default);
router.use('/notebooks', graph_routes_1.default);
router.use('/notebooks', assets_routes_1.default);
router.use('/study-groups', studyGroups_routes_1.default);
router.use('/explore', publishedAssets_routes_1.default);
router.use('/admin', admin_routes_1.default);
// Mount Modern Routes
router.use('/baseline-assessment', baselineAssessment_routes_1.default);
router.use('/connections', connections_routes_1.default);
router.use('/cron', cron_routes_1.default);
router.use('/dm', dm_routes_1.default);
router.use('/documents', documents_routes_1.default);
router.use('/doubts', doubts_routes_1.default);
router.use('/media', media_routes_1.default);
router.use('/notifications', notifications_routes_1.default);
router.use('/payments', payments_routes_1.default);
router.use('/planning', planning_routes_1.default);
router.use('/podcasts', podcasts_routes_1.default);
router.use('/quiz', quiz_routes_1.default);
router.use('/scan', scan_routes_1.default);
router.use('/trash', trash_routes_1.default);
router.use('/uploads', uploads_routes_1.default);
router.use('/video-lesson', video_lesson_routes_1.default);
router.use('/webhooks', webhooks_routes_1.default);
router.use('/help', help_routes_1.default);
exports.default = router;
