/**
 * Every /admin route, behind one lazy boundary.
 *
 * WHY A SINGLE MODULE. The guard and the layout are needed by every admin screen, so
 * importing them from App.tsx would pull them — and their icon and nav dependencies —
 * into the main bundle that every student downloads. Routing the whole area through one
 * lazily-loaded component keeps all of it in an `/admin` chunk that is fetched only when
 * someone navigates here.
 *
 * /admin/login sits OUTSIDE AdminGuard for the obvious reason: the guard redirects
 * unauthenticated visitors to it, and a login page behind its own auth check is a loop.
 */
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdminGuard } from './shell/AdminGuard';
import { AdminLayout } from './shell/AdminLayout';
import { titleForPath } from './shell/adminNav';

const AdminLogin = lazy(() => import('./AdminLogin'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AdminStudents = lazy(() => import('./AdminStudents'));
const AdminStudentProfile = lazy(() => import('./AdminStudentProfile'));
const AdminQuotas = lazy(() => import('./AdminQuotas'));
const AdminPerformance = lazy(() => import('./AdminPerformance'));
const AdminEngagement = lazy(() => import('./AdminEngagement'));

function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <span className="w-7 h-7 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-[#8FAE2B] animate-spin" />
    </div>
  );
}

/** Wraps a page in the guard + shell, so each route declaration stays one line. */
function Screen({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminLayout title={titleForPath(path)}>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </AdminLayout>
    </AdminGuard>
  );
}

export default function AdminRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route index element={<Screen path=""><AdminDashboard /></Screen>} />
        <Route path="students" element={<Screen path="students"><AdminStudents /></Screen>} />
        <Route path="students/:id" element={<Screen path="students"><AdminStudentProfile /></Screen>} />
        <Route path="quotas" element={<Screen path="quotas"><AdminQuotas /></Screen>} />
        <Route path="performance" element={<Screen path="performance"><AdminPerformance /></Screen>} />
        <Route path="engagement" element={<Screen path="engagement"><AdminEngagement /></Screen>} />
        {/*
          Unknown /admin/* paths fall through to the dashboard rather than the app's
          global 404, so a mistyped admin URL keeps the operator inside the admin shell.
        */}
        <Route path="*" element={<Screen path=""><AdminDashboard /></Screen>} />
      </Routes>
    </Suspense>
  );
}
