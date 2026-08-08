import { api } from './client';

export type DoubtStatus = 'open' | 'reviewed';

export interface Doubt {
  id: string;
  notebookId?: string;
  sourceId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  subject?: string;
  page?: number;
  questionText: string;
  action?: string;
  answer: string;
  imageDataUrl?: string;
  thumbDataUrl?: string;
  notes?: string;
  tags: string[];
  status: DoubtStatus;
  createdAt: number;
  updatedAt: number;
}

export interface DoubtPreview {
  id: string;
  notebookId?: string;
  sourceId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  subject?: string;
  page?: number;
  questionText: string;
  answerPreview: string;
  thumbDataUrl?: string;
  notes?: string;
  tags: string[];
  status: DoubtStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDoubtInput {
  notebookId?: string;
  sourceId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  subject?: string;
  page?: number;
  questionText: string;
  action?: string;
  answer: string;
  imageDataUrl?: string;
  thumbDataUrl?: string;
  notes?: string;
}

export const doubtsApi = {
  async create(input: CreateDoubtInput): Promise<Doubt> {
    const { data } = await api.post('/doubts', input);
    return data;
  },
  async list(params?: { status?: DoubtStatus; subject?: string }): Promise<DoubtPreview[]> {
    const { data } = await api.get('/doubts', { params });
    return data;
  },
  async get(id: string): Promise<Doubt> {
    const { data } = await api.get(`/doubts/${id}`);
    return data;
  },
  async update(id: string, patch: { notes?: string; status?: DoubtStatus; tags?: string[] }): Promise<Doubt> {
    const { data } = await api.patch(`/doubts/${id}`, patch);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/doubts/${id}`);
  },
};
