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
    /**
     * Analyzes a chat interaction to extract memory insights (e.g., struggling with a topic)
     */
    async updateMemoryFromInteraction(userId, userMessage, aiResponse) {
        const currentMemory = await this.getUserMemory(userId) || {
            weakTopics: [],
            strongTopics: [],
            learningSpeed: 'medium',
            comprehensionDepth: 'beginner',
            lastRevisionDate: new Date().toISOString(),
            preferredModes: [],
            conceptGraph: {}
        };
        // Fast AI extraction of learning insights
        const prompt = `Analyze this interaction between a student and a teacher AI.
    Student: "${userMessage}"
    Teacher: "${aiResponse}"
    
    Extract a single comma-separated list of topics the student seems to be STRUGGLING with. If none, output "NONE".`;
        try {
            const insight = await this.llmProvider.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
            const newWeakTopics = insight.reply.split(',').map((t) => t.trim().toLowerCase()).filter((t) => t !== 'none' && t !== '');
            if (newWeakTopics.length > 0) {
                const updatedWeakTopics = Array.from(new Set([...currentMemory.weakTopics, ...newWeakTopics]));
                await firebase_1.db.collection('users').doc(userId).collection('memory').doc('global').set({
                    ...currentMemory,
                    weakTopics: updatedWeakTopics,
                    lastInteractionDate: new Date().toISOString()
                }, { merge: true });
            }
        }
        catch (e) {
            console.error('Failed to update user memory:', e);
        }
    }
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
        return `\nSTUDENT PROFILE:
- Struggles with: ${memory.weakTopics.join(', ')}
- Excels at: ${memory.strongTopics.join(', ')}
- Adaptive Instruction: ${depthModifier}
Adapt your teaching style to this profile.`;
    }
}
exports.UserMemoryService = UserMemoryService;
exports.userMemoryService = new UserMemoryService();
