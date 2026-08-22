"use client";

import { useState } from "react";
import { X, Wind, Droplet, AlertTriangle } from "lucide-react";
import { VitalTile } from "@/components/VitalTile";
import { IVFluidCard } from "@/components/IVFluidcard";
import { ventParamStatus } from "@/lib/status";
import type { AlertRow } from "@/lib/types";

const STATUS_STYLES = {
  normal: {
    border: "border-emerald-400/20",
    bg: "bg-emerald-400/10",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  warning: {
    border: "border-amber-400/30",
    bg: "bg-amber-400/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  critical: {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    dot: "bg-rose-500",
  },
};

const VITAL_LABELS: Record<string, { label: string; unit: string }> = {
  tidal_volume: { label: "Tidal Volume", unit: "mL" },
  resp_rate: { label: "Resp Rate", unit: "/min" },
  spo2: { label: "SpO2", unit: "%" },
  fio2: { label: "FiO2", unit: "%" },
  peak_pressure: { label: "Peak Pressure", unit: "cmH2O" },
  leak: { label: "Leak", unit: "%" },
};

const RESOLUTION_PRESETS = [
  "ปรับท่านอนแล้ว",
  "แจ้งแพทย์แล้ว",
  "เปลี่ยนขวด/ถุงสารน้ำแล้ว",
  "False alarm",
  "เปลี่ยนวงจรแล้ว",
];

export interface PatientDetailProps {
  patient: {
    id: string;
    name: string;
    mode: string | null;
    brand: string | null;
    iv_brand: string | null;
    iv_fluid: string | null;
    monitor_type: "vent" | "iv" | "both";
  };
  vitals: Record<string, number> | null;
  vitalsHistory: Record<string, number[]>;
  iv: {
    remaining_pct: number;
    rate_ml_hr: number;
    status: "running" | "occluded";
  } | null;
  ivHistory: number[];
  alerts: AlertRow[];
  onClose: () => void;
  onAcknowledge: (alertId: number) => void;
  onResolve: (alertId: number, note: string) => void;
  onEscalate: (alertId: number) => void;   // ← ย้ายมาอยู่ตรงนี้แทน
}

export function PatientDetail({
  patient,
  vitals,
  vitalsHistory,
  iv,
  ivHistory,
  alerts,
  onClose,
  onAcknowledge,
  onResolve,
  onEscalate,
}: PatientDetailProps) {
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const hasVent =
    patient.monitor_type === "vent" || patient.monitor_type === "both";
  const hasIV =
    patient.monitor_type === "iv" || patient.monitor_type === "both";
  const hasCritical = alerts.some(
    (a) => a.level === "critical" && !a.resolved_at,
  );
  const headerStatus = hasCritical
    ? STATUS_STYLES.critical
    : alerts.some((a) => !a.resolved_at)
      ? STATUS_STYLES.warning
      : STATUS_STYLES.normal;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 overflow-y-auto">
        <div
          className={`px-5 py-4 border-b border-slate-800 flex items-center justify-between ${headerStatus.bg}`}
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${headerStatus.dot}`}
              />
              <h2 className="text-lg font-semibold text-slate-100">
                {patient.name}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasVent && patient.mode ? `โหมด ${patient.mode}` : ""}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              {hasVent && patient.brand && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-300 bg-violet-400/10 border border-violet-400/30 rounded-full px-2 py-0.5">
                  <Wind size={10} /> {patient.brand}
                </span>
              )}
              {hasIV && patient.iv_brand && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-full px-2 py-0.5">
                  <Droplet size={10} /> {patient.iv_brand}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              การแจ้งเตือนล่าสุด
            </h3>
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500 italic">ไม่มีการแจ้งเตือน</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((a) => {
                  const as = STATUS_STYLES[a.level];
                  const isResolved = !!a.resolved_at;
                  const isAck = !!a.acknowledged_at || isResolved; // ถือว่า "acknowledge แล้ว" ไปเลยถ้า resolved แล้ว ไม่ว่าจะเคยกดจริงหรือไม่
                  const draft = noteDrafts[a.id] || "";

                  return (
                    <div
                      key={a.id}
                      className={`rounded-md border ${as.border} ${as.bg} px-3 py-2`}
                    >
                      <div className="flex items-start gap-2">
                        {a.category === "iv" ? (
                          <Droplet
                            size={15}
                            className={`${as.text} mt-0.5 shrink-0`}
                          />
                        ) : (
                          <AlertTriangle
                            size={15}
                            className={`${as.text} mt-0.5 shrink-0`}
                          />
                        )}
                        <span className="text-sm text-slate-200 flex-1">
                          {a.msg}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pl-6">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-500">
                            แจ้งเตือนถึง:
                          </span>
                          {a.recipients.map((r) => (
                            <span
                              key={r}
                              className="text-[10px] font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-1.5 py-0.5"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!a.escalated && !isResolved && (
                            <button
                              onClick={() => onEscalate(a.id)}
                              title="ส่งต่อการแจ้งเตือนไปยังผู้รับผิดชอบในระดับถัดไป"
                              className="text-[10px] font-medium text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-full px-2 py-1"
                            >
                              ส่งต่อเคส
                            </button>
                          )}
                          {!isAck && (
                            <button
                              onClick={() => onAcknowledge(a.id)}
                              className="text-[10px] font-medium text-slate-100 bg-slate-700 hover:bg-slate-600 rounded-full px-2 py-1 shrink-0"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>

                      {!isAck && !a.escalated && (
                        <p className="text-[10px] text-slate-500 pl-6 mt-1">
                          หากไม่ acknowledge ภายใน {a.escalate_after_min} นาที
                          ระบบจะ escalate ไปยัง{a.escalate_to}
                        </p>
                      )}

                      {a.escalated && !isResolved && (
                        <p className="text-[10px] text-amber-400 pl-6 mt-1">
                          ⚠ ส่งต่อการแจ้งเตือนไปยังผู้รับผิดชอบในระดับถัดไปแล้ว
                        </p>
                      )}
                      {!isAck && (
                        <p className="text-[10px] text-slate-500 pl-6 mt-1">
                          หากไม่ acknowledge ภายใน {a.escalate_after_min} นาที
                          ระบบจะ escalate ไปยัง{a.escalate_to}
                        </p>
                      )}

                      {isAck && !isResolved && (
                        <div className="pl-6 mt-2 space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {RESOLUTION_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                onClick={() =>
                                  setNoteDrafts((d) => ({
                                    ...d,
                                    [a.id]: preset,
                                  }))
                                }
                                className={`text-[10px] rounded-full px-2 py-0.5 border ${draft === preset ? "bg-cyan-400/20 border-cyan-400/40 text-cyan-200" : "bg-slate-800 border-slate-700 text-slate-400"}`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={draft}
                              onChange={(e) =>
                                setNoteDrafts((d) => ({
                                  ...d,
                                  [a.id]: e.target.value,
                                }))
                              }
                              placeholder="บันทึกสิ่งที่ทำ..."
                              className="flex-1 text-[11px] bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-200"
                            />
                            <button
                              onClick={() =>
                                draft.trim() && onResolve(a.id, draft.trim())
                              }
                              disabled={!draft.trim()}
                              className="text-[10px] font-medium text-slate-950 bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 rounded-full px-2.5 py-1 shrink-0"
                            >
                              บันทึกว่าแก้ไขแล้ว
                            </button>
                          </div>
                        </div>
                      )}

                      {isResolved && (
                        <div className="pl-6 mt-2">
                          <div className="text-[10px] font-medium text-emerald-400">
                            แก้ไขแล้ว ✓
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            &quot;{a.resolution_note}&quot;
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {hasVent && vitals && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                เครื่องช่วยหายใจ
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                {Object.entries(VITAL_LABELS).map(([key, meta]) => (
                  <VitalTile
                    key={key}
                    label={meta.label}
                    value={vitals[key] ?? 0}
                    unit={meta.unit}
                    history={vitalsHistory[key] ?? []}
                    status={ventParamStatus(key, vitals[key] ?? 0)}
                  />
                ))}
              </div>
            </div>
          )}

          {hasIV && iv && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                สารน้ำ (IV Pump)
              </h3>
              <IVFluidCard
                fluidName={patient.iv_fluid ?? ""}
                brand={patient.iv_brand ?? ""}
                remainingPct={iv.remaining_pct}
                rateMlHr={iv.rate_ml_hr}
                pumpStatus={iv.status}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
