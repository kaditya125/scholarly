import { WorkflowRegistry } from './WorkflowTemplate';
import { chapterBriefingWorkflow } from './chapterBriefing.workflow';
import { chapterHandoutWorkflow } from './chapterHandout.workflow';
import { chapterNotesWorkflow } from './chapterNotes.workflow';
import { mockTestWorkflow } from './mockTest.workflow';
import { documentStudyPackWorkflow } from './documentStudyPack.workflow';
import { examOverviewWorkflow } from './examOverview.workflow';
import { examPrepWorkflow } from './examPrep.workflow';
import { flashcardsFromArtifactWorkflow } from './flashcardsFromArtifact.workflow';
import { formulaChartWorkflow } from './formulaChart.workflow';
import { quizFromArtifactWorkflow } from './quizFromArtifact.workflow';
import { quizMistakesWorkflow } from './quizMistakes.workflow';
import { questionSetWorkflow } from './questionSet.workflow';
import { pyqPracticeWorkflow } from './pyqPractice.workflow';
import { revisionPlanWorkflow } from './revisionPlan.workflow';
import { testsAnalysisWorkflow } from './testsAnalysis.workflow';
import { weakAreaQuizWorkflow } from './weakAreaQuiz.workflow';
import { featureFlags } from '../../config/featureFlags';

export * from './WorkflowTemplate';

/** Every workflow Agent mode can run. Phase 5 adds the formula chart; Phase 6 the learning agents. */
export function createDefaultWorkflowRegistry(): WorkflowRegistry {
  const withArtifacts = () => featureFlags.agentArtifacts;
  return (
    new WorkflowRegistry()
      .register(examOverviewWorkflow)
      .register(chapterBriefingWorkflow)
      // These produce stored artifacts, so they exist only while artifacts are switched on.
      .register({ ...chapterHandoutWorkflow, isEnabled: withArtifacts })
      .register({ ...formulaChartWorkflow, isEnabled: withArtifacts })
      .register({ ...flashcardsFromArtifactWorkflow, isEnabled: withArtifacts })
      .register({ ...quizFromArtifactWorkflow, isEnabled: withArtifacts })
      .register({ ...quizMistakesWorkflow, isEnabled: withArtifacts })
      .register({ ...revisionPlanWorkflow, isEnabled: withArtifacts })
      .register({ ...testsAnalysisWorkflow, isEnabled: withArtifacts })
      .register({ ...weakAreaQuizWorkflow, isEnabled: withArtifacts })
      .register({ ...questionSetWorkflow, isEnabled: withArtifacts })
      .register({ ...documentStudyPackWorkflow, isEnabled: withArtifacts })
      .register({ ...pyqPracticeWorkflow, isEnabled: withArtifacts })
      .register({ ...chapterNotesWorkflow, isEnabled: withArtifacts })
      .register({ ...mockTestWorkflow, isEnabled: withArtifacts })
      // Phase 7: the personal agent.
      .register({ ...examPrepWorkflow, isEnabled: withArtifacts })
  );
}
