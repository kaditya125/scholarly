/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { ThemeProvider } from "./lib/ThemeContext";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { AnalyticsTracker } from "./lib/analytics";
import ProtectedRoute from "./components/auth/ProtectedRoute";

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
const Reader = lazy(() => import("./pages/Reader"));
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
const OurTeam = lazy(() => import("./pages/OurTeam"));
const Blog = lazy(() => import("./pages/Blog"));
const SyllabusCoverage = lazy(() => import("./pages/SyllabusCoverage"));
const StudyPlanToday = lazy(() => import("./pages/StudyPlanToday"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Contact = lazy(() => import("./pages/Contact"));
const ForTeachers = lazy(() => import("./pages/ForTeachers"));
const ExamLanding = lazy(() => import("./pages/ExamLanding"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const PolicyHub = lazy(() => import("./pages/legal/PolicyHub"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Refunds = lazy(() => import("./pages/legal/Refunds"));
const Security = lazy(() => import("./pages/legal/Security"));
const SocialHub = lazy(() => import("./pages/SocialHub"));
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
        {/* "Meet the Founder". The route and the footer link say "Our Team" so the page can
            grow into a real team page later without moving the URL — see pages/OurTeam.tsx. */}
        <Route path="/our-team" element={<OurTeam />} />
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
        <Route path="/social" element={<SocialHub />} />
        <Route path="/community/social" element={<SocialHub />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/security" element={<Security />} />
        <Route path="/policies" element={<PolicyHub />} />
        <Route path="/policies/:category" element={<PolicyHub />} />

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
        <Route path="/read" element={<ProtectedRoute><Reader /></ProtectedRoute>} />
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
          <Route path="/exam-center" element={<Navigate to="/tests" replace />} />
          <Route path="/tests" element={<TestCenter />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/coverage" element={<SyllabusCoverage />} />
          <Route path="/plan" element={<StudyPlanToday />} />
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
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.uid) return;
    let cancel = false;
    import("./hooks/usePresence").then((m) => {
      // heartbeat managed by hook module if needed
    });
    return () => { cancel = true; };
  }, [user?.uid]);
  return null;
}

function GlobalHelpdeskWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        const id = (window as any).requestIdleCallback(() => setReady(true), { timeout: 3500 });
        return () => (window as any).cancelIdleCallback(id);
      } else {
        const timer = setTimeout(() => setReady(true), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Hide chatbot completely when user is logged in or before idle ready
  if (!ready || user) return null;

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
          <AnalyticsTracker />
          <AppRoutes />
          <GlobalHelpdeskWidget />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
