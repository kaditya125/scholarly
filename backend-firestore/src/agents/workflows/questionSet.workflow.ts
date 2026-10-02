import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { refusalSummary } from '../tools/adapters/pastPapers';
import { questionCountFromGoal } from '../tools/adapters/quiz.adapter';
import { clarifyChapter } from './chapterBriefing.workflow';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * Golden case 2: "Create 30 NEET Biology questions from Cell Structure."
 *
 *   1. resolve_exam_topic            syllabus retrieval: the exam, and where the topic sits in its syllabus
 *   2. resolve_curriculum_chapter    topic retrieval: the NCERT chapter that teaches it
 *   3. read_chapter_sections         the chapter's own text, section by section
 *   4. plan_question_blueprint       questions per section + difficulty mix           ┐ parallel
 *   5. find_verified_past_questions  real past-year questions, provenance-gated        ┘
 *   6. generate_grounded_questions   question generation from each section, with evidence
 *   7. validate_questions            question + answer validation against the chapter text
 *   8. detect_duplicate_questions    duplicate detection (within the set, and seen before)
 *   9. create_quiz_artifact          the quiz artifact
 *
 * Two model calls: writing (6) and an independent solver inside validation (7) that never sees the
 * key. Everything else the student is told about a question — that its evidence is in the chapter,
 * that it states the answer, whether it is a past-year question — is checked by code.
 */

const reasonText: Record<string, string> = {
  evidence_not_in_source: 'their quoted evidence is not in the chapter',
  answer_not_supported: 'the quote does not support the marked answer',
  solver_disagrees: 'an independent check reached a different answer from the quote',
  not_settled_by_evidence: 'the quote alone did not settle the answer',
  ambiguous_key: 'another option was equally supported',
  negative_stem: 'NOT/EXCEPT questions cannot be checked this way',
  duplicate_options: 'repeated options',
  overlapping_options: 'two options said the same thing',
  lazy_option: '“all/none of the above” options',
  malformed: 'malformed',
  near_duplicate: 'near-duplicates of another question',
  seen_recently: 'you saw them in a recent quiz',
};

export const questionSetWorkflow: WorkflowTemplate = {
  id: 'question_set',
  title: 'Question set',
  description: 'Writes a set of exam questions on a curriculum topic from the NCERT chapter itself, checking every answer against the chapter’s text.',
  budget: { maxSteps: 10, maxToolCalls: 12, maxExecutionMs: 240_000 },

  buildPlan(goal: string): AgentPlan {
    const topic = (path: string) => ({ $ref: 'exam_topic', path });
    const chapter = (path: string) => ({ $ref: 'chapter', path });
    const blueprint = (path: string) => ({ $ref: 'blueprint', path });
    const validated = (path: string) => ({ $ref: 'validate', path });
    const deduped = (path: string) => ({ $ref: 'dedupe', path });
    const count = questionCountFromGoal(goal, 20);
    const chapterRef = { notebookId: chapter('notebookId'), sourceId: chapter('sourceId'), headings: chapter('headings') };
    return {
      goal,
      workflowId: 'question_set',
      estimatedComplexity: 'medium',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'syllabus', description: 'The exam and the topic’s place in its syllabus are identified' },
        { id: 'grounded', description: 'Every question is written from the chapter’s own text' },
        { id: 'validated', description: 'Every answer is backed by a sentence found in the chapter, and an independent solver that never sees the key reaches it too' },
        { id: 'deduplicated', description: 'No near-duplicates, and nothing the student saw recently' },
        { id: 'provenance', description: 'Only questions with a verified source are called past-year questions' },
      ],
      steps: [
        { id: 'exam_topic', objective: 'Identify the exam and where the topic sits in its syllabus', label: 'Finding the topic in the syllabus', type: 'retrieve', tool: 'resolve_exam_topic', input: { query: goal.slice(0, 400) }, dependsOn: [] },
        { id: 'chapter', objective: 'Find the NCERT chapter that teaches the topic', label: 'Finding the chapter that teaches it', type: 'retrieve', tool: 'resolve_curriculum_chapter', input: { query: topic('chapterQuery') }, dependsOn: ['exam_topic'] },
        { id: 'sections', objective: 'Read the chapter’s own text', label: 'Reading the chapter', type: 'retrieve', tool: 'read_chapter_sections', input: chapterRef, dependsOn: ['chapter'] },
        { id: 'blueprint', objective: 'Plan questions per section and the difficulty mix', label: 'Planning the question mix', type: 'analyze', tool: 'plan_question_blueprint', input: { sections: { $ref: 'sections', path: 'sections' }, count }, dependsOn: ['sections'] },
        {
          id: 'past',
          objective: 'Look for real past-year questions on the chapter',
          label: 'Checking for real past-year questions',
          type: 'retrieve',
          tool: 'find_verified_past_questions',
          input: { examTopic: { $ref: 'exam_topic' }, chapterName: chapter('chapterName') },
          dependsOn: ['exam_topic', 'chapter'],
        },
        {
          id: 'generate',
          objective: 'Write questions from each section’s text, with evidence',
          label: 'Writing questions from the chapter',
          type: 'transform',
          tool: 'generate_grounded_questions',
          input: { ...chapterRef, allocations: blueprint('allocations'), difficulty: blueprint('difficulty'), sourceTitle: chapter('chapterName'), examTopic: { $ref: 'exam_topic' } },
          dependsOn: ['exam_topic', 'chapter', 'blueprint'],
        },
        {
          id: 'validate',
          objective: 'Check every question and answer against the chapter text',
          label: 'Checking every answer against the chapter',
          type: 'verify',
          tool: 'validate_questions',
          input: { ...chapterRef, drafts: { $ref: 'generate', path: 'drafts' }, chapterName: chapter('chapterName'), examTopic: { $ref: 'exam_topic' } },
          dependsOn: ['exam_topic', 'chapter', 'generate'],
        },
        {
          id: 'dedupe',
          objective: 'Remove duplicates and questions seen recently',
          label: 'Removing duplicates',
          type: 'verify',
          tool: 'detect_duplicate_questions',
          input: {
            questions: validated('accepted'),
            pastQuestions: { $ref: 'past', path: 'usable' },
            count,
            chapterName: chapter('chapterName'),
            bookTitle: chapter('bookTitle'),
            examTopic: { $ref: 'exam_topic' },
            checked: validated('checked'),
            rejected: validated('rejected'),
          },
          dependsOn: ['validate', 'past', 'chapter', 'exam_topic'],
        },
        {
          id: 'save',
          objective: 'Save the question set as a quiz the student can take',
          label: 'Saving the quiz',
          type: 'export',
          tool: 'create_quiz_artifact',
          input: {
            title: deduped('title'),
            questions: deduped('questions'),
            topics: deduped('topics'),
            origin: deduped('origin'),
            validation: deduped('validation'),
            sourceNote: deduped('sourceNote'),
            source: 'topic',
            topic: chapter('chapterName'),
          },
          dependsOn: ['dedupe', 'chapter'],
        },
      ],
    };
  },

  evaluate({ plan, steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const topic = outputs.get('exam_topic') as any;
    const chapter = outputs.get('chapter') as any;
    if (chapter && !chapter.resolved) return clarifyChapter(chapter, completed, failed);
    const quiz = outputs.get('save') as any;
    const deduped = outputs.get('dedupe') as any;
    const validated = outputs.get('validate') as any;
    const past = outputs.get('past') as any;
    const blueprint = outputs.get('blueprint') as any;
    if (!quiz?.artifactId || !deduped) {
      return {
        outcome: validated?.accepted?.length ? 'partial' : 'no_result',
        summary: `I couldn't finish the question set${chapter?.chapterName ? ` on **${chapter.chapterName}**` : ''}${failed.length ? `: ${failed.join('; ')}` : ''}.`,
        data: {},
        completed,
        failed,
      };
    }

    const asked = Number((plan.steps.find((s) => s.id === 'blueprint')?.input as any)?.count ?? quiz.questionCount);
    const rejected = Object.entries(deduped.validation?.rejected ?? {}) as Array<[string, number]>;
    // One entry per paragraph; the optional ones are simply left out.
    const paragraphs = [
      `## ${quiz.title}`,
      topic?.syllabus
        ? `**Syllabus:** ${topic.examShort ?? topic.examName ?? topic.examId} › ${topic.syllabus.path.slice(1).map((p: string) => p.split(/;\s*/)[0]).join(' › ')} (matched by name).`
        : topic?.examId
          ? `**Exam:** ${topic.examName ?? topic.examId} — I couldn't place “${topic.topic}” in its syllabus with confidence.`
          : '',
      `**Taught in:** ${chapter.bookTitle} — ${chapter.chapterName}.`,
      `I wrote ${validated?.checked ?? 0} candidate questions from the chapter's own text, one section at a time, and kept **${quiz.questionCount}**: every answer is backed by a sentence of the chapter, quoted in its explanation.`,
      quiz.questionCount < asked ? `You asked for ${asked}; ${quiz.questionCount} passed every check, so that is how many the quiz has.` : '',
      rejected.length ? `Set aside: ${rejected.map(([r, n]) => `${n} because ${reasonText[r] ?? r}`).join('; ')}.` : '',
      past?.checked
        ? past.usable?.length
          ? `**Past-year questions:** ${past.usable.length} from real papers are included and marked as such, with the answers recorded from the official key.`
          : `**Past-year questions:** the bank holds ${past.checked} on this chapter, but none can be shown as a past-year question — not used: ${refusalSummary(past.excluded)}.`
        : '',
      blueprint?.difficulty ? `**Difficulty:** ${blueprint.difficulty.easy} easy, ${blueprint.difficulty.medium} medium, ${blueprint.difficulty.hard} hard — ${blueprint.difficulty.basis}.` : '',
      'Take it on the right; it is scored when you submit.',
    ];
    return {
      outcome: 'success',
      summary: paragraphs.filter(Boolean).join('\n\n'),
      data: { artifactId: quiz.artifactId, attemptId: quiz.attemptId, questionCount: quiz.questionCount, chapter: { notebookId: chapter.notebookId, sourceId: chapter.sourceId, chapterName: chapter.chapterName } },
      completed,
      failed,
    };
  },
};
