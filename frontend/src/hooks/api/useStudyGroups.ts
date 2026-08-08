import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import { studyGroupsApi, StudyGroup, StudyGroupDetail } from '../../lib/api/studyGroups';

/** The caller's study groups (list) plus create / join actions. */
export function useStudyGroups() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<StudyGroup[]>({
    queryKey: ['studyGroups', user?.uid],
    queryFn: () => studyGroupsApi.getGroups(),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  const invalidateList = () => qc.invalidateQueries({ queryKey: ['studyGroups'] });

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string; subject?: string }) =>
      studyGroupsApi.createGroup(input.name, input.description || '', input.subject),
    onSuccess: invalidateList,
  });

  const join = useMutation({
    mutationFn: (code: string) => studyGroupsApi.join(code),
    onSuccess: invalidateList,
  });

  return {
    groups: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    createGroup: create.mutateAsync,
    joinByCode: join.mutateAsync,
  };
}

/** A single hydrated group (detail) plus all membership mutations, scoped to `groupId`. */
export function useStudyGroup(groupId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user?.uid && !!groupId;
  const key = ['studyGroup', groupId];

  const query = useQuery<StudyGroupDetail>({
    queryKey: key,
    queryFn: () => studyGroupsApi.getGroup(groupId as string),
    enabled,
    staleTime: 1000 * 20,
    retry: false,
  });

  const syncDetail = (detail: StudyGroupDetail) => {
    qc.setQueryData(key, detail);
    qc.invalidateQueries({ queryKey: ['studyGroups'] });
  };
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['studyGroups'] });
  };

  const invite = useMutation({
    mutationFn: (targetIds: string[]) => studyGroupsApi.invite(groupId as string, targetIds),
    onSuccess: syncDetail,
  });
  const update = useMutation({
    mutationFn: (patch: { name?: string; description?: string; subject?: string }) =>
      studyGroupsApi.updateGroup(groupId as string, patch),
    onSuccess: syncDetail,
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) => studyGroupsApi.removeMember(groupId as string, memberId),
    onSuccess: syncDetail,
  });
  const setRole = useMutation({
    mutationFn: (v: { memberId: string; role: 'admin' | 'member' }) =>
      studyGroupsApi.setRole(groupId as string, v.memberId, v.role),
    onSuccess: syncDetail,
  });
  const leave = useMutation({
    mutationFn: () => studyGroupsApi.leave(groupId as string),
    onSuccess: invalidateAll,
  });
  const remove = useMutation({
    mutationFn: () => studyGroupsApi.deleteGroup(groupId as string),
    onSuccess: invalidateAll,
  });

  return {
    group: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as any,
    invite: invite.mutateAsync,
    updateGroup: update.mutateAsync,
    removeMember: removeMember.mutateAsync,
    setRole: setRole.mutateAsync,
    leaveGroup: leave.mutateAsync,
    deleteGroup: remove.mutateAsync,
  };
}
