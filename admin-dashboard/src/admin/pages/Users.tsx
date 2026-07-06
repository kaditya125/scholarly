import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { Users as UsersIcon, Shield, Search, CheckCircle, Ban, Clock, MailCheck, MailWarning, UserCog, GraduationCap } from 'lucide-react';
import { useUsers } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, staggerContainer, SkeletonMetricGrid } from '../ui';

export function Users() {
  const { data, isLoading, error, refetch } = useUsers();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const users = useMemo(() => {
    let list = data?.users || [];
    if (roleFilter !== 'all') list = list.filter((u: any) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u: any) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.id?.toLowerCase().includes(q));
    }
    return list;
  }, [data, search, roleFilter]);

  const stats = data?.stats || {};
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : 'Never');

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader title="User Management" subtitle="Platform users, roles, and account status (Firebase Auth)." icon={UsersIcon} iconClassName="text-blue-500" />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Loading users from Firebase..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {data.note && <DataNotice note={data.note} />}

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Users" value={stats.totalUsers ?? 0} icon={UsersIcon} accent="blue" />
            <MetricCard label="Active Students" value={stats.activeStudents ?? 0} icon={GraduationCap} accent="indigo" />
            <MetricCard label="Staff / Admins" value={stats.staffAndAdmins ?? 0} icon={UserCog} accent="violet" />
            <MetricCard label="Suspended" value={stats.suspended ?? 0} icon={Ban} accent="rose" />
          </motion.div>

          <Panel
            flush
            title="Accounts"
            actions={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, ID..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-60" />
                </div>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium bg-slate-50 dark:bg-white/5 focus:outline-none">
                  <option value="all">All Roles</option>
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="moderator">Moderator</option>
                </select>
              </div>
            }
          >
            {users.length === 0 ? (
              <EmptyState message="No users match the filters" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-gray-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">User</th>
                      <th className="px-6 py-4 font-medium">Role</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Verified</th>
                      <th className="px-6 py-4 font-medium">Last Login</th>
                      <th className="px-6 py-4 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {users.map((user: any) => (
                      <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">{String(user.name || '?').charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{user.name}</div>
                              <div className="text-xs text-slate-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-gray-300 w-max capitalize"><Shield className="w-3 h-3 text-slate-400" /> {String(user.role).replace('_', ' ')}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn('px-2.5 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1.5', user.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : user.status === 'suspended' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400')}>
                            {user.status === 'active' && <CheckCircle className="w-3 h-3" />}{user.status === 'suspended' && <Ban className="w-3 h-3" />}{user.status === 'pending' && <Clock className="w-3 h-3" />}{user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">{user.emailVerified ? <MailCheck className="w-4 h-4 text-emerald-500" /> : <MailWarning className="w-4 h-4 text-amber-500" />}</td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{fmt(user.lastLogin)}</td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{fmt(user.joined)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
