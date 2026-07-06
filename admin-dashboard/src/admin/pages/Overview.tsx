import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity, HeartPulse, Users as UsersIcon, BookOpen, ShieldAlert, ArrowRight,
  Database, Network, DollarSign, Sparkles
} from 'lucide-react';
import {
  useSystemHealth, useAIMetrics, useUsers, useNotebooks, useSecurity, useVectorDB
} from '../../lib/api/hooks';
import { useAuth } from '../../lib/AuthContext';
import { MetricCard, Panel, Badge, statusTone, staggerContainer } from '../ui';
import { CostAnalyticsWidget } from '../components/CostAnalyticsWidget';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Overview() {
  const health = useSystemHealth();
  const ai = useAIMetrics();
  const users = useUsers();
  const notebooks = useNotebooks();
  const security = useSecurity();
  const vector = useVectorDB();
  const { user } = useAuth();

  const name = (user?.displayName || user?.email?.split('@')[0] || 'Administrator').split(' ')[0];
  const requestsSpark: number[] = (ai.data?.timeline || []).map((t: any) => t.requests ?? 0);
  const status = health.data?.status ?? '—';

  const quickLinks = [
    { label: 'AI Monitoring', desc: 'Latency, providers, tokens', to: '/admin/ai-monitoring', icon: Activity, accent: 'text-indigo-500' },
    { label: 'Vector Database', desc: 'Pinecone namespaces & vectors', to: '/admin/vector-db', icon: Database, accent: 'text-sky-500' },
    { label: 'Knowledge Graph', desc: 'Concept nodes & edges', to: '/admin/knowledge-graph', icon: Network, accent: 'text-fuchsia-500' },
    { label: 'Cost Analytics', desc: 'Spend & provider breakdown', to: '/admin/costs', icon: DollarSign, accent: 'text-emerald-500' },
    { label: 'User Management', desc: 'Accounts, roles & status', to: '/admin/users', icon: UsersIcon, accent: 'text-blue-500' },
    { label: 'Security', desc: 'Alerts & guardrails', to: '/admin/security', icon: ShieldAlert, accent: 'text-rose-500' },
  ];

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Executive hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-2">
          <Sparkles className="w-4 h-4" /> Enterprise AI Operations
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-serif">
          {greeting()}, {name}
        </h1>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <Badge tone={statusTone(String(status))} dot>
            System {String(status)}
          </Badge>
          {!health.isLoading && (
            <span className="text-sm text-slate-500 dark:text-gray-400">
              Uptime {Math.round((health.data?.uptimeSeconds ?? 0) / 60)}m · {health.data?.services?.length ?? 0} services monitored
            </span>
          )}
        </div>
      </motion.div>

      {/* KPI grid */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <MetricCard
          label="System Status"
          value={health.isLoading ? '—' : String(health.data?.status ?? '—')}
          icon={HeartPulse}
          accent="rose"
          status={{ label: `${health.data?.activeAlerts ?? 0} alerts`, tone: (health.data?.activeAlerts ?? 0) > 0 ? 'warning' : 'success' }}
        />
        <MetricCard
          label="AI Requests Today"
          value={ai.data?.requestsToday ?? 0}
          icon={Activity}
          accent="indigo"
          sparkline={requestsSpark}
        />
        <MetricCard
          label="Verification Pass Rate"
          value={health.data?.verificationSuccessRate ?? 0}
          suffix="%"
          icon={ShieldAlert}
          accent="emerald"
        />
        <MetricCard label="Total Users" value={users.data?.stats?.totalUsers ?? 0} icon={UsersIcon} accent="blue" />
        <MetricCard label="Total Notebooks" value={notebooks.data?.stats?.totalNotebooks ?? 0} icon={BookOpen} accent="fuchsia" />
        <MetricCard label="Indexed Vectors" value={vector.data?.totalVectors ?? 0} icon={Database} accent="sky" />
      </motion.div>

      {/* Cost Analytics */}
      <div className="my-8">
        <CostAnalyticsWidget />
      </div>

      {/* Quick access */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((q) => (
            <Link key={q.to} to={q.to}>
              <Panel animate={false} className="group hover:shadow-md transition-all cursor-pointer" bodyClassName="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                      <q.icon className={`w-5 h-5 ${q.accent}`} />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-[15px]">{q.label}</div>
                      <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{q.desc}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 dark:text-gray-600 dark:group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      </div>

      {security.data?.stats && (security.data.stats.activeAlerts ?? 0) > 0 && (
        <Panel
          title="Active Alerts"
          subtitle={`${security.data.stats.activeAlerts} unresolved · ${security.data.stats.criticalAlerts} critical`}
          icon={<ShieldAlert className="w-4 h-4 text-amber-500" />}
          actions={
            <Link to="/admin/security" className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline inline-flex items-center gap-1">
              Open Security <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
          flush
        >
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {(security.data.threats || []).slice(0, 5).map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-rose-500' : a.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 dark:text-gray-200">{a.message}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{a.type}</span>
                    <span>·</span>
                    <span>{a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</span>
                  </div>
                </div>
                <Badge tone={a.severity === 'critical' ? 'danger' : a.severity === 'medium' ? 'warning' : 'neutral'}>{a.severity}</Badge>
              </div>
            ))}
            {(security.data.threats || []).length === 0 && (
              <div className="px-5 py-4 text-sm text-slate-500 dark:text-gray-400">
                {security.data.stats.activeAlerts} active alert(s) recorded. Open Security for full detail and to resolve them.
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
