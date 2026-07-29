import { ChevronRight } from "lucide-react";
import type { Status } from "@/lib/status";
import { WaveSparkline } from "@/components/WaveSparkline";

const STATUS_STYLES: Record<
  Status,
  { border: string; ring: string; dot: string; text: string; bg: string }
> = {
  normal: {
    border: "border-emerald-400/20",
    ring: "ring-emerald-400/30",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  warning: {
    border: "border-amber-400/30",
    ring: "ring-amber-400/40",
    dot: "bg-amber-400",
    text: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  critical: {
    border: "border-rose-500/40",
    ring: "ring-rose-500/50",
    dot: "bg-rose-500",
    text: "text-rose-400",
    bg: "bg-rose-500/10",
  },
};

export interface PatientRowData {
  id: string;
  name: string;
  monitor_type: "vent" | "iv" | "both";
  brand: string | null;
  iv_brand: string | null;
  spo2: number | null;
  resp_rate: number | null;
  tidal_volume: number | null;
  iv_remaining_pct: number | null;
  status: Status;
  pendingAckCount: number;
  inProgressCount: number;
  allResolved: boolean;
}

export function PatientRow({
  patient,
  rank,
  onOpen,
}: {
  patient: PatientRowData;
  rank: number;
  onOpen: (id: string) => void;
  history: number[];
}) {
  const s = STATUS_STYLES[patient.status];
  const hasVent =
    patient.monitor_type === "vent" || patient.monitor_type === "both";
  const hasIV =
    patient.monitor_type === "iv" || patient.monitor_type === "both";

  return (
    <button
      onClick={() => onOpen(patient.id)}
      className={`w-full text-left rounded-lg border ${s.border} bg-slate-900/60 hover:bg-slate-900 transition-colors px-4 py-3 flex items-center gap-4 ring-1 ${s.ring}`}
    >
      <div className="flex flex-col items-center w-8 shrink-0">
        <span className="text-[11px] text-slate-500">#{rank}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${s.dot} mt-1`} />
      </div>

      <div className="min-w-0 flex-1">
        <span className="font-medium text-slate-100 truncate">
          {patient.name}
        </span>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {hasVent && patient.brand && (
            <span className="text-[10px] font-medium text-violet-300 bg-violet-400/10 border border-violet-400/30 rounded-full px-1.5 py-0.5">
              {patient.brand}
            </span>
          )}
          {hasIV && patient.iv_brand && (
            <span className="text-[10px] font-medium text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-full px-1.5 py-0.5">
              {patient.iv_brand}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
          {hasVent && patient.spo2 !== null && (
            <>
              <span className="font-mono tabular-nums">
                SpO2 {patient.spo2.toFixed(0)}%
              </span>
              <span className="font-mono tabular-nums">
                RR {patient.resp_rate?.toFixed(0)}/min
              </span>
              <span className="font-mono tabular-nums">
                TV {patient.tidal_volume?.toFixed(0)}mL
              </span>
            </>
          )}
          {hasIV && patient.iv_remaining_pct !== null && (
            <span className="font-mono tabular-nums">
              IV {patient.iv_remaining_pct.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {patient.pendingAckCount > 0 && (
          <span
            className={`text-[11px] font-medium ${s.text} ${s.bg} px-2 py-0.5 rounded-full flex items-center gap-1`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`}
            />
            {patient.pendingAckCount} รอรับทราบ
          </span>
        )}
        <div className="hidden sm:block w-24 shrink-0">
  <WaveSparkline
    data={patient.history}
    color={
      patient.status === "critical" ? "#fb7185" :
      patient.status === "warning" ? "#fbbf24" : "#34d399"
    }
    height={28}
  />
</div>
        {patient.pendingAckCount === 0 && patient.inProgressCount > 0 && (
          <span className="text-[11px] font-medium text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
            {patient.inProgressCount} กำลังดำเนินการ
          </span>
        )}
        {patient.allResolved && (
          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
            แก้ไขแล้ว
          </span>
        )}
        <ChevronRight size={16} className="text-slate-600" />
      </div>
    </button>
  );
}
