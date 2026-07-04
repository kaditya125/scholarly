"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestionsController = void 0;
const questions_service_1 = require("../services/questions.service");
class QuestionsController {
    service = new questions_service_1.QuestionsService();
    getQuestions = async (req, res, next) => {
        try {
            const subject = req.query.subject;
            const level = req.query.level;
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
            const questions = await this.service.getQuestions(subject, level, limit);
            res.json(questions);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.QuestionsController = QuestionsController;
