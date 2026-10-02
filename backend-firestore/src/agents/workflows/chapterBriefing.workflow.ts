import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { WorkflowTemplate } from './WorkflowTemplate';

/**
 * Chapter briefing — the Phase 2 reference workflow, and the groundwork for the flagship formula
 * chart (Phase 5).
 *
 * "Laws of Motion, Class 11 Physics" becomes three real tool calls:
 *   1. resolve_curriculum_chapter    — which NCERT chapter is meant, with a confidence
 *   2. get_chapter_knowledge_graph   — the concepts and relationships in that chapter  ┐ parallel,
 *   3. get_chapter_assets            — what Sadhya has already generated for it        ┘ after (1)
 *
 * No model call is involved. Two honesty rules carry over from Phase 1: when the chapter cannot be
 * identified confidently the run asks which one was meant instead of guessing, and when a chapter
 * is identified nothing is invented beyond what the corpus holds.
 *
 * `retrieve_curriculum_context` is deliberately NOT in this plan: it embeds the query, and the
 * Vertex embedding quota (~5/min) is shared with live student retrieval. A briefing already has
 * the chapter's real headings, concepts and assets without spending it.
 */

const list = (items: string[], limit: number): string => items.slice(0, limit).join(', ');

/**
 * The answer when the resolver was not confident: ask, never guess. Shared by every workflow that
 * starts by resolving a chapter, so they all ask the same way. The options are real chapters.
 */
export function clarifyChapter(resolved: any, completed: string[], failed: string[]): AgentRunResult {
  const options: string[] = (resolved?.alternatives ?? []).map((a: any) => a.chapterName).filter(Boolean);
  const books: string[] = (resolved?.candidateBooks ?? []).map((b: any) => b.title).filter(Boolean);
  const lines = ["**I couldn't pin down which chapter you mean.**"];
  if (options.length) lines.push('', `Did you mean one of these? ${list(options, 3)}.`);
  else if (books.length) lines.push('', `Tell me the class and subject — for example: ${list(books, 3)}.`);
  else lines.push('', 'Tell me the class and subject, for example "Class 11 Physics, Laws of Motion".');
  lines.push('', "I won't guess a chapter, because working on the wrong one wastes your time.");
  return {
    outcome: 'no_result',
    summary: lines.join('\n'),
    data: { needsClarification: true, alternatives: resolved?.alternatives ?? [] },
    completed,
    failed,
  };
}

export const chapterBriefingWorkflow: WorkflowTemplate = {
  id: 'chapter_briefing',
  title: 'Chapter briefing',
  description:
    'Identifies an NCERT chapter from how a student describes it, then reports its sections, key concepts and the study material Sadhya already holds for it.',
  budget: { maxSteps: 4, maxToolCalls: 8, maxExecutionMs: 90_000 },

  buildPlan(goal: string): AgentPlan {
    return {
      goal,
      workflowId: 'chapter_briefing',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'chapter_resolved', description: 'The chapter is identified in the NCERT corpus with confidence' },
        { id: 'chapter_evidence', description: 'Its knowledge graph or existing assets were retrieved' },
      ],
      steps: [
        {
          id: 'resolve_chapter',
          objective: 'Identify which NCERT chapter the student means',
          label: 'Finding the chapter',
          type: 'retrieve',
          tool: 'resolve_curriculum_chapter',
          input: { query: goal.slice(0, 300) },
          dependsOn: [],
        },
        {
          id: 'graph',
          objective: 'Read the concepts and relationships extracted from that chapter',
          label: 'Reading the chapter’s concept graph',
          type: 'retrieve',
          tool: 'get_chapter_knowledge_graph',
          input: {
            notebookId: { $ref: 'resolve_chapter', path: 'notebookId' },
            sourceId: { $ref: 'resolve_chapter', path: 'sourceId' },
            limit: 25,
          },
          dependsOn: ['resolve_chapter'],
          optional: true,
        },
        {
          id: 'assets',
          objective: 'List the study material Sadhya already holds for that chapter',
          label: 'Checking existing study material',
          type: 'retrieve',
          tool: 'get_chapter_assets',
          input: {
            notebookId: { $ref: 'resolve_chapter', path: 'notebookId' },
            chapterTitle: { $ref: 'resolve_chapter', path: 'chapterTitle' },
          },
          dependsOn: ['resolve_chapter'],
          optional: true,
        },
      ],
    };
  },

  evaluate({ steps, outputs }): AgentRunResult {
    const completed: string[] = [];
    const failed: string[] = [];
    for (const s of steps.values()) {
      if (s.status === 'completed') completed.push(s.label);
      else if (s.status === 'failed') failed.push(`${s.label} — ${s.error?.message ?? 'failed'}`);
    }

    const resolved = outputs.get('resolve_chapter') as any;
    const data: Record<string, unknown> = {};

    // Not confident: ask, never guess. The alternatives are real chapters from the corpus.
    if (!resolved?.resolved) return clarifyChapter(resolved, completed, failed);

    const lines: string[] = [
      `## ${resolved.chapterName} — ${resolved.bookTitle}`,
      '',
      `Identified from your wording with ${Math.round((resolved.confidence ?? 0) * 100)}% confidence (${resolved.chapterTitle}).`,
    ];
    data.chapter = {
      notebookId: resolved.notebookId,
      sourceId: resolved.sourceId,
      chapterName: resolved.chapterName,
      chapterTitle: resolved.chapterTitle,
      confidence: resolved.confidence,
    };

    const headings: string[] = resolved.headings ?? [];
    if (headings.length) {
      lines.push('', `**Sections in this chapter** — ${list(headings, 8)}${headings.length > 8 ? ` (+${headings.length - 8} more)` : ''}.`);
    }

    const graph = outputs.get('graph') as any;
    if (graph?.nodeCount > 0) {
      const concepts = (graph.nodes ?? []).filter((n: any) => n.type === 'CONCEPT').map((n: any) => n.label);
      const formulae = (graph.nodes ?? []).filter((n: any) => n.type === 'FORMULA').map((n: any) => n.label);
      lines.push('', `**Concepts Sadhya has mapped** — ${graph.nodeCount} from this chapter, linked by ${graph.edgeCount} relationships.`);
      if (concepts.length) lines.push(`Key concepts: ${list(concepts, 8)}.`);
      if (formulae.length) lines.push(`Formulae found in the text: ${list(formulae, 6)}.`);
      data.graph = { nodeCount: graph.nodeCount, edgeCount: graph.edgeCount };
    } else if (steps.get('graph')?.status === 'completed') {
      lines.push('', 'Sadhya has not mapped any concepts from this chapter yet.');
    }

    const assets = outputs.get('assets') as any;
    if (assets?.assetCount > 0) {
      const readable = (assets.types ?? []).map((t: string) => t.toLowerCase().replace(/_/g, ' '));
      lines.push('', `**Already available for this chapter** — ${assets.assetCount} study assets: ${list(readable, 8)}.`);
      data.assets = { assetCount: assets.assetCount, types: assets.types };
    } else if (steps.get('assets')?.status === 'completed') {
      lines.push('', 'No study material has been generated for this chapter yet.');
    }

    const gotEvidence = Boolean(graph?.nodeCount) || Boolean(assets?.assetCount);
    return {
      outcome: gotEvidence ? 'success' : 'partial',
      summary: lines.join('\n'),
      data,
      completed,
      failed,
    };
  },
};
