import { createClient } from "@/lib/supabase/client";
import type { Patient, VitalsReading, IVReading, AlertRow } from "@/lib/types";

const supabase = createClient();

// ---- อ่านข้อมูล (anon key, RLS อ่านอย่างเดียว) ----

export interface DashboardPatient {
  patient: Patient;
  vitalsHistory: VitalsReading[]; // เก่า → ใหม่ เหมาะกับเอาไปวาดกราฟ
  ivHistory: IVReading[];
  alerts: AlertRow[]; // ใหม่ → เก่า
}

// ทั้งแดชบอร์ดใน request เดียว (RPC get_dashboard ใน migration)
export async function fetchDashboard(
  points = 30,
  alertLimit = 20,
): Promise<DashboardPatient[]> {
  const { data, error } = await supabase.rpc("get_dashboard", {
    p_points: points,
    p_alerts: alertLimit,
  });
  if (error) throw error;
  const rows = (data ?? []) as {
    patient: Patient;
    vitals: VitalsReading[];
    iv: IVReading[];
    alerts: AlertRow[];
  }[];
  return rows.map((r) => ({
    patient: r.patient,
    vitalsHistory: r.vitals,
    ivHistory: r.iv,
    alerts: r.alerts,
  }));
}

export interface AuditLogRow {
  id: number;
  patient_id: string;
  patients: { name: string } | null;
  level: "warning" | "critical";
  param: string;
  category: "vent" | "iv";
  msg: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution_note: string | null;
  escalated: boolean;
  escalated_at: string | null;
}

export async function fetchAuditLog(limit = 100): Promise<AuditLogRow[]> {
  const { data, error } = await supabase.rpc("get_audit_log", { p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as (Omit<AuditLogRow, "patients"> & {
    patient_name: string | null;
  })[];
  return rows.map(({ patient_name, ...r }) => ({
    ...r,
    patients: patient_name ? { name: patient_name } : null,
    acknowledged_by_name: r.acknowledged_at
      ? (r.acknowledged_by_name ?? "ไม่ทราบชื่อ")
      : null,
  }));
}

// ---- เขียนข้อมูล: ผ่าน /api/alerts เท่านั้น ----

async function alertAction(body: {
  action: "acknowledge" | "resolve" | "escalate";
  alertId: number;
  note?: string;
}) {
  const res = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `HTTP ${res.status}`);
  }
}

export function acknowledgeAlert(alertId: number) {
  return alertAction({ action: "acknowledge", alertId });
}

export function resolveAlert(alertId: number, note: string) {
  return alertAction({ action: "resolve", alertId, note });
}

export function escalateAlert(alertId: number) {
  return alertAction({ action: "escalate", alertId });
}
