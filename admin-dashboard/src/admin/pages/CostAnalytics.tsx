import { useState } from 'react';
import { motion } from 'motion/react';
import {
  BarChart2, DollarSign, Wallet, CreditCard, PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { useCostAnalytics, useExchangeRates } from '../../lib/api/hooks';
import { LoadingState, ErrorState, DataNotice } from '../components/DataStates';
import { PageHeader, MetricCard, Panel, staggerContainer, SkeletonMetricGrid } from '../ui';
import { CURRENCIES, FALLBACK_RATES, findCurrency, getStoredCurrency, storeCurrency, convert } from '../../lib/currency';
import { CostAnalyticsWidget } from '../components/CostAnalyticsWidget';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];

export function CostAnalytics() {
  const { data, isLoading, error, refetch } = useCostAnalytics(30);
  const { data: liveRates } = useExchangeRates();
  const [currencyCode, setCurrencyCode] = useState<string>(() => getStoredCurrency());

  const cur = findCurrency(currencyCode);
  const rate = liveRates?.[cur.code] ?? FALLBACK_RATES[cur.code] ?? 1;
  const ratesLive = !!liveRates?.[cur.code];
  const sym = cur.symbol;

  const onCurrencyChange = (code: string) => {
    setCurrencyCode(code);
    storeCurrency(code);
  };

  // Fraction digits: keep sub-unit costs visible, tidy for larger amounts.
  const dec = (usd: number) => (convert(usd, rate) > 0 && convert(usd, rate) < 1 ? 4 : 2);
  const tip = (v: any) => {
    const n = Number(v);
    return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 2 })}`;
  };

  const topUsers = (data?.topUsers || []).map((u: any) => ({
    user: typeof u.userId === 'string' ? `${u.userId.slice(0, 8)}…` : String(u.userId),
    cost: convert(u.cost, rate),
  }));
  const dailyCosts = (data?.dailyCosts || []).map((d: any) => ({ date: d.date, cost: convert(d.cost, rate) }));
  const byProvider = (data?.byProviderArray || []).map((p: any) => ({ name: p.name, value: convert(p.value, rate) }));
  const dailySpark: number[] = dailyCosts.map((d: any) => d.cost);
  const hasCostData = (data?.recordCount ?? 0) > 0;

  const currencySelector = (
    <select
      value={currencyCode}
      onChange={(e) => onCurrencyChange(e.target.value)}
      className="px-3 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-sm font-medium bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      aria-label="Display currency"
    >
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>{c.code} · {c.symbol}</option>
      ))}
    </select>
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Cost Analytics"
        subtitle="Token consumption and provider cost tracking (last 30 days)."
        icon={BarChart2}
        iconClassName="text-emerald-600"
        actions={currencySelector}
      />

      {isLoading ? (
        <div className="space-y-6"><SkeletonMetricGrid /><LoadingState label="Loading cost records..." /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <DataNotice
            note={
              hasCostData
                ? `Amounts shown in ${cur.code} (${cur.label}). Costs are recorded in USD and converted at ${ratesLive ? 'the live' : 'an approximate'} rate 1 USD ≈ ${sym}${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}${ratesLive ? '' : ' (live rate unavailable)'}.`
                : `No cost records found in the last 30 days. Costs are recorded per AI request; values are real and currently zero. Display currency: ${cur.code}.`
            }
          />
          
          <div className="mb-6">
            <CostAnalyticsWidget />
          </div>

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total (30 days)" value={convert(data.totalCostUSD ?? 0, rate)} prefix={sym} decimals={dec(data.totalCostUSD ?? 0)} icon={DollarSign} accent="emerald" sparkline={dailySpark} />
            <MetricCard label="Est. Monthly" value={convert(data.estimatedMonthlyCost ?? 0, rate)} prefix={sym} decimals={dec(data.estimatedMonthlyCost ?? 0)} icon={Wallet} accent="teal" />
            <MetricCard label="Cost / User" value={convert(data.costPerUser ?? 0, rate)} prefix={sym} decimals={dec(data.costPerUser ?? 0)} icon={CreditCard} accent="indigo" />
            <MetricCard label="Cost / Chat" value={convert(data.costPerChat ?? 0, rate)} prefix={sym} decimals={dec(data.costPerChat ?? 0)} icon={PieChartIcon} accent="violet" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Daily Cost Trend" subtitle={cur.code}>
              <div className="h-[300px]">
                {dailyCosts.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No cost data in range</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyCosts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `${sym}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8883" />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} itemStyle={{ color: '#fff' }} formatter={(value) => [tip(value), 'Cost']} />
                      <Area type="monotone" dataKey="cost" stroke="#10b981" fillOpacity={1} fill="url(#colorCost)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel title="Top Users by Cost" subtitle={cur.code}>
              <div className="h-[300px]">
                {topUsers.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No user cost data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topUsers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="user" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `${sym}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8883" />
                      <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px' }} formatter={(value) => [tip(value), 'Cost']} />
                      <Bar dataKey="cost" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel title="Provider Spending" subtitle={cur.code} className="lg:col-span-2">
              <div className="h-[300px]">
                {byProvider.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No provider spend recorded</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byProvider} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} (${tip(value)})`}>
                        {byProvider.map((_e: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip formatter={(value) => [tip(value), 'Cost']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
