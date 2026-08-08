import { useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, Check, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface TestInstructionsProps {
  /** Title shown on the test-specific page (book / chapter name). */
  testTitle: string;
  /** Optional sub-title (topic / subject). */
  topic?: string;
  /** Total time allowed, in minutes. */
  durationMinutes: number;
  /** Number of questions in the generated test (0 while still generating). */
  totalQuestions: number;
  /** True while the quiz is still being generated in the background. */
  isGenerating: boolean;
  /** Marks awarded per correct answer. */
  correctMark: number;
  /** Marks deducted per wrong answer (positive number). */
  negativeMark: number;
  /** Signed-in candidate name. */
  candidateName: string;
  /** Signed-in candidate photo, if any. */
  candidatePhotoURL?: string | null;
  isDarkMode: boolean;
  /** Leave the test flow (back to the tests list). */
  onExit: () => void;
  /** Accept instructions and start the test. */
  onBegin: () => void;
}

/**
 * NTA / CBT-style pre-test instructions shown before the TestEngine.
 * Step 1: General instructions + question-palette legend.
 * Step 2: This test's specifics (duration, marks, marking scheme) + language + declaration.
 * The quiz generates in the background while the student reads; the timer only starts
 * once "I am ready to begin" is clicked (handled by the parent via onBegin).
 */
export default function TestInstructions({
  testTitle,
  topic,
  durationMinutes,
  totalQuestions,
  isGenerating,
  correctMark,
  negativeMark,
  candidateName,
  candidatePhotoURL,
  isDarkMode,
  onExit,
  onBegin,
}: TestInstructionsProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [agreed, setAgreed] = useState(false);
  const [language, setLanguage] = useState("English");

  const ready = totalQuestions > 0 && !isGenerating;
  const maxMarks = totalQuestions > 0 ? totalQuestions * correctMark : 0;
  const qCountLabel = ready ? String(totalQuestions) : "…";
  const maxMarksLabel = ready ? String(maxMarks) : "…";

  const surface = isDarkMode ? "bg-slate-900" : "bg-white";
  const bodyText = isDarkMode ? "text-slate-300" : "text-slate-700";
  const headingText = isDarkMode ? "text-slate-100" : "text-slate-900";
  const warnText = isDarkMode ? "text-red-400" : "text-red-600";
  const border = isDarkMode ? "border-slate-800" : "border-slate-200";
  const barBg = isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-slate-50 border-slate-200";

  const initial =
    candidateName?.trim()?.charAt(0)?.toUpperCase() || "U";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "fixed inset-0 z-50 flex font-sans",
        isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#fafbfc] text-slate-900"
      )}
    >
      {/* Main column: scrollable instructions + sticky action bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className={cn("flex-1 overflow-y-auto", surface)}>
          <div className="max-w-4xl mx-auto px-5 md:px-8 py-6 md:py-8">
            {step === 1 ? (
              <div className={cn("text-[13.5px] leading-relaxed", bodyText)}>
                <h1 className={cn("text-base font-bold mb-4", headingText)}>General Instructions:</h1>

                <ol className="list-decimal pl-6 space-y-3">
                  <li>
                    The clock will be set at the server. The countdown timer at the top of the screen
                    will display the remaining time available for you to complete the test. When the
                    timer reaches zero, the test will end by itself. You need not terminate the test or
                    submit your paper.
                  </li>
                  <li>
                    The Question Palette displayed on the right side of the screen will show the status
                    of each question using one of the following symbols:
                    <ul className="mt-3 space-y-2.5 list-none pl-0">
                      <li className="flex items-start gap-3">
                        <span className={cn("mt-0.5 w-6 h-6 shrink-0 rounded-sm border-2", isDarkMode ? "border-slate-500 bg-slate-800" : "border-slate-400 bg-white")} />
                        <span>You have not visited the question yet.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-0.5 w-6 h-6 shrink-0 rounded-sm bg-red-500" />
                        <span>You have not answered the question.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-0.5 w-6 h-6 shrink-0 rounded-sm bg-green-600" />
                        <span>You have answered the question.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-purple-600" />
                        <span>You have NOT answered the question, but have marked the question for review.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-purple-600 relative">
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
                          </span>
                        </span>
                        <span>You have answered the question, but marked it for review.</span>
                      </li>
                    </ul>
                    <p className="mt-3">
                      The <span className="font-semibold">Mark for Review</span> status for a question
                      simply indicates that you would like to look at that question again. If a question
                      is answered but marked for review, then the answer will be considered for
                      evaluation unless the status is modified by the candidate.
                    </p>
                  </li>
                </ol>

                <h2 className={cn("text-sm font-bold mt-6 mb-2", headingText)}>Navigating to a Question:</h2>
                <ol className="list-decimal pl-6 space-y-3" start={3}>
                  <li>
                    To answer a question, do the following:
                    <ol className="list-decimal pl-6 mt-2 space-y-2">
                      <li>
                        Click on the question number in the Question Palette at the right of your screen
                        to go to that numbered question directly. Note that using this option does{" "}
                        <span className="font-semibold">NOT</span> save your answer to the current
                        question.
                      </li>
                      <li>
                        Click on <span className="font-semibold">Save &amp; Next</span> to save your
                        answer for the current question and then go to the next question.
                      </li>
                      <li>
                        Click on <span className="font-semibold">Mark for Review</span> to save your
                        answer for the current question and also mark it for review, and then go to the
                        next question.
                      </li>
                    </ol>
                    <p className={cn("mt-2", warnText)}>
                      Note that your answer for the current question will not be saved if you navigate to
                      another question directly by clicking on a question number without saving the
                      answer to the previous question.
                    </p>
                  </li>
                </ol>

                <h2 className={cn("text-sm font-bold mt-6 mb-2", headingText)}>Answering a Question:</h2>
                <ol className="list-decimal pl-6 space-y-3" start={4}>
                  <li>
                    Procedure for answering a multiple choice (MCQ) type question:
                    <ol className="list-decimal pl-6 mt-2 space-y-2">
                      <li>
                        Choose one answer from the 4 options (A, B, C, D) given below the question by
                        clicking on the bubble placed before the chosen option.
                      </li>
                      <li>
                        To deselect your chosen answer, click on the bubble of the chosen option again or
                        click on the <span className="font-semibold">Clear Response</span> button.
                      </li>
                      <li>To change your chosen answer, click on the bubble of another option.</li>
                      <li>
                        To save your answer, you <span className="font-semibold">MUST</span> click on the{" "}
                        <span className="font-semibold">Save &amp; Next</span> button.
                      </li>
                    </ol>
                  </li>
                  <li>
                    To mark a question for review, click on the{" "}
                    <span className="font-semibold">Mark for Review</span> button. If an answer is
                    selected for a question that is marked for review, that answer will be considered in
                    the evaluation unless the status is modified by the candidate.
                  </li>
                  <li>
                    To change your answer to a question that has already been answered, first select that
                    question and then follow the procedure for answering that question.
                  </li>
                  <li>
                    Note that <span className="font-semibold">ONLY</span> questions for which answers are
                    saved or marked for review after answering will be considered for evaluation.
                  </li>
                </ol>
              </div>
            ) : (
              <div className={cn("text-[13.5px] leading-relaxed", bodyText)}>
                <h1 className={cn("text-lg md:text-xl font-bold text-center mb-5", headingText)}>
                  {testTitle}
                </h1>
                <div className="flex items-center justify-between text-sm font-bold mb-4">
                  <span className={headingText}>
                    Duration: {durationMinutes} Mins
                  </span>
                  <span className={headingText}>
                    Maximum Marks: {maxMarksLabel}
                  </span>
                </div>

                <h2 className={cn("text-sm font-bold mb-2", headingText)}>
                  Read the following instructions carefully.
                </h2>
                <ol className="list-decimal pl-6 space-y-2.5">
                  <li>
                    The test contains{" "}
                    <span className="font-semibold inline-flex items-center gap-1">
                      {qCountLabel}
                      {!ready && <Loader2 className="w-3 h-3 animate-spin" />}
                    </span>{" "}
                    {ready && totalQuestions === 1 ? "question" : "questions"}
                    {topic ? <> drawn from <span className="font-semibold">{topic}</span></> : null}.
                  </li>
                  <li>Each question has 4 options out of which only one is correct.</li>
                  <li>You have to finish the test in {durationMinutes} minutes.</li>
                  <li>Try not to guess the answer as there is negative marking.</li>
                  <li>
                    You will be awarded <span className="font-semibold">{correctMark}</span> mark for
                    each correct answer and <span className="font-semibold">{negativeMark}</span> will be
                    deducted for each wrong answer.
                  </li>
                  <li>There is no negative marking for the questions that you have not attempted.</li>
                  <li>
                    You can write this test only once. Make sure that you complete the test before you
                    submit the test and/or close the browser.
                  </li>
                </ol>

                <div className={cn("mt-6 pt-5 border-t", border)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="test-language" className={cn("text-sm font-bold", headingText)}>
                      Choose your default language:
                    </label>
                    <select
                      id="test-language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={cn(
                        "text-sm rounded border px-2 py-1 outline-none focus:border-blue-500 transition-colors cursor-pointer",
                        isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                      )}
                    >
                      <option value="English">English</option>
                    </select>
                  </div>
                  <p className={cn("mt-2 text-xs", warnText)}>
                    Please note all questions will appear in your default language.
                  </p>

                  <h2 className={cn("text-sm font-bold mt-5", headingText)}>Declaration:</h2>
                  <label className="mt-2 flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-teal-600 cursor-pointer"
                    />
                    <span className={cn("text-[13px] font-medium", headingText)}>
                      I have understood and agree to all the instructions.
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky action bar */}
        <div className={cn("shrink-0 border-t px-5 md:px-8 py-3 flex items-center justify-between", barBg)}>
          {step === 1 ? (
            <>
              <button
                onClick={onExit}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" /> Go to Tests
              </button>
              <button
                onClick={() => setStep(2)}
                className="px-6 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm cursor-pointer transition-colors"
              >
                Next
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className={cn(
                  "px-6 py-1.5 rounded text-sm font-bold shadow-sm cursor-pointer transition-colors border",
                  isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700" : "bg-sky-100 border-sky-200 text-sky-800 hover:bg-sky-200"
                )}
              >
                Previous
              </button>
              <button
                onClick={onBegin}
                disabled={!agreed || isGenerating}
                className={cn(
                  "px-6 py-1.5 rounded text-sm font-bold shadow-sm transition-colors inline-flex items-center gap-2",
                  !agreed || isGenerating
                    ? "bg-teal-600/40 text-white cursor-not-allowed"
                    : "bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                )}
                title={agreed ? undefined : "Please accept the declaration to begin"}
              >
                {agreed && isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
                {agreed && isGenerating ? "Preparing your test…" : "I am ready to begin"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right candidate sidebar (constant across steps) */}
      <aside
        className={cn(
          "w-[150px] md:w-[210px] shrink-0 border-l flex flex-col items-center pt-8 md:pt-10 gap-3",
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
        )}
      >
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-purple-600 flex items-center justify-center overflow-hidden shadow-sm">
          {candidatePhotoURL ? (
            <img src={candidatePhotoURL} alt={candidateName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl md:text-3xl font-bold text-white">{initial}</span>
          )}
        </div>
        <div className={cn("text-sm font-semibold text-center px-2 break-words", isDarkMode ? "text-slate-200" : "text-slate-700")}>
          {candidateName}
        </div>
      </aside>
    </motion.div>
  );
}
