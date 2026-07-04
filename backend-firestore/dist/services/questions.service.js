"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestionsService = void 0;
const questions_repository_1 = require("../repositories/questions.repository");
class QuestionsService {
    repository = new questions_repository_1.QuestionsRepository();
    async getQuestions(subject, level, limit) {
        return this.repository.findAll(subject, level, limit);
    }
}
exports.QuestionsService = QuestionsService;
