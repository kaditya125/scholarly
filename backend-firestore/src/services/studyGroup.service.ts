import { studyGroupRepository } from '../repositories/studyGroup.repository';
import { StudyGroup } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class StudyGroupService {
  async createGroup(userId: string, name: string, description: string): Promise<StudyGroup> {
    const group: StudyGroup = {
      id: uuidv4(),
      name,
      description,
      ownerId: userId,
      memberIds: [userId],
      members: [{ userId, role: 'admin', joinedAt: Date.now() }],
      notebookIds: [],
      plannerIds: [],
      createdAt: Date.now(),
      weeklyChallenges: []
    };
    await studyGroupRepository.createGroup(group);
    return group;
  }

  async getGroups(userId: string): Promise<StudyGroup[]> {
    return await studyGroupRepository.getGroupsByUser(userId);
  }

  async addMember(groupId: string, ownerId: string, targetUserId: string, role: 'admin' | 'member' = 'member'): Promise<void> {
    const group = await studyGroupRepository.getGroupById(groupId);
    if (!group) throw new Error('Group not found');
    
    // Check auth
    const callerMember = group.members.find(m => m.userId === ownerId);
    if (!callerMember || callerMember.role !== 'admin') {
      throw new Error('Unauthorized');
    }

    if (!group.memberIds.includes(targetUserId)) {
      group.memberIds.push(targetUserId);
      group.members.push({ userId: targetUserId, role, joinedAt: Date.now() });
      await studyGroupRepository.updateGroup(groupId, { memberIds: group.memberIds, members: group.members });
    }
  }
}

export const studyGroupService = new StudyGroupService();
