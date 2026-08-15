import { DiscussionsRepository } from '../repositories/discussions.repository';
import { Discussion, DiscussionResponseItem } from '../types';

export class DiscussionsService {
  private repository = new DiscussionsRepository();

  async getDiscussions(params: {
    topics?: string[];
    mine?: boolean;
    status?: string;
    q?: string;
    sort?: string;
    limit?: number;
    currentUid?: string;
  }): Promise<Discussion[]> {
    return this.repository.findFiltered(params);
  }

  async getDiscussionById(id: string, currentUid?: string): Promise<{ discussion: Discussion; responses: DiscussionResponseItem[] } | null> {
    return this.repository.getById(id, currentUid);
  }

  async createDiscussion(data: {
    topic: string;
    title: string;
    description: string;
    roomId?: string;
    tags?: string[];
    participantId: string;
  }): Promise<Discussion> {
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

    const newDiscussion: Omit<Discussion, 'id'> = {
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

  async toggleVote(id: string, currentUid: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.repository.toggleVote(id, currentUid);
  }

  async addResponse(discussionId: string, currentUid: string, text: string): Promise<DiscussionResponseItem> {
    if (!text || !text.trim()) {
      throw new Error('Response text cannot be empty');
    }
    return this.repository.addResponse(discussionId, currentUid, text.trim());
  }

  async setBestResponse(discussionId: string, responseId: string, currentUid: string): Promise<void> {
    return this.repository.setBestResponse(discussionId, responseId, currentUid);
  }

  async setStatus(discussionId: string, status: 'active' | 'resolved' | 'closed', currentUid: string): Promise<void> {
    return this.repository.setStatus(discussionId, status, currentUid);
  }

  async getTrending(limit = 6): Promise<Discussion[]> {
    return this.repository.getTrending(limit);
  }

  async getContributors(limit = 5): Promise<{ uid: string; displayName: string; photoURL?: string; posts: number }[]> {
    return this.repository.getContributors(limit);
  }

  private simulateAIModeration(title: string, description: string): boolean {
    const toxicWords = ['hate speech', 'illegal activity', 'phishing scam'];
    const content = (title + ' ' + description).toLowerCase();
    return !toxicWords.some((w) => content.includes(w));
  }

  private simulateAITitleGeneration(description: string): string {
    return description.substring(0, 40) + '...';
  }

  private simulateAISummarization(description: string): string {
    if (!description || description.length < 50) return '';
    return `AI Summary: ${description.substring(0, 100)}...`;
  }
}
