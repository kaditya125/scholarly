import { api } from './client';

export interface StudyGroupMember {
  userId: string;
  role: 'admin' | 'member';
  joinedAt: number;
}

export interface StudyGroup {
  id: string;
  name: string;
  description: string;
  subject?: string;
  ownerId: string;
  memberIds: string[];
  members: StudyGroupMember[];
  notebookIds: string[];
  plannerIds: string[];
  createdAt: number;
  updatedAt?: number | string;
  weeklyChallenges?: any[];
}

export interface StudyGroupMemberProfile {
  uid: string;
  displayName?: string;
  photoURL?: string;
  email?: string;
  role: 'admin' | 'member';
  isOwner: boolean;
  joinedAt: number;
  [key: string]: any;
}

export interface StudyGroupDetail extends StudyGroup {
  inviteCode?: string;
  activity?: any[];
  memberProfiles?: StudyGroupMemberProfile[];
}

export const studyGroupsApi = {
  async getGroups(): Promise<StudyGroup[]> {
    const response = await api.get('/study-groups');
    return response.data;
  },
  async getGroup(groupId: string): Promise<StudyGroupDetail> {
    const response = await api.get(`/study-groups/${groupId}`);
    return response.data;
  },
  async createGroup(name: string, description?: string, subject?: string): Promise<StudyGroup> {
    const response = await api.post('/study-groups', { name, description, subject });
    return response.data;
  },
  async updateGroup(groupId: string, patch: { name?: string; description?: string; subject?: string }): Promise<StudyGroupDetail> {
    const response = await api.patch(`/study-groups/${groupId}`, patch);
    return response.data;
  },
  async join(code: string): Promise<StudyGroup> {
    const response = await api.post('/study-groups/join', { code });
    return response.data;
  },
  async invite(groupId: string, targetIds: string[]): Promise<StudyGroupDetail> {
    const response = await api.post(`/study-groups/${groupId}/invite`, { targetIds });
    return response.data;
  },
  async addMember(groupId: string, targetUserId: string, role: string = 'member'): Promise<void> {
    await api.post(`/study-groups/${groupId}/members`, { targetUserId, role });
  },
  async removeMember(groupId: string, memberId: string): Promise<StudyGroupDetail> {
    const response = await api.delete(`/study-groups/${groupId}/members/${memberId}`);
    return response.data;
  },
  async setRole(groupId: string, memberId: string, role: 'admin' | 'member'): Promise<StudyGroupDetail> {
    const response = await api.patch(`/study-groups/${groupId}/members/${memberId}`, { role });
    return response.data;
  },
  async leave(groupId: string): Promise<void> {
    await api.post(`/study-groups/${groupId}/leave`);
  },
  async deleteGroup(groupId: string): Promise<void> {
    await api.delete(`/study-groups/${groupId}`);
  }
};
