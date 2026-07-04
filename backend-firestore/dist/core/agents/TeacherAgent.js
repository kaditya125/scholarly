"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherAgent = void 0;
const container_1 = require("../di/container");
class TeacherAgent {
    name = 'TeacherAgent';
    description = 'Drafts an educational explanation based on context.';
    async execute(context) {
        const aiProvider = container_1.container.resolve(container_1.TOKENS.AIProvider);
        const systemPrompt = `You are an expert Teacher. Break down complex topics into easy-to-understand concepts using analogies, step-by-step reasoning, and clear examples. Never hallucinate facts.
    
CONTEXT:
${context.retrievedContext}

IMPORTANT: Draft a comprehensive explanation for the user's query based ONLY on the context. Focus on pedagogy. Do not finalize formatting, just draft the content.`;
        const response = await aiProvider.generateResponse([
            { role: 'system', content: systemPrompt },
            ...context.request.history,
            { role: 'user', content: context.request.query }
        ]);
        context.sharedState['teacherDraft'] = response.reply;
    }
}
exports.TeacherAgent = TeacherAgent;
