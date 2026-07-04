"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsService = void 0;
const tests_repository_1 = require("../repositories/tests.repository");
class TestsService {
    repository = new tests_repository_1.TestsRepository();
    async getTests(subject, difficulty, maxMins, limit) {
        return this.repository.findAll(subject, difficulty, maxMins, limit);
    }
}
exports.TestsService = TestsService;
