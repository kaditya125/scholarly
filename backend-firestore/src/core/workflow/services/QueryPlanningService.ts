/**
 * The retrieval/routing decisions for a chat turn — extracted verbatim from the inline
 * WorkflowEngine logic so they can be reasoned about and unit-tested in isolation.
 */
export interface QueryPlan {
  /** True when the turn should run a live web search (research mode or time-sensitive query). */
  needsWebSearch: boolean;
  /** True when the controller folded an uploaded file's text into the message. */
  hasAttachment: boolean;
  /** True when the query is a greeting, self-introduction, or capability question ("what can you do for me") that needs no textbook RAG. */
  isConversational: boolean;
}

/**
 * QueryPlanningService — decides how a query should be routed through retrieval:
 *   - web search when the mode is RESEARCH or the query looks time-sensitive,
 *   - attachment detection (an uploaded file's text is the primary source), and
 *   - conversational / capability detection to bypass irrelevant textbook RAG.
 * Pure and synchronous.
 */
export class QueryPlanningService {
  plan(query: string, mode: string): QueryPlan {
    const queryLower = (query || '').toLowerCase().trim();
    const needsWebSearch =
      mode === 'RESEARCH' || mode === 'research' ||
      /(news|current|latest|update|today|recent|now)/.test(queryLower);
    const hasAttachment = /\[File Attached:/i.test(query);

    const isConversational =
      /^(what\s*can\s*you\s*do|how\s*can\s*you\s*help|what\s*do\s*you\s*do|what\s*are\s*you|what\s*are\s*your\s*features|who\s*are\s*you|who\s*made\s*you|what\s*is\s*your\s*name|tell\s*me\s*about\s*yourself|what\s*is\s*sadhya|how\s*does\s*this\s*work|how\s*do\s*you\s*work|hello|hi|hey|greetings|help|guide\s*me|can\s*you\s*help|thank\s*you|thanks|bye|goodbye)\b/i.test(queryLower);

    return { needsWebSearch, hasAttachment, isConversational };
  }
}

export const queryPlanningService = new QueryPlanningService();
