import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { classResourcesApi, type AttachResourceInput, type ClassResource } from '../../lib/api/classResources';

/**
 * Resources attached to a class.
 *
 * The server enforces visibility (owner or ACTIVE member) — this hook works the same for both a
 * teacher managing their class and a student browsing one they've joined; a student simply gets
 * a 403 the query surfaces as an error if they somehow reach a class they're not in.
 */
export function useClassResources(classId: string | undefined, enabled = true) {
  return useQuery<ClassResource[]>({
    queryKey: ['class-resources', classId],
    queryFn: () => classResourcesApi.list(classId as string),
    enabled: !!classId && enabled,
    staleTime: 1000 * 15,
  });
}

export function useClassResourceMutations(classId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['class-resources', classId] });

  const attach = useMutation({
    mutationFn: (input: AttachResourceInput) => classResourcesApi.attach(classId, input),
    onSuccess: refresh,
  });

  const detach = useMutation({
    mutationFn: (resourceId: string) => classResourcesApi.detach(classId, resourceId),
    onSuccess: refresh,
  });

  return { attach, detach };
}
