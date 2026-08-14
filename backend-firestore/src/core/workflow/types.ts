import { ChatMessage } from '../../types';
import { ProductRole } from '../../types/roles';

/**
 * Shared workflow types + the pipeline stage enum.
 *
 * Extracted from WorkflowEngine so the orchestrator AND the extracted stage services can
 * import them without a circular dependency (WorkflowEngine imports the services; the
 * services must not import WorkflowEngine). WorkflowEngine re-exports these for backward
 * compatibility, so existing importers (chat.service.ts, IAgent.ts, …) are unchanged.
 */
export enum WorkflowStage {
  INTENT_DETECTION = 'INTENT_DETECTION',
  CONTEXT_ENRICHMENT = 'CONTEXT_ENRICHMENT',
  MEMORY_RETRIEVAL = 'MEMORY_RETRIEVAL',
  GRAPH_RETRIEVAL = 'GRAPH_RETRIEVAL',
  RAG_RETRIEVAL = 'RAG_RETRIEVAL',
  RERANKING = 'RERANKING',
  AGENT_EXECUTION = 'AGENT_EXECUTION',
  VERIFICATION = 'VERIFICATION',
  ASSET_GENERATION = 'ASSET_GENERATION',
  ANALYTICS = 'ANALYTICS',
  MEMORY_UPDATE = 'MEMORY_UPDATE',
}

export interface WorkflowRequest {
  userId: string;
  notebookId?: string;
  sessionId?: string;
  query: string;
  history: ChatMessage[];
  mode?: string;
  model?: string;
  traceId?: string;
  /**
   * Hard learning scope: when the student selects chapters/topics in the Learn pane, this
   * carries the set of source (chapter) ids to restrict vector retrieval to. Retrieval adds a
   * Pinecone `sourceId: { $in: scopeSourceIds }` metadata filter so the tutor is GENUINELY
   * grounded only in the selected chapters — not merely instructed to stay on-topic. Topic /
   * subtopic selections resolve to their parent chapter's sourceId (vectors are chapter-grained),
   * so intra-chapter focus still relies on the soft directive prepended to `query`.
   */
  scopeSourceIds?: string[];
  /** Which product surface the caller belongs to — decides the AI's persona (see prompts.ts). */
  productRole?: ProductRole;
}

export interface WorkflowEvent {
  type: 'progress' | 'reasoning' | 'chunk' | 'citation' | 'asset' | 'warning' | 'metrics' | 'error' | 'done' | 'suggestions';
  stage?: WorkflowStage;
  message?: string;
  /** When true on a 'progress' event, the message carries the REAL result/telemetry of a
   *  completed stage (counts, matched concepts, sources) rather than a generic "in progress"
   *  label. The client shows these as the "how it's doing it internally" detail lines. */
  detail?: boolean;
  /** Reasoning prose for the 'reasoning' event — see TeacherAgent/WorkflowEngine. */
  text?: string;
  chunk?: string;
  /** Short follow-up questions the student might naturally ask next, for the 'suggestions' event. */
  suggestions?: string[];
  citation?: {
    source: string;
    text: string;
    score: number;
    authorityScore: number;
    selectionReasoning: string;
  };
  asset?: {
    type: string;
    id: string;
    preview: string;
  };
  warning?: string;
  metrics?: {
    retrievalMs: number;
    generationMs: number;
    confidenceScore: number;
  };
  data?: any;
}
