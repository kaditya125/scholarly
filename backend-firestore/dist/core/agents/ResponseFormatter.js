"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseFormatter = void 0;
const container_1 = require("../di/container");
class ResponseFormatter {
    name = 'ResponseFormatter';
    description = 'Formats the final response, integrating citations and warnings.';
    async execute(context) {
        // Only used if not streaming
    }
    async *executeStream(context) {
        const aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        const draft = context.sharedState['teacherDraft'] || context.sharedState['researchDraft'];
        const warnings = context.sharedState['verificationWarnings'];
        let warningText = '';
        if (warnings && warnings.length > 0) {
            warningText = `\n\nWARNING: The following claims could not be verified against the source material: \n- ${warnings.join('\n- ')}`;
        }
        const systemPrompt = `You are a formatting agent. Your job is to take the provided Draft Explanation and format it beautifully for the user. 
    Ensure headings are bold, bullet points are clear, and paragraphs are readable.
    Do NOT change the factual content of the draft.
    
    DRAFT:
    ${draft}
    ${warningText}
    `;
        // Attempt to stream
        const anyProvider = aiProvider;
        if (typeof anyProvider.generateStreamResponse === 'function') {
            const stream = anyProvider.generateStreamResponse([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Format the final response.' }
            ]);
            for await (const chunk of stream) {
                yield chunk;
            }
        }
        else {
            const res = await aiProvider.generateResponse([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Format the final response.' }
            ]);
            yield res.reply;
        }
    }
}
exports.ResponseFormatter = ResponseFormatter;
