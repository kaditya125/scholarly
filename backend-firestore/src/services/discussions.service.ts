import { DiscussionsRepository } from '../repositories/discussions.repository';
import { Discussion } from '../types';

export class DiscussionsService {
  private repository = new DiscussionsRepository();

  async getDiscussions(roomId?: string, limit?: number) {
    return this.repository.findByRoom(roomId, limit);
  }

  async createDiscussion(data: { topic: string, title: string, description: string, roomId: string, participantId: string }): Promise<Discussion> {
    
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

    const newDiscussion: Omit<Discussion, 'id'> = {
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

  private simulateAIModeration(title: string, description: string): boolean {
    const toxicWords = ['spam', 'abuse', 'hate'];
    const content = (title + ' ' + description).toLowerCase();
    return !toxicWords.some(w => content.includes(w));
  }

  private simulateAITitleGeneration(description: string): string {
    return description.substring(0, 30) + "...";
  }

  private simulateAISummarization(description: string): string {
    return `AI Summary: This discussion revolves around key concepts mentioned in the description. Exploring the nuances of ${description.split(' ').slice(0, 3).join(' ')}...`;
  }

  private async findSimilarThreads(title: string, roomId: string): Promise<string[]> {
    // In production, this would use vector search (Pinecone) to find semantic duplicates
    // For now, return empty or mock
    return [];
  }
}
