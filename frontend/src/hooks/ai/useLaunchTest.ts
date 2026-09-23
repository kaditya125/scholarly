import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
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
 * Central launcher for the /test engine. Keeps the sessionStorage attempt-id + react-query cache
 * in sync with intent so:
 *   - "Generate / Practice" always starts a FRESH test (clears any remembered attempt for the key)
 *   - "Resume" pins a specific persisted attempt so the engine reloads the same questions
 */
export function useLaunchTest() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return (opts: LaunchOpts = {}) => {
    const mode: QuizMode = opts.mode || 'exam';
    const quizKey = `${opts.notebookId || 'none'}::${opts.topic || 'weak-areas'}::${mode}`;
    const storageKey = `quizAttemptId::${quizKey}`;

    if (opts.resumeAttemptId) {
      sessionStorage.setItem(storageKey, opts.resumeAttemptId);
    } else {
      sessionStorage.removeItem(storageKey);
    }
    // Drop any cached quiz for this key so useQuiz re-runs its generate-or-resume decision.
    queryClient.removeQueries({ queryKey: ['quiz', user?.uid, quizKey] });

    navigate('/test', {
      state: {
        mode,
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
