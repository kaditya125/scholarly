import { api } from './client';

export interface StudyGroup {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  memberIds: string[];
  members: { userId: string; role: 'admin' | 'member'; joinedAt: number }[];
  notebookIds: string[];
  plannerIds: string[];
  createdAt: number;
  weeklyChallenges: any[];
}

export const studyGroupsApi = {
  async getGroups(): Promise<StudyGroup[]> {
    const response = await api.get('/study-groups');
    return response.data;
  },
  async createGroup(name: string, description: string): Promise<StudyGroup> {
    const response = await api.post('/study-groups', { name, description });
    return response.data;
  },
  async addMember(groupId: string, targetUserId: string, role: string = 'member'): Promise<void> {
    await api.post(`/study-groups/${groupId}/members`, { targetUserId, role });
  }
};
