import { createClient } from "@/lib/supabase/client";
import type {
  Patient,
  VitalsReading,
  IVReading,
  AlertRow,
  StaffProfile,
} from "@/lib/types";

const supabase = createClient();

// ---- อ่านข้อมูล ----

export async function fetchPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchVitalsHistory(
  patientId: string,
  limit = 30,
): Promise<VitalsReading[]> {
  const { data, error } = await supabase
    .from("vitals_readings")
    .select("*")
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse(); // เก่า → ใหม่ เหมาะกับเอาไปวาดกราฟ
}

export async function fetchIVHistory(
  patientId: string,
  limit = 30,
): Promise<IVReading[]> {
  const { data, error } = await supabase
    .from("iv_readings")
    .select("*")
    .eq("patient_id", patientId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function fetchAlerts(
  patientId: string,
  limit = 20,
): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCurrentStaff(): Promise<StaffProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---- เขียนข้อมูล ----

export async function acknowledgeAlert(alertId: number, staffId: string) {
  const { data, error } = await supabase
    .from("alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: staffId,
    })
    .eq("id", alertId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error(
      "ไม่มีสิทธิ์ acknowledge alert นี้ (เช็ค role ของบัญชีที่ login)",
    );
}

export async function resolveAlert(
  alertId: number,
  staffId: string,
  note: string,
) {
  const { data, error } = await supabase
    .from("alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: staffId,
      resolution_note: note,
    })
    .eq("id", alertId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error(
      "ไม่มีสิทธิ์ resolve alert นี้ (เช็ค role ของบัญชีที่ login)",
    );
}

export async function signOut() {
  await supabase.auth.signOut();
}

export interface AuditLogRow extends AlertRow {
  patients: { name: string } | null;
  acknowledged_by_name: string | null;
  resolved_by_name: string | null;
}

export async function fetchAuditLog(limit = 100): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*, patients(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as unknown as AuditLogRow[];

  // ดึงชื่อของทุก staff id ที่เกี่ยวข้อง (เฉพาะที่ไม่ซ้ำ ลดจำนวนครั้งที่เรียก)
  const staffIds = new Set<string>();
  rows.forEach((r) => {
    if (r.acknowledged_by) staffIds.add(r.acknowledged_by);
    if (r.resolved_by) staffIds.add(r.resolved_by);
  });

  const nameMap = new Map<string, string>();
  await Promise.all(
    [...staffIds].map(async (id) => {
      const { data: name } = await supabase.rpc("get_staff_name", {
        staff_id: id,
      });
      if (name) nameMap.set(id, name);
    }),
  );

  return rows.map((r) => ({
    ...r,
    acknowledged_by_name: r.acknowledged_by
      ? (nameMap.get(r.acknowledged_by) ?? "ไม่ทราบชื่อ")
      : null,
    resolved_by_name: r.resolved_by
      ? (nameMap.get(r.resolved_by) ?? "ไม่ทราบชื่อ")
      : null,
  }));
}

export interface ExecutiveAlertStat {
  stat_date: string;
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  resolved_count: number;
  escalated_count: number;
}

export async function fetchExecutiveStats(): Promise<ExecutiveAlertStat[]> {
  const { data, error } = await supabase
    .from("executive_alert_stats_daily")
    .select("*");
  if (error) throw error;
  return data ?? [];
}

export interface StaffDirectoryRow {
  id: string;
  full_name: string;
  role: string;
  ward_name: string | null;
  created_at: string;
}

export async function fetchStaffDirectory(): Promise<StaffDirectoryRow[]> {
  const { data, error } = await supabase
    .from("staff_directory")
    .select("*")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export interface WardOption {
  id: string;
  name: string;
}

export async function fetchWards(): Promise<WardOption[]> {
  const { data, error } = await supabase
    .from("wards")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function updateStaffRoleWard(
  staffId: string,
  role: string,
  wardId: string | null,
) {
  const { data, error } = await supabase
    .from("staff_profiles")
    .update({ role, ward_id: wardId })
    .eq("id", staffId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("ไม่มีสิทธิ์แก้ไขบัญชีนี้ (เช็ค role ของบัญชีที่ login)");
}

export interface WardRanking {
  ward_id: string;
  ward_name: string;
  total_alerts: number;
  critical_count: number;
  warning_count: number;
}

export async function fetchWardRanking(): Promise<WardRanking[]> {
  const { data, error } = await supabase
    .from("executive_ward_ranking")
    .select("*");
  if (error) throw error;
  return data ?? [];
}
export async function escalateAlert(alertId: number) {
  const { data, error } = await supabase
    .from("alerts")
    .update({ escalated: true, escalated_at: new Date().toISOString() })
    .eq("id", alertId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("ไม่มีสิทธิ์ escalate alert นี้ (เช็ค role ของบัญชีที่ login)");
}
