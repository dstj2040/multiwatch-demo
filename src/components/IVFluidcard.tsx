import type { Status } from "@/lib/status";
import { ivStatus } from "@/lib/status";

const STATUS_BORDER: Record<Status, string> = {
  normal: "border-emerald-400/20",
  warning: "border-amber-400/30",
  critical: "border-rose-500/40",
};
const STATUS_BAR: Record<Status, string> = {
  normal: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-rose-500",
};

export function IVFluidCard({
  fluidName,
  brand,
  remainingPct,
  rateMlHr,
  pumpStatus,
}: {
  fluidName: string;
  brand: string;
  remainingPct: number;
  rateMlHr: number;
  pumpStatus: "running" | "occluded";
}) {
  const status = ivStatus(remainingPct, pumpStatus);

  return (
    <div className={`rounded-lg border ${STATUS_BORDER[status]} bg-slate-900/60 p-3`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">IV Fluid — {fluidName}</span>
        <span className="text-[10px] font-medium text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-full px-1.5 py-0.5">
          {brand}
        </span>
      </div>

      <div className="flex items-baseline gap-1 mb-1.5">
        <span className="font-mono text-xl text-slate-100 tabular-nums">{remainingPct.toFixed(0)}</span>
        <span className="text-[11px] text-slate-500">% เหลือ</span>
        {pumpStatus === "occluded" && (
          <span className="ml-2 text-[10px] font-medium text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-full">Occluded</span>
        )}
      </div>

      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
        <div className={`h-full rounded-full ${STATUS_BAR[status]}`} style={{ width: `${remainingPct}%` }} />
      </div>

      <div className="text-[11px] text-slate-400 font-mono tabular-nums">Rate {rateMlHr} mL/hr</div>
    </div>
  );
}