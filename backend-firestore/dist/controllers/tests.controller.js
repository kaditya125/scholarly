"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsController = void 0;
const testSeries_service_1 = require("../services/tests/testSeries.service");
const adaptiveTest_service_1 = require("../services/tests/adaptiveTest.service");
const resultAnalysis_service_1 = require("../services/tests/resultAnalysis.service");
class TestsController {
    getFeaturedSeries = async (req, res, next) => {
        try {
            const series = await testSeries_service_1.testSeriesService.getFeaturedTestSeries();
            res.json(series);
        }
        catch (error) {
            next(error);
        }
    };
    getCategories = async (req, res, next) => {
        try {
            const { category } = req.query;
            const series = await testSeries_service_1.testSeriesService.getTestSeriesByCategory(category || 'SSC');
            res.json(series);
        }
        catch (error) {
            next(error);
        }
    };
    getIncompleteAttempts = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const attempts = await testSeries_service_1.testSeriesService.getIncompleteAttempts(userId);
            res.json(attempts);
        }
        catch (error) {
            next(error);
        }
    };
    generateAdaptiveTest = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { subject, topic, difficulty, questionCount, timeLimitMins } = req.body;
            const test = await adaptiveTest_service_1.adaptiveTestService.generateAdaptiveTest(userId, subject, topic, difficulty, questionCount, timeLimitMins);
            res.json(test);
        }
        catch (error) {
            next(error);
        }
    };
    submitTestAttempt = async (req, res, next) => {
        try {
            const { attemptId } = req.params;
            // In a real scenario, the attempt updates would be pushed first, then submit is called.
            // Assuming attempt is already saved in DB with answers.
            const result = await resultAnalysis_service_1.resultAnalysisService.processSubmission(attemptId);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    };
}
exports.TestsController = TestsController;
