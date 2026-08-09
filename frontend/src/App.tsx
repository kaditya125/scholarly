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
  const { user, loading: authLoading } = useAuth();
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

  // Routes that are part of the onboarding/assessment flow — always allow through
  // even when the profile is incomplete, to avoid redirect loops.
  const bypassRoutes = ['/onboarding', '/baseline-assessment', '/welcome', '/assessment', '/assessment/report'];
  const isBypassRoute = bypassRoutes.some((r) => location.pathname.startsWith(r));

  if (!isBypassRoute) {
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

        {/* Full-screen isolated routes — accessible to authenticated users,
            these are part of the first-time student flow */}
        <Route path="/test" element={<TestEngine />} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/baseline-assessment" element={<ProtectedRoute><BaselineAssessmentEngine /></ProtectedRoute>} />
        <Route path="/baseline-assessment/report" element={<ProtectedRoute><AssessmentReportDashboard /></ProtectedRoute>} />
        <Route path="/welcome" element={<ProtectedRoute><WelcomeBriefing /></ProtectedRoute>} />

        {/* Layout wrapped routes — all protected */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/research" element={<Research />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/dashboard" element={<StudentDashboard />} />
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
