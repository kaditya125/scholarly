/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { ThemeProvider } from "./lib/ThemeContext";
import { AuthProvider } from "./lib/AuthContext";
import { AppLayout } from "./components/Layout";
import LandingPage from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import TestCenter from "./pages/TestCenter";
import StudentDashboard from "./pages/StudentDashboard";
import Discussions from "./pages/Discussions";
import Planner from "./pages/Planner";
import TestEngine from "./pages/TestEngine";
import Analytics from "./pages/Analytics";
import Report from "./pages/Report";
import Signup from "./pages/Signup";
import Signin from "./pages/Signin";
import SelectRole from "./pages/SelectRole";
import TeacherOnboarding from "./pages/TeacherOnboarding";
// Teacher workspace (Phase 3C) — replaces the former TeacherLanding placeholder at /teach.
import TeacherLayout from "./components/teacher/TeacherLayout";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import TeacherClasses from "./pages/teacher/TeacherClasses";
import TeacherClassEditor from "./pages/teacher/TeacherClassEditor";
import TeacherClassStudents from "./pages/teacher/TeacherClassStudents";
import TeacherClassResources from "./pages/teacher/TeacherClassResources";
import TeacherClassAssignments from "./pages/teacher/TeacherClassAssignments";
import TeacherStudents from "./pages/teacher/TeacherStudents";
import QuizAttemptPage from "./pages/QuizAttempt";
import JoinClass from "./pages/JoinClass";
import MyClasses from "./pages/MyClasses";
import RoleLanding from "./components/RoleLanding";
import Leaderboard from "./pages/Leaderboard";
import Pricing from "./pages/Pricing";
import Chat from "./pages/Chat";
import Research from "./pages/Research";
import Flashcards from "./pages/Flashcards";
import Notebooks from "./pages/Notebooks";
import StudyGroups from "./pages/StudyGroups";
import Explore from "./pages/Explore";
import WelcomeBriefing from "./pages/WelcomeBriefing";
import Profile from "./pages/Profile";
import ContentPipeline from "./pages/ContentPipeline";
import PodcastStudioV2 from "./pages/PodcastStudioV2";
import Podcasts from "./pages/Podcasts";
import AIWorkspace from "./pages/AIWorkspace";
import Community from "./pages/Community";
import Chats from "./pages/Chats";
import People from "./pages/People";
import Documents from "./pages/Documents";
import VideoLesson from "./pages/VideoLesson";
import Settings from "./pages/Settings";
import BaselineAssessmentEngine from "./pages/BaselineAssessmentEngine";
import AssessmentReportDashboard from "./pages/AssessmentReportDashboard";
import Onboarding from "./pages/Onboarding";
import MyDoubts from "./pages/MyDoubts";
import Trash from "./pages/Trash";
import Checkout from "./pages/Checkout";
import PaymentSuccess from "./pages/PaymentSuccess";
// Public marketing + policy pages. These are intentionally outside ProtectedRoute:
// a visitor (and Razorpay's merchant review) must be able to read them signed out.
import About from "./pages/About";
import Contact from "./pages/Contact";
import ForTeachers from "./pages/ForTeachers";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Refunds from "./pages/legal/Refunds";
import Security from "./pages/legal/Security";
import { useAuth } from "./lib/AuthContext";
import { useProfile } from "./hooks/api/useProfile";

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

  // Authenticated but no product role → resolve it before anything else.
  //
  // Gated on claimsLoading: custom claims arrive with the ID token a beat after `user`
  // resolves, so acting on `role` too early would bounce EVERY user to /select-role on
  // first paint. /select-role itself is excluded or it would redirect to itself.
  //
  // Deliberately placed before the bypass-route check so a legacy account landing on
  // /onboarding still establishes a role first — a missing role means "not yet
  // established", never "assume student".
  if (location.pathname !== '/select-role') {
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
  const bypassRoutes = ['/onboarding', '/baseline-assessment', '/welcome', '/assessment', '/assessment/report', '/select-role', '/teacher/onboarding'];
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
      <Routes location={location} key={location.pathname}>
        {/* Public routes — no auth required */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        {/* Public marketing page. Outside ProtectedRoute on purpose: a signed-out visitor,
            a signed-in student and a signed-in teacher must all see the same page, and none
            of them should be diverted into student onboarding by visiting it. */}
        <Route path="/for-teachers" element={<ForTeachers />} />
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
          <Route path="students" element={<TeacherStudents />} />
        </Route>
        <Route path="/baseline-assessment" element={<ProtectedRoute><BaselineAssessmentEngine /></ProtectedRoute>} />
        <Route path="/baseline-assessment/report" element={<ProtectedRoute><AssessmentReportDashboard /></ProtectedRoute>} />
        <Route path="/welcome" element={<ProtectedRoute><WelcomeBriefing /></ProtectedRoute>} />

        {/* Layout wrapped routes — all protected */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/research" element={<Research />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route
            path="/dashboard"
            element={
              <RoleLanding
                student={<StudentDashboard />}
                teacher={<Navigate to="/teach" replace />}
              />
            }
          />
          <Route path="/tests" element={<TestCenter />} />
          <Route path="/analytics" element={<Dashboard />} />
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
          <Route path="/podcasts" element={<Podcasts />} />
          <Route path="/podcasts/studio" element={<Podcasts />} />
          <Route path="/workspace" element={<AIWorkspace />} />
          <Route path="/community" element={<Community />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/people" element={<People />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/video-lesson" element={<VideoLesson />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/assessment" element={<BaselineAssessmentEngine />} />
          <Route path="/assessment/report" element={<AssessmentReportDashboard />} />
          <Route path="/doubts" element={<MyDoubts />} />
          {/* Student side of the enrolment loop (Phase 3E). */}
          <Route path="/my-classes" element={<MyClasses />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
