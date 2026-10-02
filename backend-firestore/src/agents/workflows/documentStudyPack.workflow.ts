import { AgentPlan, AgentRunResult, AgentStep, RunContext } from '../runtime/agent.types';
import { questionCountFromGoal } from '../tools/adapters/quiz.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * Golden case 4: "Read this uploaded PDF and create revision notes + flashcards + quiz."
 *
 *   1. read_my_document                                   document retrieval
 *   2. write_revision_notes · write_document_flashcards · write_document_quiz   parallel generation
 *   3. create_document_artifact · create_flashcards_artifact · create_quiz_artifact   artifacts
 *
 * Only what is asked for is made ("flashcards from this PDF" makes just the deck); all three when
 * the request names none. Each writer quotes the document for every item and keeps only items whose
 * quote is really there — the document is the student's own, so nothing is added from outside it.
 */

export type StudyPackPart = 'notes' | 'flashcards' | 'quiz';

export function partsFromGoal(goal: string): StudyPackPart[] {
  const g = String(goal ?? '').toLowerCase();
  const parts: StudyPackPart[] = [];
  if (/\b(notes?|summary|summarise|summarize|revision\s+sheet)\b/.test(g)) parts.push('notes');
  if (/\bflash\s*cards?\b/.test(g)) parts.push('flashcards');
  if (/\b(quiz(zes)?|mcqs?|questions?|test)\b/.test(g)) parts.push('quiz');
  return parts.length ? parts : ['notes', 'flashcards', 'quiz'];
}

export const documentStudyPackWorkflow: WorkflowTemplate = {
  id: 'document_study_pack',
  title: 'Study pack from your document',
  description: 'Reads a document you attach (or your latest upload) and makes revision notes, flashcards and a quiz from it, every item quoted from the document.',
  budget: { maxSteps: 8, maxToolCalls: 10, maxExecutionMs: 240_000 },

  buildPlan(goal: string, context?: RunContext): AgentPlan {
    const parts = partsFromGoal(goal);
    const doc = { $ref: 'read', path: 'document' };
    const from = (step: string) => (path: string) => ({ $ref: step, path });
    const steps: AgentStep[] = [
      {
        id: 'read',
        objective: 'Read the student’s document',
        label: context?.uploadIds?.length ? 'Reading your document' : 'Finding your latest upload',
        type: 'retrieve',
        tool: 'read_my_document',
        input: { uploadIds: context?.uploadIds ?? [] },
        dependsOn: [],
      },
    ];
    if (parts.includes('notes')) {
      const n = from('notes');
      steps.push(
        { id: 'notes', objective: 'Write revision notes from the document', label: 'Writing the revision notes', type: 'transform', tool: 'write_revision_notes', input: { document: doc }, dependsOn: ['read'] },
        {
          id: 'save_notes',
          objective: 'Render the notes to a PDF',
          label: 'Making the notes PDF',
          type: 'export',
          tool: 'create_document_artifact',
          input: { title: n('title'), subtitle: n('subtitle'), sourceNote: n('sourceNote'), sections: n('sections') },
          dependsOn: ['notes'],
        },
      );
    }
    if (parts.includes('flashcards')) {
      const c = from('cards');
      steps.push(
        { id: 'cards', objective: 'Write flashcards from the document', label: 'Writing the flashcards', type: 'transform', tool: 'write_document_flashcards', input: { document: doc }, dependsOn: ['read'] },
        { id: 'save_cards', objective: 'Save the deck', label: 'Saving the flashcards', type: 'export', tool: 'create_flashcards_artifact', input: { title: c('title'), cards: c('cards') }, dependsOn: ['cards'] },
      );
    }
    if (parts.includes('quiz')) {
      const q = from('quiz');
      steps.push(
        { id: 'quiz', objective: 'Write and check a quiz from the document', label: 'Writing and checking the quiz', type: 'transform', tool: 'write_document_quiz', input: { document: doc, count: questionCountFromGoal(goal, 10) }, dependsOn: ['read'] },
        {
          id: 'save_quiz',
          objective: 'Save the quiz for the student to take',
          label: 'Saving the quiz',
          type: 'export',
          tool: 'create_quiz_artifact',
          input: {
            title: q('title'),
            questions: q('questions'),
            topics: q('topics'),
            origin: q('origin'),
            durationMinutes: q('durationMinutes'),
            validation: q('validation'),
            sourceNote: q('sourceNote'),
            source: 'notebook',
          },
          dependsOn: ['quiz'],
        },
      );
    }
    return {
      goal,
      workflowId: 'document_study_pack',
      estimatedComplexity: 'medium',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'document', description: 'The student’s own document is read' },
        { id: 'grounded', description: 'Every note, card and question is quoted from the document' },
        { id: 'artifacts', description: `The ${parts.join(', ')} are saved for the student` },
      ],
      steps,
    };
  },

  evaluate({ plan, steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const read = outputs.get('read') as any;
    if (!read?.found) {
      return {
        outcome: 'no_result',
        summary: 'I couldn’t find a document to read. Attach the PDF to your message (the paper-clip button) in Agent mode, or upload it to one of your notebooks, and ask again.',
        data: {},
        completed,
        failed,
      };
    }
    const want = plan.steps.filter((s) => s.id.startsWith('save_')).map((s) => s.id);
    const made = want.filter((id) => (outputs.get(id) as any)?.artifactId);
    const notes = outputs.get('notes') as any;
    const cards = outputs.get('cards') as any;
    const quiz = outputs.get('quiz') as any;
    const lines = [
      `## From “${read.document.title}”`,
      '',
      `I read your document (${read.pageCount} page${read.pageCount === 1 ? '' : 's'}${read.via === 'latest_upload' ? ', your most recent upload' : ''})${read.truncated ? ` and worked from pages ${read.usedPages[0]}–${read.usedPages[1]}, the opening part of it` : ''}. Everything below is quoted from it, with the page.`,
      '',
    ];
    if (notes && (outputs.get('save_notes') as any)?.artifactId) {
      lines.push(`- **Revision notes** — ${notes.stats.kept} points across ${notes.sections.length} parts (${notes.stats.checked - notes.stats.kept} dropped because their quote didn’t match your document).`);
    }
    if (cards && (outputs.get('save_cards') as any)?.artifactId) lines.push(`- **Flashcards** — ${cards.stats.kept} cards.`);
    if (quiz && (outputs.get('save_quiz') as any)?.artifactId) {
      lines.push(`- **Quiz** — ${quiz.questions.length} questions; ${quiz.validation.checked - quiz.questions.length} of ${quiz.validation.checked} written were set aside by the checks.`);
    }
    if (failed.length) lines.push('', `Couldn’t finish: ${failed.join('; ')}.`);
    lines.push('', 'Open each one on the right.');
    return {
      outcome: made.length === want.length ? 'success' : made.length ? 'partial' : 'no_result',
      summary: lines.join('\n'),
      data: { document: read.document, made },
      completed,
      failed,
    };
  },
};
