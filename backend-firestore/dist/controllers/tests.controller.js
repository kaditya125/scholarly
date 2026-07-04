"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsController = void 0;
const tests_service_1 = require("../services/tests.service");
class TestsController {
    service = new tests_service_1.TestsService();
    getTests = async (req, res, next) => {
        try {
            const subject = req.query.subject;
            const difficulty = req.query.difficulty;
            const maxMins = req.query.maxMins ? parseInt(req.query.maxMins, 10) : undefined;
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
            const tests = await this.service.getTests(subject, difficulty, maxMins, limit);
            res.json(tests);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.TestsController = TestsController;
