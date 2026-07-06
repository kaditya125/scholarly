"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherAgent = void 0;
const container_1 = require("../di/container");
const prompts_1 = require("../../config/prompts");
/**
 * TeacherAgent — Scholarly AI's Core Teaching Engine
 *
 * Drafts educational explanations using the full Scholarly AI identity,
 * personalized to the student's profile, learning mode, and context.
 *
 * Key Design Decisions:
 * - Uses buildScholarlySystemPrompt() which injects identity + exam knowledge + student context
 * - Never refuses to answer — uses intelligent fallback behavior
 * - Each learning mode has deeply specialized instructions
 * - Teaching style adapts to student's comprehension depth
 */
class TeacherAgent {
    name = 'TeacherAgent';
    description = 'Drafts personalized educational explanations as Scholarly AI — an expert mentor for competitive exam preparation.';
    async execute(context) {
        const aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        const mode = context.request.mode || 'TEACHER';
        const hasNotebookContext = context.retrievedContext !== 'No specific context found.'
            && context.retrievedContext !== 'Placeholder RAG Text'
            && context.retrievedContext.length > 50;
        // Build the complete Scholarly AI system prompt with all layers
        const systemPrompt = (0, prompts_1.buildScholarlySystemPrompt)({
            mode,
            studentContext: context.studentContext,
            retrievedContext: context.retrievedContext,
            hasNotebookContext,
        });
        const response = await aiProvider.generateResponse([
            ...context.request.history,
            { role: 'user', content: context.request.query }
        ], systemPrompt, { traceId: context.request.traceId });
        context.sharedState['teacherDraft'] = response.reply;
    }
}
exports.TeacherAgent = TeacherAgent;
