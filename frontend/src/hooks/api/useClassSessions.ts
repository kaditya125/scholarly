import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { classSessionsApi, type ClassSession, type SessionJoinInfo } from '../../lib/api/classSessions';

/** A class's live-session history. Polls gently while mounted so "Live now" reflects reality without a manual refresh. */
export function useClassSessions(classId: string | undefined, enabled = true) {
  return useQuery<ClassSession[]>({
    queryKey: ['class-sessions', classId],
    queryFn: () => classSessionsApi.list(classId as string),
    enabled: !!classId && enabled,
    staleTime: 1000 * 10,
    refetchInterval: enabled ? 15_000 : false,
  });
}

export function useClassSessionMutations(classId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['class-sessions', classId] });

  const goLive = useMutation({
    mutationFn: (title?: string) => classSessionsApi.goLive(classId, title),
    onSuccess: refresh,
  });

  const end = useMutation({
    mutationFn: (sessionId: string) => classSessionsApi.end(classId, sessionId),
    onSuccess: refresh,
  });

  return { goLive, end };
}

/** The caller's own join info for one session — role and joinUrl are derived server-side from ownership/enrolment. */
export function useSessionJoinInfo(classId: string | undefined, sessionId: string | undefined) {
  return useQuery<SessionJoinInfo>({
    queryKey: ['session-join', classId, sessionId],
    queryFn: () => classSessionsApi.join(classId as string, sessionId as string),
    enabled: !!classId && !!sessionId,
    staleTime: Infinity, // a join code doesn't change for the life of a session
    retry: false,
  });
}
