/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/pricing" element={<Pricing />} />
        
        {/* Full-screen isolated routes */}
        <Route path="/test" element={<TestEngine />} />
        <Route path="/welcome" element={<WelcomeBriefing />} />
        
        {/* Layout wrapped routes */}
        <Route element={<AppLayout />}>
          {/* Chat Interface route */}
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
        </Route>
        
        {/* Admin panel has been decoupled to a separate application */}
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

