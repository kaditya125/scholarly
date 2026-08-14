import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import {
  classesApi,
  type ClassRecord,
  type ClassStatus,
  type ClassUpdate,
} from '../../lib/api/classes';

/**
 * The caller's own classes.
 *
 * Not polled: a teacher's class list only changes when they change it, and every mutation below
 * writes the server's response straight back into the cache. Polling would spend requests to
 * learn nothing.
 */
export function useMyClasses() {
  const { user } = useAuth();
  return useQuery<ClassRecord[]>({
    queryKey: ['classes', 'mine', user?.uid],
    queryFn: () => classesApi.listMine(),
    enabled: !!user?.uid,
    staleTime: 1000 * 15,
  });
}

export function useClass(id: string | undefined) {
  return useQuery<ClassRecord>({
    queryKey: ['class', id],
    queryFn: () => classesApi.get(id as string),
    enabled: !!id,
    staleTime: 1000 * 15,
  });
}

/**
 * Create / update / lifecycle.
 *
 * Each mutation seeds both caches from the server's response rather than optimistically guessing:
 * the server normalises pricing, trims fields and stamps timestamps, so the authoritative record
 * is the one it returns. Optimism here would show the teacher a value the server had rewritten.
 */
export function useClassMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const seed = (record: ClassRecord) => {
    qc.setQueryData(['class', record.id], record);
    qc.invalidateQueries({ queryKey: ['classes', 'mine', user?.uid] });
  };

  const create = useMutation({
    mutationFn: (patch: ClassUpdate) => classesApi.create(patch),
    onSuccess: seed,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ClassUpdate }) => classesApi.update(id, patch),
    onSuccess: seed,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ClassStatus }) => classesApi.setStatus(id, status),
    onSuccess: seed,
  });

  return { create, update, setStatus };
}
