import { useQuery } from '@tanstack/react-query';
import { graphApi, GraphData } from '../../lib/api/graph';
import { useAuth } from '../../lib/AuthContext';

export function useGraph(notebookId?: string) {
  const { user } = useAuth();

  const graphQuery = useQuery<GraphData>({
    queryKey: ['knowledge_graph', notebookId, user?.uid],
    queryFn: () => graphApi.getGraph(notebookId as string),
    enabled: !!user?.uid && !!notebookId,
  });

  return {
    graph: graphQuery.data || { nodes: [], edges: [] },
    isLoading: graphQuery.isLoading,
    isError: graphQuery.isError,
  };
}
