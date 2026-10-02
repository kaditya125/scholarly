import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { clarifyChapter } from './chapterBriefing.workflow';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * Revision notes for an NCERT chapter (Phase 6): "Make revision notes on Laws of Motion, Class 11
 * Physics."
 *
 *   1. resolve_curriculum_chapter     which chapter — asked about, never guessed
 *   2. write_chapter_revision_notes   key points per section, each stated in the chapter, with its page
 *   3. create_document_artifact       a PDF the student owns
 *
 * An unresolved chapter leaves steps 2–3 unresolved (skipped), and the student is asked which one.
 */

const rejectedText: Record<string, string> = {
  evidence_not_in_source: 'their quoted sentence is not in the chapter',
  claim_not_supported: 'the quoted sentence does not say what the point claims',
  malformed: 'they were incomplete',
};

export const chapterNotesWorkflow: WorkflowTemplate = {
  id: 'chapter_revision_notes',
  title: 'Chapter revision notes',
  description: 'Revision notes for an NCERT chapter, written from the chapter’s own text — every point stated in the chapter, with its page.',
  budget: { maxSteps: 4, maxToolCalls: 5, maxExecutionMs: 180_000 },

  buildPlan(goal: string): AgentPlan {
    const chapter = (path: string) => ({ $ref: 'resolve_chapter', path });
    const notes = (path: string) => ({ $ref: 'notes', path });
    return {
      goal,
      workflowId: 'chapter_revision_notes',
      estimatedComplexity: 'medium',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'chapter_resolved', description: 'The chapter is identified in the NCERT corpus with confidence' },
        { id: 'grounded', description: 'Every point is stated in the chapter, on the page given' },
        { id: 'document_rendered', description: 'The notes are stored as a PDF the student owns' },
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
          id: 'notes',
          objective: 'Write revision notes from the chapter’s own text, section by section',
          label: 'Writing notes from the chapter',
          type: 'generate',
          tool: 'write_chapter_revision_notes',
          input: {
            notebookId: chapter('notebookId'),
            sourceId: chapter('sourceId'),
            chapterName: chapter('chapterName'),
            bookTitle: chapter('bookTitle'),
            headings: chapter('headings'),
          },
          dependsOn: ['resolve_chapter'],
        },
        {
          id: 'render',
          objective: 'Render the notes to a PDF the student owns',
          label: 'Creating the PDF',
          type: 'export',
          tool: 'create_document_artifact',
          input: { title: notes('title'), subtitle: notes('subtitle'), sourceNote: notes('sourceNote'), sections: notes('sections') },
          dependsOn: ['notes'],
        },
      ],
    };
  },

  evaluate({ steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const resolved = outputs.get('resolve_chapter') as any;
    if (!resolved?.resolved) return clarifyChapter(resolved, completed, failed);
    const notes = outputs.get('notes') as any;
    const artifact = outputs.get('render') as any;
    if (!notes || !artifact?.artifactId) {
      return {
        outcome: notes ? 'partial' : 'no_result',
        summary: `I found **${resolved.chapterName}** in ${resolved.bookTitle}, but couldn't ${notes ? 'save the notes as a PDF' : 'write notes from it'}${failed.length ? `: ${failed.join('; ')}` : ''}.`,
        data: { chapter: { notebookId: resolved.notebookId, sourceId: resolved.sourceId } },
        completed,
        failed,
      };
    }
    const rejected = Object.entries(notes.stats?.rejected ?? {}) as Array<[string, number]>;
    const sectionNames: string[] = (notes.sections ?? []).map((s: any) => s.heading);
    return {
      outcome: 'success',
      summary: [
        `## ${notes.title}`,
        '',
        `${notes.stats.kept} points under ${sectionNames.length} of the chapter's sections, from ${resolved.bookTitle}${artifact.pageCount ? ` — a ${artifact.pageCount}-page PDF` : ''}.`,
        'Every point is stated in the chapter; the page of the chapter PDF is given in brackets.',
        rejected.length ? `Left out: ${rejected.map(([r, n]) => `${n} because ${rejectedText[r] ?? r.replace(/_/g, ' ')}`).join('; ')}.` : undefined,
        notes.coveredUpTo ? `The chapter is long, so these notes cover it up to “${notes.coveredUpTo}”.` : undefined,
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
      data: { artifactId: artifact.artifactId, kept: notes.stats.kept, sections: sectionNames.length },
      completed,
      failed,
    };
  },
};
