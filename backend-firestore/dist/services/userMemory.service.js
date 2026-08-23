"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userMemoryService = exports.UserMemoryService = void 0;
const firebase_1 = require("../config/firebase");
const gemini_provider_1 = require("./ai/gemini.provider");
class UserMemoryService {
    llmProvider;
    constructor() {
        this.llmProvider = new gemini_provider_1.GeminiProvider();
    }
    async getUserMemory(userId) {
        const doc = await firebase_1.db.collection('users').doc(userId).collection('memory').doc('global').get();
        return doc.exists ? doc.data() : null;
    }
    /*
     * REMOVED: updateMemoryFromInteraction().
     *
     * It asked the LLM, from a SINGLE chat exchange, to "extract a comma-separated list of topics
     * the student seems to be STRUGGLING with", then persisted that answer to
     * users/{uid}/memory/global.weakTopics and merged it append-only — no evidence, no sample size,
     * no decay, and no way for a topic to ever leave the list once the model had guessed it.
     *
     * That is generated evidence wearing the costume of measurement. The model's job is to explain
     * measured facts, never to manufacture them, and this inverted that: the guess was written to
     * the database and then read back into the system prompt as "Struggling With: ...", where it
     * was indistinguishable from a real measurement to everything downstream.
     *
     * It had no callers, so removing it changes no current behaviour — but leaving an unreferenced
     * fabrication writer in place is a loaded gun: one future `await userMemoryService.update...`
     * would silently start writing invented weaknesses about real students again.
     *
     * The measured equivalent already exists and is kept: quizAttempts.service derives weak topics
     * from actual graded quiz results into userStats.weakTopics, and — unlike this — lets a topic
     * graduate out again once performance improves. Gate 8 consumes the measured signal via
     * LearningStateService.
     */
    /**
     * Generates a logical learning path based on the user's current topic and concept graph.
     */
    async generateLearningPath(userId, currentTopic) {
        const memory = await this.getUserMemory(userId);
        if (!memory || !memory.conceptGraph[currentTopic]) {
            // Use LLM to generate a quick path if not in graph
            const prompt = `Generate a logical 3-step learning path following the topic "${currentTopic}". Return ONLY a comma-separated list of 3 topics.`;
            try {
                const res = await this.llmProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
                return res.reply.split(',').map((t) => t.trim());
            }
            catch (e) {
                return ['Review Fundamentals', 'Practice Questions', 'Advanced Applications'];
            }
        }
        return memory.conceptGraph[currentTopic].slice(0, 3);
    }
    /**
     * Formats the user's memory into a prompt string for the Orchestrator
     */
    async getMemoryPromptContext(userId) {
        const memory = await this.getUserMemory(userId);
        if (!memory)
            return '';
        // Adaptive teaching logic
        let depthModifier = '';
        if (memory.comprehensionDepth === 'beginner') {
            depthModifier = 'The student is a beginner. Explain concepts step-by-step with simple analogies.';
        }
        else if (memory.comprehensionDepth === 'advanced') {
            depthModifier = 'The student has advanced comprehension. Skip basic definitions and focus on edge cases, derivations, and complex applications.';
        }
        /*
         * "Struggles with" / "Excels at" were removed from this block.
         *
         * They were rendered from memory.weakTopics / strongTopics — the list the deleted
         * LLM extractor wrote. Stating them here presents a model's guess back to the model as
         * established fact about the student, which is precisely how a fabrication becomes
         * self-reinforcing: the guess is asserted, the next answer is shaped by it, and the student
         * is told they are weak at something nobody measured.
         *
         * Weakness claims now come only from measured evidence via LearningStateService (Gate 8).
         * Saying nothing here is correct in the meantime: an absent claim is honest, an invented one
         * is not. The instruction below is a teaching-STYLE preference, not an assertion about what
         * the student knows, so it stays.
         */
        if (!depthModifier)
            return '';
        return `\nSTUDENT PROFILE:
- Adaptive Instruction: ${depthModifier}
Adapt your teaching style to this profile.`;
    }
}
exports.UserMemoryService = UserMemoryService;
exports.userMemoryService = new UserMemoryService();
