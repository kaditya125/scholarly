import { useNavigate } from 'react-router-dom';
import { QuizMode } from '../../lib/api/quiz';

interface LaunchOpts {
  mode?: QuizMode;
  topic?: string;
  notebookId?: string;
  notebookTitle?: string;
  count?: number;
  /** When set, resume this exact persisted (in-progress) attempt instead of generating a new one. */
  resumeAttemptId?: string;
  /** A real canonical syllabus node (from a weak-area recommendation, never guessed client-side)
   *  to pin WHERE the questions come from. */
  syllabusNodeId?: string;
  /** Canonical examId, when known. */
  examId?: string;
  /** True for a genuine weak-area recommendation launch — keeps the real-PYQ/reference-weighted
   *  source mix on the backend even when syllabusNodeId also narrows WHERE. */
  isWeakAreaDrill?: boolean;
}

/**
 * Central launcher for the /test engine.
 *   - "Generate / Practice" starts a FRESH test (TestEngine generates and persists a new attempt)
 *   - "Resume" passes `resumeAttemptId`, and TestEngine reloads that exact persisted attempt
 *     instead of generating — previously the id was written to sessionStorage that nothing read,
 *     so every Resume silently created another untitled "Weak Areas Practice" attempt.
 */
export function useLaunchTest() {
  const navigate = useNavigate();

  return (opts: LaunchOpts = {}) => {
    const mode: QuizMode = opts.mode || 'exam';

    navigate('/test', {
      state: {
        mode,
        resumeAttemptId: opts.resumeAttemptId,
        topic: opts.topic,
        notebookId: opts.notebookId,
        notebookTitle: opts.notebookTitle,
        count: opts.count,
        syllabusNodeId: opts.syllabusNodeId,
        examId: opts.examId,
        isWeakAreaDrill: opts.isWeakAreaDrill,
      },
    });
  };
}
