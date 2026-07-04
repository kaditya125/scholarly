"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationAgent = void 0;
const container_1 = require("../di/container");
class VerificationAgent {
    name = 'VerificationAgent';
    description = 'Verifies the drafted response against retrieved context to prevent hallucinations.';
    async execute(context) {
        const verifier = container_1.container.resolve(container_1.TOKENS.VerificationProvider);
        const draft = context.sharedState['teacherDraft'] || context.sharedState['researchDraft'];
        if (!draft) {
            console.warn('VerificationAgent: No draft found to verify.');
            return;
        }
        // Call Verification Provider to check factual accuracy
        const report = await verifier.verifyClaims(draft, [context.retrievedContext]);
        context.sharedState['verificationReport'] = report;
        if (!report.isValid) {
            // If invalid, we could trigger a rewrite or append corrections to the shared state
            context.sharedState['verificationWarnings'] = report.unsupportedClaims.map(c => c.claim);
        }
    }
}
exports.VerificationAgent = VerificationAgent;
