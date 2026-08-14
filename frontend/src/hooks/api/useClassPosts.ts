import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { classPostsApi, type ClassPost, type CreatePostInput } from '../../lib/api/classPosts';

/**
 * A class's announcements + discussion feed.
 *
 * Same visibility posture as useClassResources: the server decides owner-or-ACTIVE-member, so
 * this hook is shared by the teacher's class page and the student's.
 */
export function useClassPosts(classId: string | undefined, enabled = true) {
  return useQuery<ClassPost[]>({
    queryKey: ['class-posts', classId],
    queryFn: () => classPostsApi.list(classId as string),
    enabled: !!classId && enabled,
    staleTime: 1000 * 15,
  });
}

export function useClassPostMutations(classId: string) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (input: CreatePostInput) => classPostsApi.create(classId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-posts', classId] }),
  });
  return { create };
}
