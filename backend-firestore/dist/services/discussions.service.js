"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsService = void 0;
const discussions_repository_1 = require("../repositories/discussions.repository");
class DiscussionsService {
    repository = new discussions_repository_1.DiscussionsRepository();
    async getDiscussions(roomId, limit) {
        return this.repository.findByRoom(roomId, limit);
    }
    async createDiscussion(data) {
        // Simulate AI Moderation
        const isAppropriate = this.simulateAIModeration(data.title, data.description);
        if (!isAppropriate) {
            throw new Error("Content violates community guidelines.");
        }
        // Duplicate Detection (Similarity Search Mock)
        const similarThreads = await this.findSimilarThreads(data.title, data.roomId);
        if (similarThreads.length > 0) {
            // In a real app we might return a 409 or a warning. 
            // For now, we'll just link them.
        }
        // Simulate AI Summarization / Title generation if title is empty
        let finalTitle = data.title;
        if (!finalTitle || finalTitle.trim() === '') {
            finalTitle = this.simulateAITitleGeneration(data.description);
        }
        const aiSummary = this.simulateAISummarization(data.description);
        const newDiscussion = {
            chapter: 'General',
            topic: data.topic,
            title: finalTitle,
            description: data.description,
            roomId: data.roomId,
            replies: 0,
            views: 0,
            participants: [data.participantId],
            aiAssisted: true, // We processed it via AI
            aiSummary: aiSummary,
            similarThreadIds: similarThreads,
            createdAt: Date.now()
        };
        return this.repository.create(newDiscussion);
    }
    simulateAIModeration(title, description) {
        const toxicWords = ['spam', 'abuse', 'hate'];
        const content = (title + ' ' + description).toLowerCase();
        return !toxicWords.some(w => content.includes(w));
    }
    simulateAITitleGeneration(description) {
        return description.substring(0, 30) + "...";
    }
    simulateAISummarization(description) {
        return `AI Summary: This discussion revolves around key concepts mentioned in the description. Exploring the nuances of ${description.split(' ').slice(0, 3).join(' ')}...`;
    }
    async findSimilarThreads(title, roomId) {
        // In production, this would use vector search (Pinecone) to find semantic duplicates
        // For now, return empty or mock
        return [];
    }
}
exports.DiscussionsService = DiscussionsService;
