import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../lib/AuthContext';
import { baselineAssessmentApi, AdaptiveQuestion, StudentDigitalTwinData } from '../../lib/api/studentDigitalTwin';

export interface UserResponse {
  questionId: string;
  questionNumber: number;
  subject: string;
  topic: string;
  difficulty: string;
  userAnswer: string | number;
  correctAnswer: string | number;
  isCorrect: boolean;
  confidenceRating: 'Very Confident' | 'Confident' | 'Not Sure' | 'Pure Guess';
  timeTakenSeconds: number;
  readingTimeSeconds: number;
  thinkingTimeSeconds: number;
  optionHovers: number;
  answerSwitches: number;
  knowledgeGraphTag: string;
}

export function useAdaptiveAssessment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.uid;

  const [questions, setQuestions] = useState<AdaptiveQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [isAssessmentFinished, setIsAssessmentFinished] = useState(false);

  // Live Telemetry Tracking
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [readingTime, setReadingTime] = useState<number>(0);
  const [thinkingTime, setThinkingTime] = useState<number>(0);
  const [optionHovers, setOptionHovers] = useState<number>(0);
  const [answerSwitches, setAnswerSwitches] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null);

  const questionTimerRef = useRef<number>(Date.now());

  // Digital Twin Query
  const digitalTwinQuery = useQuery<StudentDigitalTwinData | null>({
    queryKey: ['studentDigitalTwin', userId],
    queryFn: () => (userId ? baselineAssessmentApi.getDigitalTwin(userId) : null),
    enabled: !!userId,
  });

  // Auto-start or resume assessment on mount as soon as userId is available
  const sessionQuery = useQuery({
    queryKey: ['baselineAssessmentSession', userId],
    queryFn: async () => {
      if (!userId) return null;
      const data = await baselineAssessmentApi.startOrResume(userId);
      if (data && data.currentBatch && data.currentBatch.length > 0) {
        setQuestions(data.currentBatch);
        setBatchIndex(data.sessionState?.batchIndex || 0);
        if (data.sessionState?.responses) {
          setUserResponses(data.sessionState.responses);
          setCurrentQIndex(data.sessionState.responses.length);
        }
      }
      return data;
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });

  /*
   * The Start/Resume MUTATION that lived here has been removed.
   *
   * It called startOrResume a second time, in parallel with sessionQuery above, and because
   * generation takes 12-24 s the two overlapped for any student who pressed Start promptly —
   * two paid Gemini calls for one student, with the slower one overwriting the other's session.
   *
   * It is deleted rather than left unused: an unused mutation that still calls the API is one
   * edit away from being wired back in, and this exact duplication is what it caused.
   */

  // Fetch Next Batch Mutation
  const nextBatchMutation = useMutation({
    mutationFn: async (updatedResponses: UserResponse[]) => {
      if (!userId) throw new Error('Not authenticated');
      return baselineAssessmentApi.getNextBatch(userId, batchIndex, updatedResponses);
    },
    onSuccess: (data) => {
      if (data.questions && data.questions.length > 0) {
        setQuestions((prev) => [...prev, ...data.questions]);
        setBatchIndex((prev) => prev + 1);
      }
      if (data.isComplete) {
        setIsAssessmentFinished(true);
      }
    },
  });

  // Submit Final Assessment Mutation
  const submitMutation = useMutation({
    mutationFn: async (finalResponses: UserResponse[]) => {
      if (!userId) throw new Error('Not authenticated');
      return baselineAssessmentApi.submitAssessment(userId, {
        responses: finalResponses,
        behavioralSignals: {
          totalSwitches: finalResponses.reduce((a, b) => a + b.answerSwitches, 0),
          totalHovers: finalResponses.reduce((a, b) => a + b.optionHovers, 0),
        },
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['studentDigitalTwin', userId], data.digitalTwin);
    },
  });

  const currentQuestion = questions[currentQIndex];

  // Answer selection handler
  const handleSelectOption = (opt: string | number) => {
    if (selectedAnswer !== null && selectedAnswer !== opt) {
      setAnswerSwitches((prev) => prev + 1);
    }
    setSelectedAnswer(opt);
  };

  /**
   * "Clear Response" — deselect without recording an answer switch.
   *
   * Switch count feeds the behavioural signals used for confidence calibration, and clearing an
   * answer is not the same act as changing your mind between two options. Routing this through
   * handleSelectOption would inflate that signal every time a student tidied up before moving on.
   */
  const clearResponse = () => setSelectedAnswer(null);

  // Submit question with confidence rating
  const handleAnswerQuestion = async (confidence: 'Very Confident' | 'Confident' | 'Not Sure' | 'Pure Guess') => {
    if (!currentQuestion || selectedAnswer === null) return;

    const timeTaken = Math.max(Math.round((Date.now() - questionTimerRef.current) / 1000), 2);
    const isCorrect = String(selectedAnswer).trim().toLowerCase() === String(currentQuestion.correctAnswer).trim().toLowerCase();

    const responseObj: UserResponse = {
      questionId: currentQuestion.id,
      questionNumber: currentQIndex + 1,
      subject: currentQuestion.subject,
      topic: currentQuestion.topic,
      difficulty: currentQuestion.difficulty,
      userAnswer: selectedAnswer,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect,
      confidenceRating: confidence,
      timeTakenSeconds: timeTaken,
      readingTimeSeconds: Math.round(timeTaken * 0.4),
      thinkingTimeSeconds: Math.round(timeTaken * 0.6),
      optionHovers,
      answerSwitches,
      knowledgeGraphTag: currentQuestion.knowledgeGraphTag,
    };

    const updatedResponses = [...userResponses, responseObj];
    setUserResponses(updatedResponses);

    // Reset telemetry timers
    setSelectedAnswer(null);
    setOptionHovers(0);
    setAnswerSwitches(0);
    questionTimerRef.current = Date.now();

    // Next question or fetch next batch
    if (currentQIndex + 1 < questions.length) {
      setCurrentQIndex((prev) => prev + 1);
    } else if (updatedResponses.length >= 20) {
      // Finished all questions!
      setIsAssessmentFinished(true);
      await submitMutation.mutateAsync(updatedResponses);
    } else {
      // Load next dynamic CAT batch
      setCurrentQIndex((prev) => prev + 1);
      await nextBatchMutation.mutateAsync(updatedResponses);
    }
  };

  return {
    digitalTwin: digitalTwinQuery.data,
    isLoadingDigitalTwin: digitalTwinQuery.isLoading,
    questions,
    currentQuestion,
    currentQIndex,
    totalQuestions: questions.length || 20,
    selectedAnswer,
    userResponses,
    isAssessmentFinished,
    isStarting: sessionQuery.isFetching,
    isSubmitting: submitMutation.isPending,
    isFetchingBatch: nextBatchMutation.isPending,
    /*
     * Surfaced deliberately. These calls used to swallow their own failures and hand back a
     * hardcoded question batch, so the UI had nothing to show and no reason to show it. Now a
     * failure reaches the screen, which is the only way a student can tell the difference between
     * "still loading" and "this is broken, retry".
     */
    loadError:
      (sessionQuery.error as Error | null)?.message ??
            (nextBatchMutation.error as Error | null)?.message ??
      null,
    retry: async () => {
      const r = await sessionQuery.refetch();
      return r.data ?? null;
    },
    /*
     * ── WHY THIS NO LONGER CALLS THE API DIRECTLY ─────────────────────────────────────────
     *
     * `sessionQuery` above already fires startOrResume on mount (`enabled: !!userId`), and this
     * used to fire it AGAIN when the student pressed Start. Because the pre-assessment screen
     * appears immediately, a student who clicks promptly triggered both while the first was still
     * in flight — and generation takes 12–24 s, so that overlap was the normal case, not an edge.
     *
     * The backend only short-circuits when a session DOCUMENT already exists. Two concurrent
     * requests both found none, so both ran a full Gemini generation: two paid model calls for one
     * student, and whichever finished last overwrote the other's session in Firestore.
     *
     * The query owns the request now. Pressing Start dismisses the modal and waits on the fetch
     * that is already running; it only issues one itself if the query is idle with nothing cached.
     */
    startAssessment: async () => {
      if (sessionQuery.data) return sessionQuery.data;
      if (sessionQuery.isFetching) return null;   // already in flight — the query will populate state
      const r = await sessionQuery.refetch();
      return r.data ?? null;
    },
    handleSelectOption,
    clearResponse,
    handleAnswerQuestion,
    trackHover: () => setOptionHovers((prev) => prev + 1),
    submitAssessment: () => submitMutation.mutateAsync(userResponses),
  };
}
