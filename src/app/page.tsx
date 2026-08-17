"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PatientRow, type PatientRowData } from "@/components/PatientRow";
import { PatientDetail } from "@/components/PatientDetail";
import {
  fetchPatients,
  fetchVitalsHistory,
  fetchIVHistory,
  fetchAlerts,
  fetchCurrentStaff,
  acknowledgeAlert,
  resolveAlert,
  signOut,
  escalateAlert,
} from "@/lib/data";
import { severityScore, overallStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";
import type {
  Patient,
  VitalsReading,
  IVReading,
  AlertRow,
  StaffProfile,
} from "@/lib/types";
import { Wind, Droplet, Activity, AlertTriangle, Bell } from "lucide-react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import {  Users } from "lucide-react";

const supabase = createClient();

// ข้อมูลของผู้ป่วย 1 คน รวมทุกอย่างที่ต้องใช้ทั้งแถวในลิสต์และหน้า detail
interface PatientFull {
  patient: Patient;
  vitalsHistory: VitalsReading[];
  ivHistory: IVReading[];
  alerts: AlertRow[];
}

export default function Home() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [patients, setPatients] = useState<PatientFull[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [currentStaff, patientList] = await Promise.all([
        fetchCurrentStaff(),
        fetchPatients(),
      ]);
      setStaff(currentStaff);

      const full = await Promise.all(
        patientList.map(async (p) => ({
          patient: p,
          vitalsHistory: await fetchVitalsHistory(p.id, 30),
          ivHistory: await fetchIVHistory(p.id, 30),
          alerts: await fetchAlerts(p.id, 20),
        })),
      );
      setPatients(full);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // โหลดครั้งแรก
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  useEffect(() => {
  if (loading) return; // รอโหลดข้อมูลให้เสร็จก่อน ไม่งั้นจะ redirect เร็วเกินไปตอน staff ยังเป็น null ชั่วคราว

  if (!staff) {
    router.replace("/login");
    return;
  }
  if (staff.role === "admin") {
    router.replace("/admin/users");
  } else if (staff.role === "executive") {
    router.replace("/executive");
  }
}, [staff, loading, router]);

  // Realtime — มีอะไรเปลี่ยนก็โหลดใหม่หมด (ตามที่อธิบายไว้ด้านบน)
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vitals_readings" },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "iv_readings" },
        () => loadAll(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  async function handleAcknowledge(alertId: number) {
    if (!staff) {
      alert("ไม่พบข้อมูลผู้ใช้ที่ login อยู่");
      return;
    }

    // อัปเดตหน้าจอทันที ไม่ต้องรอ Supabase ตอบกลับ
    const now = new Date().toISOString();
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        alerts: p.alerts.map((a) =>
          a.id === alertId
            ? { ...a, acknowledged_at: now, acknowledged_by: staff.id }
            : a,
        ),
      })),
    );

    try {
      await acknowledgeAlert(alertId, staff.id);
    } catch (e) {
      alert(
        "Acknowledge ไม่สำเร็จ: " +
          (e instanceof Error ? e.message : "unknown error"),
      );
      loadAll(); // ถ้า error ให้โหลดข้อมูลจริงกลับมา ยกเลิก optimistic update ที่ผิดพลาด
    }
  }
  async function handleEscalate(alertId: number) {
  if (!staff) {
    alert("ไม่พบข้อมูลผู้ใช้ที่ login อยู่");
    return;
  }

  // อัปเดตหน้าจอทันที ไม่ต้องรอ Supabase ตอบกลับ
  const now = new Date().toISOString();
  setPatients((prev) =>
    prev.map((p) => ({
      ...p,
      alerts: p.alerts.map((a) =>
        a.id === alertId
          ? { ...a, escalated: true, escalated_at: now }
          : a,
      ),
    })),
  );

  try {
    await escalateAlert(alertId);
  } catch (e) {
    alert(
      "ส่งต่อทีมฉุกเฉินไม่สำเร็จ: " +
        (e instanceof Error ? e.message : "unknown error"),
    );
    loadAll(); // ถ้า error ให้โหลดข้อมูลจริงกลับมา ยกเลิก optimistic update ที่ผิดพลาด
  }
}

  async function handleResolve(alertId: number, note: string) {
    if (!staff) {
      alert("ไม่พบข้อมูลผู้ใช้ที่ login อยู่");
      return;
    }

    const now = new Date().toISOString();
    setPatients((prev) =>
      prev.map((p) => ({
        ...p,
        alerts: p.alerts.map((a) =>
          a.id === alertId
            ? {
                ...a,
                resolved_at: now,
                resolved_by: staff.id,
                resolution_note: note,
              }
            : a,
        ),
      })),
    );

    try {
      await resolveAlert(alertId, staff.id, note);
    } catch (e) {
      alert(
        "Resolve ไม่สำเร็จ: " +
          (e instanceof Error ? e.message : "unknown error"),
      );
      loadAll();
    }
  }

  // เรียงตาม severity: คะแนนสูงสุดอยู่บนสุด
  const ranked = [...patients].sort(
    (a, b) => severityScore(b.alerts) - severityScore(a.alerts),
  );

  const selected = patients.find((p) => p.patient.id === selectedId) ?? null;
  const counts = { normal: 0, warning: 0, critical: 0 };
  patients.forEach((p) => {
    counts[overallStatus(p.alerts)]++;
  });

  const ventBrands = [
    ...new Set(
      patients
        .filter(
          (p) =>
            p.patient.monitor_type === "vent" ||
            p.patient.monitor_type === "both",
        )
        .map((p) => p.patient.brand)
        .filter((b): b is string => !!b),
    ),
  ];
  const ivBrands = [
    ...new Set(
      patients
        .filter(
          (p) =>
            p.patient.monitor_type === "iv" ||
            p.patient.monitor_type === "both",
        )
        .map((p) => p.patient.iv_brand)
        .filter((b): b is string => !!b),
    ),
  ];

  const criticalPatients = ranked.filter(
    (p) => overallStatus(p.alerts) === "critical",
  );

  if (loading) {
    return <main style={{ padding: 40 }}>กำลังโหลด...</main>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-950/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
            <Wind size={18} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              MultiWatch
            </h1>
            <p className="text-[11px] text-slate-500">
              Ventilator + IV Fluid Monitoring · live · Supabase Realtime
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-[11px] text-slate-400 font-mono">
            {patients.length} เตียง
          </span>
          {staff && (
            <span className="hidden md:inline text-[11px] text-slate-400">
              {staff.full_name}{" "}
              <span className="text-slate-600">({staff.role})</span>
            </span>
          )}
          <button className="p-2 rounded-md border border-slate-800 hover:bg-slate-900 text-yellow-200">
            <Bell size={16} />
          </button>
          <Link
            href="/audit"
            className="p-2 rounded-md border border-slate-800 hover:bg-slate-900 text-white"
            title="ประวัติการแจ้งเตือน"
          >
            <ClipboardList size={16} />
          </Link>
          {staff?.role === "admin" && (
            <Link
              href="/admin/users"
              className="p-2 rounded-md border border-slate-800 hover:bg-slate-900 text-white"
              title="จัดการบัญชีผู้ใช้งาน"
            >
              <Users size={16} />
            </Link>
          )}
          <button
            onClick={() =>
              signOut().then(() => (window.location.href = "/login"))
            }
            className="text-[11px] text-red-300 border border-slate-800 rounded-md px-3 py-2 hover:bg-slate-900"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        {criticalPatients.length > 0 && (
          <div className="mb-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={18} className="text-rose-400 shrink-0" />
            <p className="text-sm text-rose-200">
              <span className="font-medium">
                {criticalPatients.length} ผู้ป่วยอยู่ในภาวะวิกฤต
              </span>
              {" — "}
              {criticalPatients.map((p) => p.patient.name).join(", ")}{" "}
              ต้องการการดูแลด่วน
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {(["normal", "warning", "critical"] as const).map((k) => {
            const style = {
              normal: "border-emerald-400/20 bg-emerald-400/10",
              warning: "border-amber-400/30 bg-amber-400/10",
              critical: "border-rose-500/40 bg-rose-500/10",
            }[k];
            const dot = {
              normal: "bg-emerald-400",
              warning: "bg-amber-400",
              critical: "bg-rose-500",
            }[k];
            const label = {
              normal: "ปกติ",
              warning: "เฝ้าระวัง",
              critical: "วิกฤต",
            }[k];
            return (
              <div key={k} className={`rounded-lg border ${style} px-4 py-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
                <span className="text-2xl font-mono font-semibold">
                  {counts[k]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mb-6 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Wind size={11} /> เครื่องช่วยหายใจ:
            </span>
            {ventBrands.map((b) => (
              <span
                key={b}
                className="text-[11px] font-medium text-violet-300 bg-violet-400/10 border border-violet-400/30 rounded-full px-2 py-0.5"
              >
                {b}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Droplet size={11} /> IV Pump:
            </span>
            {ivBrands.map((b) => (
              <span
                key={b}
                className="text-[11px] font-medium text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-full px-2 py-0.5"
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Activity size={15} className="text-slate-500" />
            รายการผู้ป่วยตามลำดับความสำคัญ
          </h2>
        </div>

        {ranked.length === 0 && (
          <p className="text-sm text-slate-500">ไม่มีผู้ป่วยที่มองเห็นได้</p>
        )}

        <div className="space-y-2">
          {ranked.map((p, i) => {
            const latestVitals = p.vitalsHistory[p.vitalsHistory.length - 1];
            const latestIV = p.ivHistory[p.ivHistory.length - 1];
            const activeAlerts = p.alerts.filter((a) => !a.resolved_at);
            const hasVent =
              p.patient.monitor_type === "vent" ||
              p.patient.monitor_type === "both";

            const rowData: PatientRowData = {
              id: p.patient.id,
              name: p.patient.name,
              monitor_type: p.patient.monitor_type,
              brand: p.patient.brand,
              iv_brand: p.patient.iv_brand,
              spo2: latestVitals?.spo2 ?? null,
              resp_rate: latestVitals?.resp_rate ?? null,
              tidal_volume: latestVitals?.tidal_volume ?? null,
              iv_remaining_pct: latestIV?.remaining_pct ?? null,
              status: overallStatus(p.alerts),
              pendingAckCount: activeAlerts.filter((a) => !a.acknowledged_at)
                .length,
              inProgressCount: activeAlerts.filter((a) => a.acknowledged_at)
                .length,
              allResolved: p.alerts.length > 0 && activeAlerts.length === 0,
              history: hasVent
                ? p.vitalsHistory.map((v) => v.spo2)
                : p.ivHistory.map((r) => r.remaining_pct),
            };

            return (
              <PatientRow
                key={p.patient.id}
                patient={rowData}
                rank={i + 1}
                onOpen={setSelectedId}
              />
            );
          })}
        </div>
      </main>

      {selected && (
        <PatientDetail
          patient={{
            id: selected.patient.id,
            name: selected.patient.name,
            mode: selected.patient.mode,
            brand: selected.patient.brand,
            iv_brand: selected.patient.iv_brand,
            iv_fluid: selected.patient.iv_fluid,
            monitor_type: selected.patient.monitor_type,
          }}
          vitals={
            selected.vitalsHistory.length > 0
              ? (selected.vitalsHistory[
                  selected.vitalsHistory.length - 1
                ] as unknown as Record<string, number>)
              : null
          }
          vitalsHistory={{
            tidal_volume: selected.vitalsHistory.map((v) => v.tidal_volume),
            resp_rate: selected.vitalsHistory.map((v) => v.resp_rate),
            spo2: selected.vitalsHistory.map((v) => v.spo2),
            fio2: selected.vitalsHistory.map((v) => v.fio2),
            peak_pressure: selected.vitalsHistory.map((v) => v.peak_pressure),
            leak: selected.vitalsHistory.map((v) => v.leak),
          }}
          iv={
            selected.ivHistory.length > 0
              ? {
                  remaining_pct:
                    selected.ivHistory[selected.ivHistory.length - 1]
                      .remaining_pct,
                  rate_ml_hr:
                    selected.ivHistory[selected.ivHistory.length - 1]
                      .rate_ml_hr,
                  status:
                    selected.ivHistory[selected.ivHistory.length - 1].status,
                }
              : null
          }
          ivHistory={selected.ivHistory.map((r) => r.remaining_pct)}
          alerts={selected.alerts}
          onClose={() => setSelectedId(null)}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
          onEscalate={handleEscalate}
        />
      )}
    </div>
  );
}
