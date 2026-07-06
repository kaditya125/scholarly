import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminLayout } from "../layouts/AdminLayout";

// Lazy-load module pages so each (and its charting deps) is code-split and
// fetched on navigation, keeping the initial bundle small.
const Overview = lazy(() => import("../pages/Overview").then((m) => ({ default: m.Overview })));
const AIMonitoring = lazy(() => import("../pages/AIMonitoring").then((m) => ({ default: m.AIMonitoring })));
const CostAnalytics = lazy(() => import("../pages/CostAnalytics").then((m) => ({ default: m.CostAnalytics })));
const ContinuousEval = lazy(() => import("../pages/ContinuousEval").then((m) => ({ default: m.ContinuousEval })));
const SystemHealth = lazy(() => import("../pages/SystemHealth").then((m) => ({ default: m.SystemHealth })));
const CurriculumIngestion = lazy(() => import("../pages/CurriculumIngestion").then((m) => ({ default: m.CurriculumIngestion })));
const KnowledgeGraphManager = lazy(() => import("../pages/KnowledgeGraphManager").then((m) => ({ default: m.KnowledgeGraphManager })));
const VectorDB = lazy(() => import("../pages/VectorDB").then((m) => ({ default: m.VectorDB })));
const PromptStudio = lazy(() => import("../pages/PromptStudio").then((m) => ({ default: m.PromptStudio })));
const LearningAssets = lazy(() => import("../pages/LearningAssets").then((m) => ({ default: m.LearningAssets })));
const Notebooks = lazy(() => import("../pages/Notebooks").then((m) => ({ default: m.Notebooks })));
const FeatureFlags = lazy(() => import("../pages/FeatureFlags").then((m) => ({ default: m.FeatureFlags })));
const Users = lazy(() => import("../pages/Users").then((m) => ({ default: m.Users })));
const Security = lazy(() => import("../pages/Security").then((m) => ({ default: m.Security })));
const Logs = lazy(() => import("../pages/Logs").then((m) => ({ default: m.Logs })));
const Notifications = lazy(() => import("../pages/Notifications").then((m) => ({ default: m.Notifications })));
const Backups = lazy(() => import("../pages/Backups").then((m) => ({ default: m.Backups })));
const Settings = lazy(() => import("../pages/Settings").then((m) => ({ default: m.Settings })));

export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Overview />} />
        <Route path="ai-monitoring" element={<AIMonitoring />} />
        <Route path="system-health" element={<SystemHealth />} />
        <Route path="costs" element={<CostAnalytics />} />

        <Route path="curriculum" element={<CurriculumIngestion />} />
        <Route path="knowledge-graph" element={<KnowledgeGraphManager />} />
        <Route path="vector-db" element={<VectorDB />} />

        <Route path="prompts" element={<PromptStudio />} />
        <Route path="assets" element={<LearningAssets />} />
        <Route path="notebooks" element={<Notebooks />} />
        <Route path="feature-flags" element={<FeatureFlags />} />
        <Route path="evaluation" element={<ContinuousEval />} />

        <Route path="users" element={<Users />} />
        <Route path="security" element={<Security />} />
        <Route path="logs" element={<Logs />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="backups" element={<Backups />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
