import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { WorkflowTemplate } from './WorkflowTemplate';

/**
 * Flashcards from an existing document — the acceptance test's second step:
 * "Create flashcards from this formula chart."
 *
 *   1. find_my_latest_document            the student's own most recent chart (owner-scoped)
 *   2. compose_flashcards_from_document   cards from its stored, verified content
 *   3. create_flashcards_artifact         save the deck
 *
 * Three tool calls and no retrieval at all: the chart is reused, not rebuilt. If the student has
 * no such document, the run says so instead of quietly making one.
 */

export const flashcardsFromArtifactWorkflow: WorkflowTemplate = {
  id: 'flashcards_from_artifact',
  title: 'Flashcards from your document',
  description: 'Turns a document you already made — such as a formula chart — into flashcards, reusing its verified content.',
  budget: { maxSteps: 4, maxToolCalls: 5, maxExecutionMs: 60_000 },

  buildPlan(goal: string): AgentPlan {
    // "…from this formula chart" narrows the search to charts; "…from this PDF" takes the latest.
    const titleContains = /formula/i.test(goal) ? 'Formula Chart' : undefined;
    const found = (path: string) => ({ $ref: 'find_document', path });
    const composed = (path: string) => ({ $ref: 'compose', path });
    return {
      goal,
      workflowId: 'flashcards_from_artifact',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'source_found', description: 'The student’s own document is found' },
        { id: 'reused', description: 'Cards are made from its stored content, with no retrieval' },
      ],
      steps: [
        {
          id: 'find_document',
          objective: 'Find the document the student means',
          label: titleContains ? 'Finding your formula chart' : 'Finding your latest document',
          type: 'retrieve',
          tool: 'find_my_latest_document',
          input: titleContains ? { titleContains } : {},
          dependsOn: [],
        },
        {
          id: 'compose',
          objective: 'Turn its verified content into flashcards',
          label: 'Making the flashcards',
          type: 'transform',
          tool: 'compose_flashcards_from_document',
          input: { artifactId: found('artifactId'), title: found('title'), spec: found('spec') },
          dependsOn: ['find_document'],
        },
        {
          id: 'save',
          objective: 'Save the deck for the student',
          label: 'Saving the deck',
          type: 'export',
          tool: 'create_flashcards_artifact',
          input: { title: composed('title'), sourceArtifactId: composed('sourceArtifactId'), cards: composed('cards') },
          dependsOn: ['compose'],
        },
      ],
    };
  },

  evaluate({ steps, outputs, plan }): AgentRunResult {
    const completed: string[] = [];
    const failed: string[] = [];
    for (const s of steps.values()) {
      if (s.status === 'completed') completed.push(s.label);
      else if (s.status === 'failed') failed.push(`${s.label} — ${s.error?.message ?? 'failed'}`);
    }

    const source = outputs.get('find_document') as any;
    if (!source?.found) {
      const wanted = plan.steps[0].input && (plan.steps[0].input as any).titleContains ? 'formula chart' : 'document';
      return {
        outcome: 'no_result',
        summary: `I couldn't find a ${wanted} of yours to make flashcards from. Ask me to make one first — for example, "Prepare a formula chart for Class 11 Physics Laws of Motion".`,
        data: { reused: false },
        completed,
        failed,
      };
    }

    const deck = outputs.get('save') as any;
    const composed = outputs.get('compose') as any;
    if (!deck?.artifactId) {
      return {
        outcome: 'partial',
        summary: `I found **${source.title}**, but couldn't save the flashcards${failed.length ? `: ${failed.join('; ')}` : ''}.`,
        data: { sourceArtifactId: source.artifactId },
        completed,
        failed,
      };
    }

    const kinds = (composed?.cards ?? []).reduce((acc: Record<string, number>, c: any) => ({ ...acc, [c.kind ?? 'other']: (acc[c.kind ?? 'other'] ?? 0) + 1 }), {});
    const parts = [
      kinds.formula ? `${kinds.formula} formula card${kinds.formula === 1 ? '' : 's'}` : null,
      kinds.definition ? `${kinds.definition} on laws and definitions` : null,
      kinds.symbol ? `${kinds.symbol} on symbols and units` : null,
    ].filter(Boolean);
    return {
      outcome: 'success',
      summary: [
        `## ${deck.title}`,
        '',
        `I made ${deck.cardCount} flashcards from your **${source.title}**${parts.length ? ` — ${parts.join(', ')}` : ''}.`,
        '',
        'They reuse the chart as it is: the same verified formulae, each with the page it came from. Nothing was looked up again.',
      ].join('\n'),
      data: { artifactId: deck.artifactId, sourceArtifactId: source.artifactId, cardCount: deck.cardCount, reused: true },
      completed,
      failed,
    };
  },
};
