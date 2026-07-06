import React, { useEffect, useState } from 'react';
import { IndianRupee, Cpu, Database, Activity } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { api } from '../../lib/api/client';

interface CostData {
  llmCostInr: number;
  embeddingCostInr: number;
  totalCostInr: number;
  llmCostUsd: number;
  embeddingCostUsd: number;
  totalCostUsd: number;
}

interface CostAnalyticsResponse {
  currency: string;
  conversionRate: number;
  costs: CostData;
}

interface CostAnalyticsWidgetProps {
  isAdminMode?: boolean;
}

export const CostAnalyticsWidget: React.FC<CostAnalyticsWidgetProps> = ({ isAdminMode = false }) => {
  const { user } = useAuth();
  const [data, setData] = useState<CostAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        const url = isAdminMode 
          ? '/analytics/costs' 
          : `/analytics/costs?userId=${user?.uid}`;
        const res = await api.get(url);
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch cost analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    if (user) {
      fetchCosts();
      // Poll every 5s for live updates
      const interval = setInterval(fetchCosts, 5000);
      return () => clearInterval(interval);
    }
  }, [user, isAdminMode]);

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex items-center justify-center h-48 animate-pulse">
        <div className="text-white/50 flex items-center gap-2">
          <Activity className="w-5 h-5 animate-spin" />
          <span>Calculating Metrics...</span>
        </div>
      </div>
    );
  }

  const costs = data?.costs || { llmCostInr: 0, embeddingCostInr: 0, totalCostInr: 0 };

  return (
    <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group">
      
      {/* Background aesthetic glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-all duration-500" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-all duration-500" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/5">
            <IndianRupee className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              {isAdminMode ? 'Platform Cost Analytics' : 'Your Usage Cost'}
            </h3>
            <p className="text-sm text-white/50">
              Live updates • 1 USD = ₹{data?.conversionRate || '83.50'}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-4xl font-bold text-white flex items-baseline gap-1">
            <span className="text-purple-400 text-2xl">₹</span>
            {costs.totalCostInr.toFixed(4)}
          </div>
          <div className="text-sm text-emerald-400 mt-1 flex items-center gap-1">
            <Activity className="w-4 h-4" />
            <span>Active Usage</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-black/20 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-white/70 uppercase tracking-wider">LLM Engine</span>
            </div>
            <div className="text-lg font-semibold text-white">
              ₹{costs.llmCostInr.toFixed(4)}
            </div>
          </div>
          
          <div className="bg-black/20 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-white/70 uppercase tracking-wider">Vector DB</span>
            </div>
            <div className="text-lg font-semibold text-white">
              ₹{costs.embeddingCostInr.toFixed(4)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
