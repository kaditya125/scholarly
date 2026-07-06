"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiOrchestrator = exports.AIOrchestrator = exports.AILearningMode = void 0;
const gemini_provider_1 = require("./gemini.provider");
const groq_provider_1 = require("./groq.provider");
const prompts_1 = require("../../config/prompts");
var AILearningMode;
(function (AILearningMode) {
    AILearningMode["TEACHER"] = "TEACHER";
    AILearningMode["REVISION"] = "REVISION";
    AILearningMode["EXAM"] = "EXAM";
    AILearningMode["QUIZ"] = "QUIZ";
    AILearningMode["FLASHCARDS"] = "FLASHCARDS";
    AILearningMode["MINDMAP"] = "MINDMAP";
    AILearningMode["MIND_MAP"] = "MIND_MAP";
    AILearningMode["PODCAST"] = "PODCAST";
    AILearningMode["SUMMARY"] = "SUMMARY";
    AILearningMode["BEGINNER"] = "BEGINNER";
    AILearningMode["RESEARCH"] = "RESEARCH";
    AILearningMode["INTERVIEW"] = "INTERVIEW";
    AILearningMode["ESSAY"] = "ESSAY";
    AILearningMode["CURRENT_AFFAIRS"] = "CURRENT_AFFAIRS";
    AILearningMode["DEFAULT"] = "DEFAULT";
})(AILearningMode || (exports.AILearningMode = AILearningMode = {}));
class AIOrchestrator {
    primaryProvider;
    fastProvider; // e.g. Groq for quick generation
    constructor() {
        this.primaryProvider = new gemini_provider_1.GeminiProvider();
        this.fastProvider = new groq_provider_1.GroqProvider();
    }
    getSystemPromptForMode(mode, contextData = '', studentContext) {
        const hasNotebookContext = contextData.length > 50;
        // Use the centralized Scholarly AI prompt builder
        return (0, prompts_1.buildScholarlySystemPrompt)({
            mode,
            studentContext,
            retrievedContext: contextData || undefined,
            hasNotebookContext,
        });
    }
    getProviderForMode(mode) {
        switch (mode) {
            case AILearningMode.FLASHCARDS:
            case AILearningMode.QUIZ:
            case AILearningMode.SUMMARY:
                return this.fastProvider; // Use Groq for fast, structured generation
            default:
                return this.primaryProvider; // Use Gemini for complex reasoning and large context
        }
    }
    async generateGroundedResponse(mode, history, contextData, studentContext) {
        const provider = this.getProviderForMode(mode);
        const systemPrompt = this.getSystemPromptForMode(mode, contextData, studentContext);
        return provider.generateResponse(history, systemPrompt);
    }
    async *generateStreamGroundedResponse(mode, history, contextData, studentContext) {
        const provider = this.getProviderForMode(mode);
        const systemPrompt = this.getSystemPromptForMode(mode, contextData, studentContext);
        if (provider.generateStreamResponse) {
            yield* provider.generateStreamResponse(history, systemPrompt);
        }
        else {
            // Fallback if provider doesn't support streaming
            const response = await provider.generateResponse(history, systemPrompt);
            yield response.reply;
        }
    }
}
exports.AIOrchestrator = AIOrchestrator;
exports.aiOrchestrator = new AIOrchestrator();
