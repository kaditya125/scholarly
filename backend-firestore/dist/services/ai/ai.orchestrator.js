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
        // Use the centralized Sadhya AI prompt builder
        return (0, prompts_1.buildSadhyaSystemPrompt)({
            mode,
            studentContext,
            retrievedContext: contextData || undefined,
            hasNotebookContext,
        });
    }
    getProviderForMode(mode) {
        // We now have unlimited Gemini 2.5 Flash, so we use it for EVERYTHING!
        // No more falling back to the free tier of Groq.
        return this.primaryProvider;
    }
    async generateGroundedResponse(mode, history, contextData, studentContext) {
        const provider = this.getProviderForMode(mode);
        const systemPrompt = this.getSystemPromptForMode(mode, contextData, studentContext);
        try {
            return await provider.generateResponse(history, systemPrompt);
        }
        catch (error) {
            console.error(`[AI Orchestrator] Primary provider (${provider.constructor.name}) failed. Falling back to Groq...`, error);
            // Fallback to Groq if Gemini hits a temporary error or rate limit
            return await this.fastProvider.generateResponse(history, systemPrompt);
        }
    }
    async *generateStreamGroundedResponse(mode, history, contextData, studentContext) {
        const provider = this.getProviderForMode(mode);
        const systemPrompt = this.getSystemPromptForMode(mode, contextData, studentContext);
        try {
            if (provider.generateStreamResponse) {
                yield* provider.generateStreamResponse(history, systemPrompt);
            }
            else {
                const response = await provider.generateResponse(history, systemPrompt);
                yield response.reply;
            }
        }
        catch (error) {
            console.error(`[AI Orchestrator] Primary stream provider (${provider.constructor.name}) failed. Falling back to Groq stream...`, error);
            if (this.fastProvider.generateStreamResponse) {
                yield* this.fastProvider.generateStreamResponse(history, systemPrompt);
            }
            else {
                const fallbackResponse = await this.fastProvider.generateResponse(history, systemPrompt);
                yield fallbackResponse.reply;
            }
        }
    }
}
exports.AIOrchestrator = AIOrchestrator;
exports.aiOrchestrator = new AIOrchestrator();
