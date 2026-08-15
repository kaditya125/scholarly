/**
 * Planning React Query Hooks
 * 
 * Custom hooks for managing conversational planning sessions with React Query.
 * Provides mutations for starting sessions and responding to AI, with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  planningApi,
  StartPlanningRequest,
  RespondToPlanningRequest,
} from '../../lib/api/planning';
import type { PlanningSession, ConversationMessage } from '../../types/workspace.types';
import { useAuth } from '../../lib/AuthContext';

/**
 * Hook to fetch a specific planning session
 */
export function usePlanningSession(sessionId: string | null) {
  const query = useQuery({
    queryKey: ['planning-session', sessionId],
    queryFn: () => planningApi.getSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 1000 * 60, // 1 minute
    retry: 2,
  });

  return {
    session: query.data?.session,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch all planning sessions for the current user
 */
export function useUserPlanningSessions() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['planning-sessions', user?.uid],
    queryFn: () => planningApi.getUserSessions(user!.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 30, // 30 seconds
    retry: 2,
  });

  return {
    sessions: query.data?.sessions || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook to start a new planning session
 */
export function useStartPlanning() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (req: StartPlanningRequest) => planningApi.start(req),
    onSuccess: (data) => {
      // Invalidate user sessions list
      queryClient.invalidateQueries({ queryKey: ['planning-sessions', user?.uid] });
      
      // Set the new session in cache
      queryClient.setQueryData(
        ['planning-session', data.sessionId],
        { session: { id: data.sessionId, messages: data.messages, status: data.status } }
      );
    },
  });

  return {
    startPlanning: mutation.mutateAsync,
    isStarting: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
  };
}

/**
 * Hook to respond to the AI during a planning conversation
 * Includes optimistic updates for better UX
 */
export function useRespondToPlanning(sessionId: string | null) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (req: RespondToPlanningRequest) => planningApi.respond(req),
    
    // Optimistic update: immediately show user's message in the UI
    onMutate: async (req) => {
      if (!sessionId) return;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['planning-session', sessionId] });

      // Snapshot the previous value
      const previousSession = queryClient.getQueryData<{ session: PlanningSession }>([
        'planning-session',
        sessionId,
      ]);

      // Optimistically add user message if it's a text message
      if (req.responseType === 'text_message' && req.data?.message) {
        const optimisticMessage: ConversationMessage = {
          id: `temp-${Date.now()}`,
          type: 'text',
          role: 'user',
          content: req.data.message,
          timestamp: new Date().toISOString(),
        };

        queryClient.setQueryData<{ session: PlanningSession }>(
          ['planning-session', sessionId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              session: {
                ...old.session,
                messages: [...old.session.messages, optimisticMessage],
              },
            };
          }
        );
      }

      // Return context for rollback
      return { previousSession };
    },

    // On error, rollback to previous state
    onError: (err, req, context) => {
      if (context?.previousSession && sessionId) {
        queryClient.setQueryData(['planning-session', sessionId], context.previousSession);
      }
    },

    // On success, update with server response
    onSuccess: (data, req) => {
      if (!sessionId) return;

      queryClient.setQueryData<{ session: PlanningSession }>(
        ['planning-session', sessionId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            session: {
              ...old.session,
              messages: data.messages,
              status: data.status as PlanningSession['status'],
              readyToGenerate: data.readyToGenerate,
              lessonPlan: data.planId ? old.session.lessonPlan : undefined,
            },
          };
        }
      );
    },
  });

  return {
    respond: mutation.mutateAsync,
    isResponding: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
  };
}

/**
 * Hook to cancel a planning session
 */
export function useCancelPlanning() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (sessionId: string) => planningApi.cancelSession(sessionId),
    onSuccess: (_, sessionId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: ['planning-session', sessionId] });
      
      // Invalidate user sessions list
      queryClient.invalidateQueries({ queryKey: ['planning-sessions', user?.uid] });
    },
  });

  return {
    cancelSession: mutation.mutateAsync,
    isCanceling: mutation.isPending,
  };
}

/**
 * Combined hook for managing a planning conversation
 * Provides all necessary operations for a planning session
 */
export function usePlanningConversation(sessionId: string | null) {
  const session = usePlanningSession(sessionId);
  const respond = useRespondToPlanning(sessionId);
  const cancel = useCancelPlanning();

  return {
    // Session data
    session: session.session,
    messages: session.session?.messages || [],
    status: session.session?.status,
    isLoading: session.isLoading,
    isError: session.isError,
    
    // Actions
    respond: respond.respond,
    isResponding: respond.isResponding,
    cancelSession: cancel.cancelSession,
    isCanceling: cancel.isCanceling,
    
    // Utils
    refetch: session.refetch,
  };
}
