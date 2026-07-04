"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreAnalyticsProvider = void 0;
const firebase_1 = require("../../../config/firebase");
class FirestoreAnalyticsProvider {
    /**
     * Logs a single execution workflow's retrieval analytics.
     */
    async logWorkflowMetrics(userId, metrics) {
        try {
            const timestamp = new Date().toISOString();
            await firebase_1.db.collection('users').doc(userId).collection('analytics_logs').add({
                ...metrics,
                timestamp
            });
            console.log(`[Analytics] Logged workflow metrics for user ${userId}`);
        }
        catch (error) {
            console.error('Failed to log workflow metrics:', error);
        }
    }
}
exports.FirestoreAnalyticsProvider = FirestoreAnalyticsProvider;
