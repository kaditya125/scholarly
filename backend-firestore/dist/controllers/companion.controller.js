"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companionController = exports.CompanionController = void 0;
const ProactiveCompanion_1 = require("../core/companion/ProactiveCompanion");
const firebase_1 = require("../config/firebase");
class CompanionController {
    /**
     * Endpoint triggered by a CRON job to evaluate proactive interventions for active users.
     */
    async runNightlyEvaluation(req, res) {
        try {
            // In a real scenario, this endpoint must be authenticated (e.g. verify an internal API key)
            const authHeader = req.headers['authorization'];
            if (authHeader !== 'Bearer INTERNAL_CRON_SECRET') {
                // res.status(401).json({ error: 'Unauthorized' });
                // Commenting out auth check for development/testing
            }
            // 1. Fetch recently active users (e.g. users who studied in the last 7 days)
            // For MVP, we'll just fetch a small batch of all users
            const usersSnapshot = await firebase_1.db.collection('users').limit(100).get();
            const results = [];
            for (const doc of usersSnapshot.docs) {
                const userId = doc.id;
                const result = await ProactiveCompanion_1.proactiveCompanion.evaluateUser(userId);
                if (result.triggered) {
                    results.push(result);
                }
            }
            res.status(200).json({
                success: true,
                message: `Evaluated ${usersSnapshot.size} users. Triggered ${results.length} interventions.`,
                interventions: results
            });
        }
        catch (error) {
            console.error('CRON Evaluation Error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}
exports.CompanionController = CompanionController;
exports.companionController = new CompanionController();
