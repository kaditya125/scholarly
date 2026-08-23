"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsService = void 0;
const discussions_repository_1 = require("../repositories/discussions.repository");
class DiscussionsService {
    repository = new discussions_repository_1.DiscussionsRepository();
    async getDiscussions(params) {
        return this.repository.findFiltered(params);
    }
    async getDiscussionById(id, currentUid) {
        return this.repository.getById(id, currentUid);
    }
    async createDiscussion(data) {
        // Basic AI Moderation check
        const isAppropriate = this.simulateAIModeration(data.title, data.description);
        if (!isAppropriate) {
            throw new Error('Content violates community guidelines.');
        }
        let finalTitle = data.title;
        if (!finalTitle || finalTitle.trim() === '') {
            finalTitle = this.simulateAITitleGeneration(data.description);
        }
        const aiSummary = this.simulateAISummarization(data.description);
        const newDiscussion = {
            chapter: data.topic || 'General',
            topic: data.topic || 'General',
            title: finalTitle,
            description: data.description || '',
            roomId: data.roomId || 'general',
            authorId: data.participantId,
            tags: Array.isArray(data.tags) ? data.tags : [],
            status: 'active',
            replies: 0,
            views: 1,
            likes: [],
            likeCount: 0,
            liked: false,
            participants: [data.participantId],
            aiAssisted: true,
            aiSummary: aiSummary,
            similarThreadIds: [],
            createdAt: Date.now(),
        };
        return this.repository.create(newDiscussion);
    }
    async toggleVote(id, currentUid) {
        return this.repository.toggleVote(id, currentUid);
    }
    async addResponse(discussionId, currentUid, text) {
        if (!text || !text.trim()) {
            throw new Error('Response text cannot be empty');
        }
        return this.repository.addResponse(discussionId, currentUid, text.trim());
    }
    async setBestResponse(discussionId, responseId, currentUid) {
        return this.repository.setBestResponse(discussionId, responseId, currentUid);
    }
    async setStatus(discussionId, status, currentUid) {
        return this.repository.setStatus(discussionId, status, currentUid);
    }
    async getTrending(limit = 6) {
        return this.repository.getTrending(limit);
    }
    async getContributors(limit = 5) {
        return this.repository.getContributors(limit);
    }
    simulateAIModeration(title, description) {
        const toxicWords = ['hate speech', 'illegal activity', 'phishing scam'];
        const content = (title + ' ' + description).toLowerCase();
        return !toxicWords.some((w) => content.includes(w));
    }
    simulateAITitleGeneration(description) {
        return description.substring(0, 40) + '...';
    }
    simulateAISummarization(description) {
        if (!description || description.length < 50)
            return '';
        return `AI Summary: ${description.substring(0, 100)}...`;
    }
}
exports.DiscussionsService = DiscussionsService;
