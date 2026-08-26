/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { ThemeProvider } from "./lib/ThemeContext";
import { AuthProvider } from "./lib/AuthContext";
import { useAuth } from "./lib/AuthContext";
import { useProfile } from "./hooks/api/useProfile";
import { usePresenceHeartbeat } from "./hooks/usePresence";

/**
 * Every route-level page is lazy-loaded so a visit to any one route only downloads that
 * route's code, instead of the whole app's ~6MB bundle shipping on every page view —
 * including anonymous visits to the new /exams/:slug SEO landing pages, where a heavy
 * first load directly hurts Core Web Vitals (LCP) and therefore search ranking. Vite/
 * Rollup automatically gives each dynamic import() its own chunk.
 *
 * AppLayout and StudentHelpHub are named exports, so they need the extra .then() step to
 * resolve to the { default } shape React.lazy() requires; everything else here is a
 * default export and works directly.
 */
const AppLayout = lazy(() => import("./components/Layout").then((m) => ({ default: m.AppLayout })));
const LandingPage = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TestCenter = lazy(() => import("./pages/TestCenter"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const Discussions = lazy(() => import("./pages/Discussions"));
const Planner = lazy(() => import("./pages/Planner"));
const TestEngine = lazy(() => import("./pages/TestEngine"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Report = lazy(() => import("./pages/Report"));
const Signup = lazy(() => import("./pages/Signup"));
const Signin = lazy(() => import("./pages/Signin"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const SelectRole = lazy(() => import("./pages/SelectRole"));
const ExamCommandCenter = lazy(() => import("./pages/ExamCommandCenter"));
const TeacherOnboarding = lazy(() => import("./pages/TeacherOnboarding"));
// Teacher workspace (Phase 3C) — replaces the former TeacherLanding placeholder at /teach.
const TeacherLayout = lazy(() => import("./components/teacher/TeacherLayout"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
const TeacherClasses = lazy(() => import("./pages/teacher/TeacherClasses"));
const TeacherClassEditor = lazy(() => import("./pages/teacher/TeacherClassEditor"));
const TeacherClassStudents = lazy(() => import("./pages/teacher/TeacherClassStudents"));
const TeacherClassResources = lazy(() => import("./pages/teacher/TeacherClassResources"));
const TeacherClassAssignments = lazy(() => import("./pages/teacher/TeacherClassAssignments"));
const TeacherClassDiscussion = lazy(() => import("./pages/teacher/TeacherClassDiscussion"));
const TeacherEarnings = lazy(() => import("./pages/teacher/TeacherEarnings"));
const TeacherClassLive = lazy(() => import("./pages/teacher/TeacherClassLive"));
const TeacherReferrals = lazy(() => import("./pages/teacher/TeacherReferrals"));
const TeacherStudents = lazy(() => import("./pages/teacher/TeacherStudents"));
const QuizAttemptPage = lazy(() => import("./pages/QuizAttempt"));
const ClassSessionJoin = lazy(() => import("./pages/ClassSessionJoin"));
const JoinClass = lazy(() => import("./pages/JoinClass"));
const MyClasses = lazy(() => import("./pages/MyClasses"));
const Refer = lazy(() => import("./pages/Refer"));
const RoleLanding = lazy(() => import("./components/RoleLanding"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Pricing = lazy(() => import("./pages/Pricing"));
const ReferralProgram = lazy(() => import("./pages/ReferralProgram"));
const Help = lazy(() => import("./pages/Help"));
const StudentHelpHub = lazy(() =>
  import("./components/help/StudentHelpHub").then((m) => ({ default: m.StudentHelpHub }))
);
const Chat = lazy(() => import("./pages/Chat"));
const Research = lazy(() => import("./pages/Research"));
const Flashcards = lazy(() => import("./pages/Flashcards"));
const Notebooks = lazy(() => import("./pages/Notebooks"));
const StudyGroups = lazy(() => import("./pages/StudyGroups"));
const Explore = lazy(() => import("./pages/Explore"));
const WelcomeBriefing = lazy(() => import("./pages/WelcomeBriefing"));
const Profile = lazy(() => import("./pages/Profile"));
const ContentPipeline = lazy(() => import("./pages/ContentPipeline"));
const PodcastStudioV2 = lazy(() => import("./pages/PodcastStudioV2"));
const Podcasts = lazy(() => import("./pages/Podcasts"));
const AIWorkspace = lazy(() => import("./pages/AIWorkspace"));
const Community = lazy(() => import("./pages/Community"));
const Chats = lazy(() => import("./pages/Chats"));
const People = lazy(() => import("./pages/People"));
const Documents = lazy(() => import("./pages/Documents"));
const VideoLesson = lazy(() => import("./pages/VideoLesson"));
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));
const BaselineAssessmentEngine = lazy(() => import("./pages/BaselineAssessmentEngine"));
const AssessmentReportDashboard = lazy(() => import("./pages/AssessmentReportDashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const MyDoubts = lazy(() => import("./pages/MyDoubts"));
const Trash = lazy(() => import("./pages/Trash"));
const Checkout = lazy(() => import("./pages/Checkout"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
// Public marketing + policy pages. These are intentionally outside ProtectedRoute:
// a visitor (and Razorpay's merchant review) must be able to read them signed out.
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const SyllabusCoverage = lazy(() => import("./pages/SyllabusCoverage"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Contact = lazy(() => import("./pages/Contact"));
const ForTeachers = lazy(() => import("./pages/ForTeachers"));
const ExamLanding = lazy(() => import("./pages/ExamLanding"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Refunds = lazy(() => import("./pages/legal/Refunds"));
const Security = lazy(() => import("./pages/legal/Security"));
const AutomationDashboard = lazy(() => import("./pages/admin/AutomationDashboard"));
const AutomationStudio = lazy(() => import("./pages/admin/AutomationStudio"));
const ExecutionDetail = lazy(() => import("./pages/admin/ExecutionDetail"));
const FloatingHelpdeskWidget = lazy(() =>
  import("./components/help/FloatingHelpdeskWidget").then((m) => ({ default: m.FloatingHelpdeskWidget }))
);

/** Shown only while a route's own chunk is downloading — same spinner ProtectedRoute
 *  already uses elsewhere, so a lazy-load pause and an auth-check pause look identical. */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
      <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
    </div>
  );
}

/**
 * ProtectedRoute — guards all authenticated application routes.
 *
 * Loading order:
 *   1. Wait for Firebase Auth to resolve (auth.loading)
 *   2. Wait for the profile query to settle (profile.isLoading)
 *   3. If not authenticated → /signin
 *   4. If profile.isComplete !== true → /onboarding
 *      (Exception: the /onboarding route itself bypasses this so the wizard
 *      doesn't redirect itself, as does /baseline-assessment and /welcome.)
 *   5. Otherwise → render the requested page
 *
 * Avoids redirect loops by:
 *   - Never redirecting while auth or profile are still loading.
 *   - Allowing /onboarding, /baseline-assessment, /welcome, and assessment
 *     report to render even for incomplete profiles (they ARE the completion path).
 *   - Checking sessionStorage if the user explicitly clicked "Skip for now".
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, role, claimsLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();

  // Show nothing while auth initialises — prevents flash of /signin redirect
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  // Not logged in → go to sign-in, preserving the intended destination
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // ── Mandatory Email Verification Gate for Email/Password accounts ───────────
  // Google accounts have emailVerified: true automatically. Email/Password accounts
  // must verify their email before accessing onboarding or any protected surface.
  const isGoogleAccount = user.providerData?.some((p) => p.providerId === 'google.com');
  const isPasswordAccount = user.providerData?.some((p) => p.providerId === 'password') || (!user.providerData?.length && !!user.email);
  const isUnverifiedEmail = !user.emailVerified && isPasswordAccount && !isGoogleAccount;

  if (isUnverifiedEmail) {
    if (location.pathname !== '/verify-email') {
      return <Navigate to="/verify-email" replace />;
    }
  }

  // Authenticated but no product role → resolve it before anything else.
  //
  // Gated on claimsLoading: custom claims arrive with the ID token a beat after `user`
  // resolves, so acting on `role` too early would bounce EVERY user to /select-role on
  // first paint. /select-role itself is excluded or it would redirect to itself.
  //
  // Deliberately placed before the bypass-route check so a legacy account landing on
  // /onboarding still establishes a role first — a missing role means "not yet
  // established", never "assume student".
  if (location.pathname !== '/select-role' && location.pathname !== '/verify-email') {
    if (claimsLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
          <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
        </div>
      );
    }
    if (!role) {
      return <Navigate to="/select-role" replace />;
    }
  }

  // Routes that are part of the onboarding/assessment flow — always allow through
  // even when the profile is incomplete, to avoid redirect loops.
  const bypassRoutes = ['/onboarding', '/baseline-assessment', '/welcome', '/assessment', '/assessment/report', '/select-role', '/teacher/onboarding', '/verify-email'];
  const isBypassRoute = bypassRoutes.some((r) => location.pathname.startsWith(r));

  // Student-profile completeness is a STUDENT-ONLY gate.
  //
  // useProfile() fetches the *student* learning profile, so a teacher account never has one and
  // `isComplete` stays falsy for them permanently. Without the role check, every teacher would be
  // redirected into the student onboarding wizard on every non-bypass route — the bug this phase
  // fixes. Teachers reach their own destination via /teacher/onboarding.
  //
  // The profileLoading wait is scoped the same way on purpose: that query polls (refetchInterval)
  // and would never settle for a teacher, producing intermittent spinners on every route.
  if (!isBypassRoute && role === 'student') {
    // Wait for the profile to load before deciding whether to redirect
    if (profileLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
          <span className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-indigo-500 animate-spin" />
        </div>
      );
    }

    // Authenticated but profile not yet complete → start onboarding
    if (!profile?.isComplete && sessionStorage.getItem('onboarding_skipped') !== 'true') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  return <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<RouteFallback />}>
      <Routes location={location} key={location.pathname}>
        {/* Public routes — no auth required */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/demo" element={<HowItWorks />} />
        <Route path="/referral-program" element={<ReferralProgram />} />
        <Route path="/help" element={<Help />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        {/* Public marketing page. Outside ProtectedRoute on purpose: a signed-out visitor,
            a signed-in student and a signed-in teacher must all see the same page, and none
            of them should be diverted into student onboarding by visiting it. */}
        <Route path="/for-teachers" element={<ForTeachers />} />
        {/* One dedicated landing page per exam Sadhya covers — see examCatalog.ts.
            Public and unauthenticated: this is where category-specific search traffic
            has to land. */}
        <Route path="/exams/:slug" element={<ExamLanding />} />
        {/* Invitation landing. Public on purpose: a shared link is opened by people who are
            signed out or mid-onboarding, and ProtectedRoute would divert the latter into the
            student wizard and lose the invitation. The page owns its own gate. */}
        <Route path="/join/:code" element={<JoinClass />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/security" element={<Security />} />

        {/* Role recovery — authenticated, product role not yet established. */}
        <Route path="/select-role" element={<ProtectedRoute><SelectRole /></ProtectedRoute>} />

        {/* Full-screen isolated routes — accessible to authenticated users,
            these are part of the first-time student flow */}
        <Route path="/test" element={<TestEngine />} />
        {/* Real quiz-attempt taking UI (Phase 3G) — full-screen and isolated like /test,
            but wired to the actual quiz-attempts backend rather than TestEngine's mock data. */}
        <Route path="/quiz/attempts/:attemptId" element={<ProtectedRoute><QuizAttemptPage /></ProtectedRoute>} />
        {/* Live class session (Phase 3M) — full-screen and isolated, same reasoning as above. */}
        <Route path="/classes/:classId/sessions/:sessionId/join" element={<ProtectedRoute><ClassSessionJoin /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        {/* Teacher onboarding wizard — one route, internal step state (see the file header). */}
        <Route path="/teacher/onboarding" element={<ProtectedRoute><TeacherOnboarding /></ProtectedRoute>} />
        {/* Teacher workspace. TeacherLayout re-checks auth, product role and profile
            completeness itself, so it also behaves correctly if ever mounted elsewhere;
            ProtectedRoute is kept for consistency with every other authenticated route. */}
        <Route path="/teach" element={<ProtectedRoute><TeacherLayout /></ProtectedRoute>}>
          <Route index element={<TeacherDashboard />} />
          <Route path="classes" element={<TeacherClasses />} />
          {/* React Router ranks static segments above dynamic ones, so "new" is matched
              before ":id" regardless of declaration order. */}
          <Route path="classes/new" element={<TeacherClassEditor />} />
          <Route path="classes/:id" element={<TeacherClassEditor />} />
          <Route path="classes/:id/students" element={<TeacherClassStudents />} />
          <Route path="classes/:id/resources" element={<TeacherClassResources />} />
          <Route path="classes/:id/assignments" element={<TeacherClassAssignments />} />
          <Route path="classes/:id/discussion" element={<TeacherClassDiscussion />} />
          <Route path="students" element={<TeacherStudents />} />
          <Route path="earnings" element={<TeacherEarnings />} />
          <Route path="referrals" element={<TeacherReferrals />} />
          <Route path="classes/:id/live" element={<TeacherClassLive />} />
          {/*
            Shared surfaces, reused unmodified — same component as the student route below,
            mounted a second time so it renders inside TeacherLayout instead of AppLayout. See
            TeacherLayout.tsx's own docblock: threading a role branch through AppLayout's
            700-line MAIN_MENU would make the most complex component in the app more complex,
            so the fix is a second route, not a role conditional inside either shell. The bare
            /chat, /notebooks, /tests, /podcasts, /settings routes below are unchanged for
            students.
          */}
          <Route path="chat" element={<Chat />} />
          <Route path="notebooks" element={<Notebooks />} />
          <Route path="tests" element={<TestCenter />} />
          <Route path="podcasts" element={<Podcasts />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/baseline-assessment" element={<ProtectedRoute><BaselineAssessmentEngine /></ProtectedRoute>} />
        <Route path="/baseline-assessment/report" element={<ProtectedRoute><AssessmentReportDashboard /></ProtectedRoute>} />
        <Route path="/welcome" element={<ProtectedRoute><WelcomeBriefing /></ProtectedRoute>} />
        <Route path="/admin/automations" element={<ProtectedRoute><AutomationDashboard /></ProtectedRoute>} />
        <Route path="/admin/automations/:id" element={<ProtectedRoute><AutomationStudio /></ProtectedRoute>} />
        <Route path="/admin/automations/:workflowId/executions" element={<ProtectedRoute><ExecutionDetail /></ProtectedRoute>} />
        <Route path="/admin/automations/:workflowId/executions/:execId" element={<ProtectedRoute><ExecutionDetail /></ProtectedRoute>} />

        {/* Layout wrapped routes — all protected */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/research" element={<Research />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/dashboard"
            element={
              <RoleLanding
                student={<StudentDashboard />}
                teacher={<Navigate to="/teach" replace />}
              />
            }
          />
          <Route path="/exam-center" element={<ExamCommandCenter />} />
          <Route path="/tests" element={<TestCenter />} />
          <Route path="/analytics" element={<Dashboard />} />
          <Route path="/coverage" element={<SyllabusCoverage />} />
          <Route path="/report" element={<Report />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/discussions" element={<Discussions />} />
          <Route path="/notebooks" element={<Notebooks />} />
          <Route path="/groups" element={<StudyGroups />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/leaderboard" element={<Leaderboard />} />

          {/* Modern Routes */}
          <Route path="/pipeline" element={<ContentPipeline />} />
          <Route path="/content-pipeline" element={<ContentPipeline />} />
          <Route path="/podcasts" element={<Podcasts />} />
          <Route path="/podcasts/studio" element={<Podcasts />} />
          <Route path="/workspace" element={<AIWorkspace />} />
          <Route path="/community" element={<Community />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/people" element={<People />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/video-lesson" element={<VideoLesson />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/assessment" element={<BaselineAssessmentEngine />} />
          <Route path="/assessment/report" element={<AssessmentReportDashboard />} />
          <Route path="/doubts" element={<MyDoubts />} />
          <Route path="/support" element={<StudentHelpHub />} />
          <Route path="/help-center" element={<StudentHelpHub />} />
          {/* Student side of the enrolment loop (Phase 3E). */}
          <Route path="/my-classes" element={<MyClasses />} />
          <Route path="/refer" element={<Refer />} />
          <Route path="/referral-program" element={<Refer />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
        </Route>

        {/* Catch-all fallback for any undefined routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

function GlobalPresencePublisher() {
  usePresenceHeartbeat();
  return null;
}

function GlobalHelpdeskWidget() {
  const { user } = useAuth();
  const location = useLocation();

  // Hide chatbot completely when user is logged in
  if (user) return null;

  // Hide on full-screen timed exam engines to avoid blocking student answers
  const isExamEngine =
    location.pathname.startsWith('/test-engine') ||
    location.pathname.startsWith('/baseline-assessment') ||
    location.pathname.startsWith('/quiz-attempt');

  if (isExamEngine) return null;
  return (
    <Suspense fallback={null}>
      <FloatingHelpdeskWidget />
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GlobalPresencePublisher />
        <BrowserRouter>
          <AppRoutes />
          <GlobalHelpdeskWidget />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
