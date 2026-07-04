import { api } from './client';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
}

export const flashcardsApi = {
  async getCards(): Promise<Flashcard[]> {
    const response = await api.get('/flashcards');
    return response.data;
  },
  
  async addCard(card: Omit<Flashcard, 'id' | 'createdAt'>): Promise<Flashcard> {
    const response = await api.post('/flashcards', card);
    return response.data;
  },

  async deleteCard(id: string): Promise<void> {
    await api.delete(`/flashcards/${id}`);
  }
};
