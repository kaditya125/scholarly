import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

/** Tiny inline trend chart for metric cards. Renders nothing for empty data. */
export function Sparkline({ data, color = '#6366f1', height = 40 }: SparklineProps) {
  if (!data || data.length === 0) return null;
  const chartData = data.map((v, i) => ({ i, v }));
  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
