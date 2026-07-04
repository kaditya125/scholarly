import { api } from './client';

export interface Question {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export const quizApi = {
  async getQuestions(): Promise<Question[]> {
    const response = await api.get('/quiz');
    return response.data;
  },
  
  async submitQuiz(payload: { answers: Record<string, number>, timeSpent: number }): Promise<void> {
    await api.post('/quiz/submit', payload);
  }
};
