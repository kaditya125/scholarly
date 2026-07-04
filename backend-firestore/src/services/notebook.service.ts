import { v4 as uuidv4 } from 'uuid';
import { notebookRepository } from '../repositories/notebook.repository';
import { Notebook, DocumentSource, TimelineEvent, LearningAsset } from '../types';

export class NotebookService {
  async createNotebook(userId: string, title: string, color: string = 'bg-indigo-500'): Promise<Notebook> {
    const notebook: Notebook = {
      id: uuidv4(),
      userId,
      title,
      color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: {
        documentCount: 0,
        conversationCount: 0,
        storageUsedBytes: 0,
        knowledgeGraphNodes: 0,
        flashcardsCount: 0,
        quizCount: 0,
        masteryPercentage: 0,
        completionPercentage: 0
      },
      learningGoals: [],
      weakTopics: [],
      strongTopics: [],
      owner: userId,
      editors: [],
      viewers: []
    };

    await notebookRepository.createNotebook(notebook);
    
    // Add timeline event
    await this.addTimelineEvent(notebook.id, 'NOTEBOOK_CREATED', 'Notebook created successfully.');
    
    return notebook;
  }

  async getNotebooksByUser(userId: string): Promise<Notebook[]> {
    return await notebookRepository.getNotebooksByUser(userId);
  }

  async getNotebookById(id: string): Promise<Notebook | null> {
    return await notebookRepository.getNotebook(id);
  }

  async updateNotebook(id: string, updates: Partial<Notebook>): Promise<void> {
    await notebookRepository.updateNotebook(id, updates);
  }

  async deleteNotebook(id: string): Promise<void> {
    await notebookRepository.deleteNotebook(id);
  }

  // --- Sources ---
  
  async getSources(notebookId: string): Promise<DocumentSource[]> {
    return await notebookRepository.getSources(notebookId);
  }

  // --- Timeline ---
  async addTimelineEvent(notebookId: string, type: TimelineEvent['type'], description: string, metadata?: any): Promise<void> {
    const event: TimelineEvent = {
      id: uuidv4(),
      notebookId,
      type,
      description,
      timestamp: Date.now(),
      metadata
    };
    await notebookRepository.addTimelineEvent(event);
  }

  async getTimeline(notebookId: string): Promise<TimelineEvent[]> {
    return await notebookRepository.getTimeline(notebookId);
  }

  // --- Assets ---
  
  async addLearningAsset(assetData: Omit<LearningAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearningAsset> {
    const asset: LearningAsset = {
      ...assetData,
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await notebookRepository.addLearningAsset(asset);
    
    await this.addTimelineEvent(
      asset.notebookId, 
      asset.type === 'FLASHCARDS' ? 'FLASHCARDS_GENERATED' : 
      asset.type === 'QUIZ' ? 'QUIZ_ATTEMPTED' : 'NOTEBOOK_UPDATED' as any,
      `Generated new ${asset.type.toLowerCase()}`
    );
    
    return asset;
  }

  async getLearningAssets(notebookId: string, type?: string): Promise<LearningAsset[]> {
    return await notebookRepository.getLearningAssets(notebookId, type);
  }
}

export const notebookService = new NotebookService();
