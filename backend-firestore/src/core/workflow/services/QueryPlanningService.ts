/**
 * The retrieval/routing decisions for a chat turn — extracted verbatim from the inline
 * WorkflowEngine logic so they can be reasoned about and unit-tested in isolation.
 */
export interface QueryPlan {
  /** True when the turn should run a live web search (research mode or time-sensitive query). */
  needsWebSearch: boolean;
  /** True when the controller folded an uploaded file's text into the message. */
  hasAttachment: boolean;
}

/**
 * QueryPlanningService — decides how a query should be routed through retrieval:
 *   - web search when the mode is RESEARCH or the query looks time-sensitive, and
 *   - attachment detection (an uploaded file's text is the primary source, so curriculum
 *     vector search is skipped to avoid injecting unrelated NCERT chapters).
 * Pure and synchronous.
 */
export class QueryPlanningService {
  plan(query: string, mode: string): QueryPlan {
    const queryLower = query.toLowerCase();
    const needsWebSearch =
      mode === 'RESEARCH' || mode === 'research' ||
      /(news|current|latest|update|today|recent|now)/.test(queryLower);
    const hasAttachment = /\[File Attached:/i.test(query);
    return { needsWebSearch, hasAttachment };
  }
}

export const queryPlanningService = new QueryPlanningService();
