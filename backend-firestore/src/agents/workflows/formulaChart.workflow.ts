import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { WorkflowTemplate } from './WorkflowTemplate';
import { clarifyChapter } from './chapterBriefing.workflow';

/**
 * Formula chart — the flagship (Phase 5), and the brief's acceptance test:
 * "Prepare a formula chart for Class 11 Physics Laws of Motion."
 *
 *   1. resolve_curriculum_chapter        which chapter; its headings and extracted definitions
 *   2. get_chapter_knowledge_graph        the chapter's FORMULA nodes             ┐ parallel
 *   3. get_chapter_assets                 study notes: formulae, mistakes, tips   ┘
 *   4. extract_chapter_formulae           candidates, de-duplicated, worked examples out
 *   5. verify_formulae_against_chapter    each checked against the chapter's own PDF text
 *   6. compose_formula_chart              the §13 structure, verified material only
 *   7. create_document_artifact           render, store, announce (agent.artifact.ready)
 *
 * No model call at any step. What the student gets is exactly what the chapter says, cited to the
 * page, and the summary says how many candidates were left out and why.
 */

export const formulaChartWorkflow: WorkflowTemplate = {
  id: 'formula_chart',
  title: 'Formula chart',
  description:
    "Builds a verified formula chart for an NCERT chapter: every formula is checked against the chapter's own text and cited to its page.",
  budget: { maxSteps: 8, maxToolCalls: 10, maxExecutionMs: 150_000 },

  buildPlan(goal: string): AgentPlan {
    const chapterRef = (path: string) => ({ $ref: 'resolve_chapter', path });
    const composed = (path: string) => ({ $ref: 'compose', path });
    return {
      goal,
      workflowId: 'formula_chart',
      estimatedComplexity: 'medium',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'chapter_resolved', description: 'The chapter is identified in the NCERT corpus with confidence' },
        { id: 'formulae_verified', description: 'Every formula in the chart is found in the chapter text and cited to its page' },
        { id: 'chart_rendered', description: 'The chart is rendered to a PDF the student owns' },
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
          objective: 'Read the formulae extracted into the chapter’s knowledge graph',
          label: 'Reading the chapter’s formula graph',
          type: 'retrieve',
          tool: 'get_chapter_knowledge_graph',
          input: { notebookId: chapterRef('notebookId'), sourceId: chapterRef('sourceId'), types: ['FORMULA'], limit: 60 },
          dependsOn: ['resolve_chapter'],
        },
        {
          id: 'notes',
          objective: 'Read Sadhya’s study notes for the chapter',
          label: 'Reading the study notes',
          type: 'retrieve',
          tool: 'get_chapter_assets',
          input: {
            notebookId: chapterRef('notebookId'),
            chapterTitle: chapterRef('chapterTitle'),
            types: ['KEY_FORMULAE', 'COMMON_MISTAKES', 'EXAM_TIPS', 'HIGH_YIELD_FACTS'],
            includeContent: true,
          },
          dependsOn: ['resolve_chapter'],
        },
        {
          id: 'extract',
          objective: 'Collect candidate formulae from both sources',
          label: 'Extracting formulae',
          type: 'analyze',
          tool: 'extract_chapter_formulae',
          input: { graph: { $ref: 'graph' }, notes: { $ref: 'notes' } },
          dependsOn: ['graph', 'notes'],
        },
        {
          id: 'verify',
          objective: 'Check every formula and definition against the chapter’s own text',
          label: 'Verifying against the chapter text',
          type: 'verify',
          tool: 'verify_formulae_against_chapter',
          input: {
            notebookId: chapterRef('notebookId'),
            sourceId: chapterRef('sourceId'),
            headings: chapterRef('headings'),
            definitions: chapterRef('definitions'),
            candidates: { $ref: 'extract', path: 'candidates' },
          },
          dependsOn: ['resolve_chapter', 'extract'],
        },
        {
          id: 'compose',
          objective: 'Structure the chart from verified material only',
          label: 'Structuring the chart',
          type: 'transform',
          tool: 'compose_formula_chart',
          input: { chapter: { $ref: 'resolve_chapter' }, verification: { $ref: 'verify' }, notes: { $ref: 'notes' } },
          dependsOn: ['resolve_chapter', 'verify', 'notes'],
        },
        {
          id: 'render',
          objective: 'Render the chart to a PDF the student owns',
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

    const extracted = outputs.get('extract') as any;
    const verification = outputs.get('verify') as any;
    const composed = outputs.get('compose') as any;
    const artifact = outputs.get('render') as any;
    const chapter = { notebookId: resolved.notebookId, sourceId: resolved.sourceId, chapterName: resolved.chapterName };

    const candidates = extracted?.candidates?.length ?? 0;
    const verifiedCount = verification?.verified?.length ?? 0;
    const rejected: any[] = verification?.rejected ?? [];
    // Worked-example arithmetic, plus statements from worked examples ("y-component of impulse = 0").
    const workedExamples =
      (extracted?.dropped?.worked_example ?? 0) + rejected.filter((r) => r.status === 'worked_example' || r.status === 'not_a_formula').length;
    const notFound = rejected.filter((r) => r.status === 'not_found').length;

    if (!artifact?.artifactId) {
      return {
        outcome: 'partial',
        summary: [
          `I found **${resolved.chapterName}** in ${resolved.bookTitle}, but couldn't finish the formula chart.`,
          failed.length ? `\nWhat went wrong: ${failed.join('; ')}.` : '',
        ].join(''),
        data: { chapter, verified: verifiedCount },
        completed,
        failed,
      };
    }

    const leftOut: string[] = [];
    if (notFound) leftOut.push(`${notFound} couldn't be found in the chapter text (PDF text often scrambles fractions and subscripts)`);
    if (workedExamples) leftOut.push(`${workedExamples} were lines from worked examples, not formulae`);

    return {
      outcome: 'success',
      summary: [
        `## ${composed?.title ?? `${resolved.chapterName} — Formula Chart`}`,
        '',
        `I checked ${candidates + (extracted?.dropped?.worked_example ?? 0)} candidate formulae against the text of the chapter itself. ` +
          `**${verifiedCount} were found there**, and each one in the chart is cited to the page it appears on.`,
        leftOut.length ? `\nLeft out: ${leftOut.join('; ')}.` : '',
        '',
        `The ${artifact.pageCount}-page PDF also has the chapter's laws and definitions in its own words, the symbols with their SI units, and limiting cases. Common mistakes and quick tips come from Sadhya's study notes and are labelled as such.`,
      ].join('\n'),
      data: { chapter, artifactId: artifact.artifactId, pageCount: artifact.pageCount, verified: verifiedCount, rejected: rejected.length },
      completed,
      failed,
    };
  },
};
