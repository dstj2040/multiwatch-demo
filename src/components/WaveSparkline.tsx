import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export function WaveSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={true} />
      </LineChart>
    </ResponsiveContainer>
  );
}