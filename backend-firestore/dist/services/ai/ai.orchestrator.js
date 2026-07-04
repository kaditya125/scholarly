"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiOrchestrator = exports.AIOrchestrator = exports.AILearningMode = void 0;
const gemini_provider_1 = require("./gemini.provider");
const groq_provider_1 = require("./groq.provider");
var AILearningMode;
(function (AILearningMode) {
    AILearningMode["TEACHER"] = "TEACHER";
    AILearningMode["REVISION"] = "REVISION";
    AILearningMode["EXAM"] = "EXAM";
    AILearningMode["QUIZ"] = "QUIZ";
    AILearningMode["FLASHCARDS"] = "FLASHCARDS";
    AILearningMode["MINDMAP"] = "MINDMAP";
    AILearningMode["PODCAST"] = "PODCAST";
    AILearningMode["SUMMARY"] = "SUMMARY";
    AILearningMode["BEGINNER"] = "BEGINNER";
    AILearningMode["RESEARCH"] = "RESEARCH";
    AILearningMode["DEFAULT"] = "DEFAULT";
})(AILearningMode || (exports.AILearningMode = AILearningMode = {}));
class AIOrchestrator {
    primaryProvider;
    fastProvider; // e.g. Groq for quick generation
    constructor() {
        this.primaryProvider = new gemini_provider_1.GeminiProvider();
        this.fastProvider = new groq_provider_1.GroqProvider();
    }
    getSystemPromptForMode(mode, contextData = '') {
        const baseGroundedPrompt = contextData
            ? `\n\nCONTEXT:\n${contextData}\n\nIMPORTANT: Use ONLY the context above to answer the user's questions. If the answer is not contained in the context, say "I don't have enough information to answer that based on the provided documents." Always cite your sources using inline brackets, e.g. [1].`
            : '';
        switch (mode) {
            case AILearningMode.TEACHER:
                return `You are an expert Teacher. Break down complex topics into easy-to-understand concepts using analogies, step-by-step reasoning, and clear examples. Never hallucinate facts.${baseGroundedPrompt}`;
            case AILearningMode.REVISION:
                return `You are a Revision Assistant. Provide concise, high-yield bullet points focusing on key takeaways, formulas, and critical concepts for exam preparation.${baseGroundedPrompt}`;
            case AILearningMode.QUIZ:
                return `You are a Quiz Master. Generate engaging multiple-choice questions based on the topic. Provide the answer and a detailed explanation after the user attempts it.${baseGroundedPrompt}`;
            case AILearningMode.FLASHCARDS:
                return `You are a Flashcard Generator. Create clear, concise Q&A pairs suitable for spaced repetition. Format as Question: ... \n Answer: ...${baseGroundedPrompt}`;
            case AILearningMode.PODCAST:
                return `You are an AI Podcast Scriptwriter. Generate a lively dialogue between a Host and a Guest discussing the topic in an engaging, audio-friendly manner.${baseGroundedPrompt}`;
            case AILearningMode.SUMMARY:
                return `You are an Expert Summarizer. Extract the most important information from the provided context and present it in a well-structured summary.${baseGroundedPrompt}`;
            case AILearningMode.BEGINNER:
                return `You are a Tutor for Beginners. Assume the user has zero prior knowledge. Use extremely simple language, metaphors, and avoid jargon.${baseGroundedPrompt}`;
            case AILearningMode.RESEARCH:
                return `You are a Deep Research Assistant. Synthesize information from multiple sources, highlight contrasting viewpoints, and provide a comprehensive analysis.${baseGroundedPrompt}`;
            default:
                return `You are Scholarly AI, a highly intelligent educational assistant.${baseGroundedPrompt}`;
        }
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
    async generateGroundedResponse(mode, history, contextData) {
        const provider = this.getProviderForMode(mode);
        const systemPrompt = this.getSystemPromptForMode(mode, contextData);
        return provider.generateResponse(history, systemPrompt);
    }
    async *generateStreamGroundedResponse(mode, history, contextData) {
        const provider = this.getProviderForMode(mode);
        const systemPrompt = this.getSystemPromptForMode(mode, contextData);
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
