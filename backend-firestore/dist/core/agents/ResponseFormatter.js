"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseFormatter = void 0;
const container_1 = require("../di/container");
const prompts_1 = require("../../config/prompts");
/**
 * ResponseFormatter — Scholarly AI's Presentation Layer
 *
 * Formats the TeacherAgent's draft into a polished, well-structured response.
 * Also appends personalized learning recommendations based on student context.
 */
class ResponseFormatter {
    name = 'ResponseFormatter';
    description = 'Formats and streams the final Scholarly AI response with quality enforcement and smart recommendations.';
    async execute(context) {
        // Only used if not streaming
    }
    async *executeStream(context) {
        const aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        const draft = context.sharedState['teacherDraft'] || context.sharedState['researchDraft'];
        const warnings = context.sharedState['verificationWarnings'];
        let warningText = '';
        if (warnings && warnings.length > 0) {
            warningText = `\n\n⚠️ **Verification Note**: The following claims could not be verified against your uploaded study material: \n- ${warnings.join('\n- ')}`;
        }
        // Build smart recommendations based on student context
        const recommendations = (0, prompts_1.buildRecommendationsBlock)(context.studentContext);
        const systemPrompt = `You are Scholarly AI's final presentation layer. Your job is to take the Draft Response and present it beautifully to the student.

CRITICAL INSTRUCTION: Analyze the Draft Response. If it is a simple greeting, casual conversation, or a direct short answer:
- Output a natural, warm, conversational response.
- DO NOT use any markdown headings (## or ###).
- DO NOT include an Appendix or Next Steps.
- Keep it concise and natural, exactly as a human mentor would speak.

If the Draft Response is an educational explanation or a complex topic:
- Use proper markdown (## for sections, ### for subsections).
- Use bold for key terms, bullet points for clarity.
- Ensure the response is beginner-friendly with a clear structure and examples.
- Include the Appendix at the very end if recommendations are provided below.

## Draft Response
${draft}
${warningText}

${recommendations ? `## Provided Recommendations\n(Append these under an "## Appendix" heading ONLY IF the query was educational. Ignore them if it was a casual greeting.)\n${recommendations}` : ''}`;
        // Attempt to stream
        const anyProvider = aiProvider;
        if (typeof anyProvider.generateStreamResponse === 'function') {
            const stream = anyProvider.generateStreamResponse([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Format and present this response to the student.' }
            ], undefined, { traceId: context.request.traceId, model: context.request.model });
            for await (const chunk of stream) {
                yield chunk;
            }
        }
        else {
            const res = await aiProvider.generateResponse([
                { role: 'user', content: 'Format and present this response to the student.' }
            ], systemPrompt);
            yield res.reply;
        }
    }
}
exports.ResponseFormatter = ResponseFormatter;
