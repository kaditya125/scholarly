"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherAgent = void 0;
const container_1 = require("../di/container");
const prompts_1 = require("../../config/prompts");
/**
 * TeacherAgent — Sadhya AI's Reasoning Stage
 *
 * On conversational modes (TEACHER/REVISION/RESEARCH/CURRENT_AFFAIRS), produces a
 * short private reasoning scratchpad — not the final answer — which streams to the
 * client as the "Thinking" panel. ResponseFormatter then composes the actual answer
 * using this scratchpad as its plan. Other modes keep the original behavior: this
 * agent drafts the full answer, which ResponseFormatter reformats.
 *
 * Key Design Decisions:
 * - Uses buildSadhyaSystemPrompt() which injects identity + exam knowledge + student context
 * - Branches its identity on viewerRole, so a teacher is addressed as a colleague
 *   preparing to teach rather than as a learner being taught
 * - Never refuses to answer — uses intelligent fallback behavior
 * - Each learning mode has deeply specialized instructions
 * - Teaching style adapts to student's comprehension depth
 */
class TeacherAgent {
    name = 'TeacherAgent';
    description = 'Drafts personalized educational explanations as Sadhya AI — an expert mentor for competitive exam preparation.';
    async execute(context) {
        const aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        const mode = context.request.mode || 'TEACHER';
        // Conversational modes get the lean reasoning-only prompt (identity + context +
        // scratchpad instructions, no exam-knowledge/teaching-standards bulk — see
        // buildReasoningSystemPrompt). Other modes keep drafting the full answer.
        const systemPrompt = (0, prompts_1.isConversationalReasoningMode)(mode)
            ? (0, prompts_1.buildReasoningSystemPrompt)({
                mode,
                viewerRole: context.request.productRole,
                studentContext: context.studentContext,
                teacherContext: context.teacherContext,
                retrievedContext: context.retrievedContext,
            })
            : (0, prompts_1.buildSadhyaSystemPrompt)({
                mode,
                viewerRole: context.request.productRole,
                studentContext: context.studentContext,
                teacherContext: context.teacherContext,
                retrievedContext: context.retrievedContext,
                hasNotebookContext: (0, prompts_1.hasNotebookContext)(context.retrievedContext),
            });
        const response = await aiProvider.generateResponse([
            ...context.request.history,
            { role: 'user', content: context.request.query }
        ], systemPrompt, { traceId: context.request.traceId });
        context.sharedState['teacherReasoning'] = response.reply;
    }
    /**
     * Streaming variant of execute(). On conversational modes, yields a genuine private
     * reasoning scratchpad token-by-token (redefined output contract — see
     * buildReasoningScratchpadInstructions) instead of a full draft answer; on other
     * modes it still yields a full draft, unchanged from before. Either way the complete
     * text lands on sharedState['teacherReasoning'] for ResponseFormatter to consume.
     *
     * Why streaming exists at all: the teacher call is the longest single step in the
     * pipeline, and awaiting it produced a multi-second window where the client had
     * nothing to show. Streaming turns that dead time into visible thinking. Falls back
     * to the non-streaming path for providers without generateStreamResponse.
     */
    async *executeStream(context) {
        const aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        const mode = context.request.mode || 'TEACHER';
        const systemPrompt = (0, prompts_1.isConversationalReasoningMode)(mode)
            ? (0, prompts_1.buildReasoningSystemPrompt)({
                mode,
                viewerRole: context.request.productRole,
                studentContext: context.studentContext,
                teacherContext: context.teacherContext,
                retrievedContext: context.retrievedContext,
            })
            : (0, prompts_1.buildSadhyaSystemPrompt)({
                mode,
                viewerRole: context.request.productRole,
                studentContext: context.studentContext,
                teacherContext: context.teacherContext,
                retrievedContext: context.retrievedContext,
                hasNotebookContext: (0, prompts_1.hasNotebookContext)(context.retrievedContext),
            });
        const messages = [
            ...context.request.history,
            { role: 'user', content: context.request.query },
        ];
        const anyProvider = aiProvider;
        if (typeof anyProvider.generateStreamResponse === 'function') {
            let draft = '';
            for await (const chunk of anyProvider.generateStreamResponse(messages, systemPrompt, {
                traceId: context.request.traceId,
            })) {
                draft += chunk;
                yield chunk;
            }
            context.sharedState['teacherReasoning'] = draft;
            return;
        }
        const response = await aiProvider.generateResponse(messages, systemPrompt, {
            traceId: context.request.traceId,
        });
        context.sharedState['teacherReasoning'] = response.reply;
        yield response.reply;
    }
}
exports.TeacherAgent = TeacherAgent;
