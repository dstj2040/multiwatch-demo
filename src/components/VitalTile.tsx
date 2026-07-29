import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { Status } from "@/lib/status";

const STATUS_COLOR: Record<Status, string> = {
  normal: "#34d399",
  warning: "#fbbf24",
  critical: "#fb7185",
};

const STATUS_BORDER: Record<Status, string> = {
  normal: "border-emerald-400/20",
  warning: "border-amber-400/30",
  critical: "border-rose-500/40",
};

export function VitalTile({
  label,
  value,
  unit,
  history,
  status,
}: {
  label: string;
  value: number;
  unit: string;
  history: number[];
  status: Status;
}) {
  const points = history.map((v, i) => ({ i, v }));

  return (
    <div className={`rounded-lg border ${STATUS_BORDER[status]} bg-slate-900/60 p-3`}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-mono text-xl text-slate-100 tabular-nums">{value.toFixed(0)}</span>
        <span className="text-[11px] text-slate-500">{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
          <Line type="monotone" dataKey="v" stroke={STATUS_COLOR[status]} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}