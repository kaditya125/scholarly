import { ToolRegistry } from './ToolRegistry';
import { registerArtifactTools } from './adapters/artifact.adapter';
import { registerChapterNotesTools } from './adapters/chapterNotes.adapter';
import { registerComposeTools } from './adapters/compose.adapter';
import { registerCurriculumTools } from './adapters/curriculum.adapter';
import { registerFlashcardTools } from './adapters/flashcards.adapter';
import { registerDocumentTools } from './adapters/document.adapter';
import { registerFormulaChartTools } from './adapters/formulaChart.adapter';
import { registerPlanTools } from './adapters/plan.adapter';
import { registerPrepTools } from './adapters/prep.adapter';
import { registerProgressTools } from './adapters/progress.adapter';
import { registerPyqTools } from './adapters/pyq.adapter';
import { registerQuestionSetTools } from './adapters/questionSet.adapter';
import { registerQuizTools } from './adapters/quiz.adapter';
import { registerRetrievalTools } from './adapters/retrievalTools.adapter';

export * from './ToolRegistry';
export * from './ToolExecutor';
export * from './toolErrors';

let defaultRegistry: ToolRegistry | null = null;

/**
 * The production registry. Built once, lazily, so importing the agent runtime never pulls the
 * retrieval services (Firestore / Qdrant / embedding SDKs) into processes that do not run agents.
 */
export function getDefaultToolRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    const phase5 = registerFlashcardTools(
      registerFormulaChartTools(
        registerComposeTools(registerArtifactTools(registerCurriculumTools(registerRetrievalTools(new ToolRegistry())))),
      ),
    );
    // Phase 6: quizzes, performance analysis and revision plans.
    const phase6 = registerChapterNotesTools(registerPyqTools(registerDocumentTools(registerQuestionSetTools(registerPlanTools(registerProgressTools(registerQuizTools(phase5)))))));
    // Phase 7: the personal agent — "Prepare me for X".
    defaultRegistry = registerPrepTools(phase6);
  }
  return defaultRegistry;
}
