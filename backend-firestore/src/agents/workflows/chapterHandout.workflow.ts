import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { WorkflowTemplate } from './WorkflowTemplate';
import { clarifyChapter } from './chapterBriefing.workflow';

/**
 * Chapter handout — the first workflow whose result is a document (Phase 4).
 *
 * "Make a PDF on Laws of Motion, Class 11 Physics" becomes five real tool calls:
 *   1. resolve_curriculum_chapter   — which chapter is meant
 *   2. get_chapter_knowledge_graph  ┐ in parallel, after (1)
 *   3. get_chapter_assets           ┘
 *   4. compose_chapter_handout      — deterministic assembly, no model
 *   5. create_document_artifact     — render and store the PDF the student owns
 *
 * It is the shape the flagship formula chart (Phase 5) will follow — resolve, gather, compose,
 * render — minus the formula verification, which is why this handout leaves formulae out.
 *
 * If the chapter is not identified confidently, steps 2–5 never run (their inputs reference a
 * chapter that does not exist) and the student is asked which chapter they meant. Nothing is
 * rendered and nothing is charged against their document quota.
 */

export const chapterHandoutWorkflow: WorkflowTemplate = {
  id: 'chapter_handout',
  title: 'Chapter handout',
  description:
    "Builds a printable PDF handout for an NCERT chapter — its sections, key concepts and how they connect — from Sadhya's corpus.",
  budget: { maxSteps: 6, maxToolCalls: 8, maxExecutionMs: 120_000 },

  buildPlan(goal: string): AgentPlan {
    const chapterRef = (path: string) => ({ $ref: 'resolve_chapter', path });
    const composed = (path: string) => ({ $ref: 'compose', path });
    return {
      goal,
      workflowId: 'chapter_handout',
      estimatedComplexity: 'medium',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'chapter_resolved', description: 'The chapter is identified in the NCERT corpus with confidence' },
        { id: 'document_rendered', description: 'A PDF built only from the chapter’s own material is stored for the student' },
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
          label: 'Reading the chapter’s concepts',
          type: 'retrieve',
          tool: 'get_chapter_knowledge_graph',
          input: { notebookId: chapterRef('notebookId'), sourceId: chapterRef('sourceId'), limit: 25 },
          dependsOn: ['resolve_chapter'],
        },
        {
          id: 'assets',
          objective: 'See what study material already exists for that chapter',
          label: 'Checking existing study material',
          type: 'retrieve',
          tool: 'get_chapter_assets',
          input: { notebookId: chapterRef('notebookId'), chapterTitle: chapterRef('chapterTitle') },
          dependsOn: ['resolve_chapter'],
        },
        {
          id: 'compose',
          objective: 'Assemble the handout from the chapter’s own headings, concepts and material',
          label: 'Putting the handout together',
          type: 'transform',
          tool: 'compose_chapter_handout',
          input: {
            chapter: { $ref: 'resolve_chapter' },
            graph: { $ref: 'graph' },
            assets: { $ref: 'assets' },
          },
          dependsOn: ['resolve_chapter', 'graph', 'assets'],
        },
        {
          id: 'render',
          objective: 'Render the handout to a PDF the student owns',
          label: 'Creating the PDF',
          type: 'export',
          tool: 'create_document_artifact',
          input: {
            title: composed('title'),
            subtitle: composed('subtitle'),
            sourceNote: composed('sourceNote'),
            footerNote: composed('footerNote'),
            sections: composed('sections'),
          },
          dependsOn: ['compose'],
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
    if (!resolved?.resolved) return clarifyChapter(resolved, completed, failed);

    const artifact = outputs.get('render') as any;
    const composed = outputs.get('compose') as any;
    const chapter = { notebookId: resolved.notebookId, sourceId: resolved.sourceId, chapterName: resolved.chapterName };

    if (!artifact?.artifactId) {
      return {
        outcome: 'partial',
        summary: [
          `I found **${resolved.chapterName}** in ${resolved.bookTitle}, but couldn't finish the handout.`,
          failed.length ? '' : undefined,
          failed.length ? `What went wrong: ${failed.join('; ')}.` : undefined,
        ]
          .filter((l) => l !== undefined)
          .join('\n'),
        data: { chapter },
        completed,
        failed,
      };
    }

    const sectionNames: string[] = (composed?.sections ?? []).map((s: any) => s.heading);
    return {
      outcome: 'success',
      summary: [
        `## ${composed?.title ?? resolved.chapterName} — handout ready`,
        '',
        `I made a ${artifact.pageCount}-page PDF from ${resolved.bookTitle}${sectionNames.length ? `: ${sectionNames.join(' · ')}` : ''}.`,
        '',
        'Everything in it comes from the chapter itself. Formulae are left out until they can be checked against the textbook.',
      ].join('\n'),
      data: { chapter, artifactId: artifact.artifactId, pageCount: artifact.pageCount },
      completed,
      failed,
    };
  },
};
