"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  fetchCurrentStaff,
  fetchExecutiveStats,
  fetchWardRanking,
  signOut,
  type ExecutiveAlertStat,
  type WardRanking,
} from "@/lib/data";
import type { StaffProfile } from "@/lib/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
interface MonthlyStat {
  month: string;
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  resolved_count: number;
  escalated_count: number;
}

function generateMockTrend() {
  const points = [];
  let value = 3;
  for (let i = 23; i >= 0; i--) {
    value = Math.max(0, value + Math.round((Math.random() - 0.5) * 3));
    const hour = new Date();
    hour.setHours(hour.getHours() - i, 0, 0, 0);
    points.push({
      label: hour.toLocaleTimeString("th-TH", { hour: "2-digit" }),
      value,
    });
  }
  return points;
}
function toMonthly(daily: ExecutiveAlertStat[]): MonthlyStat[] {
  const map = new Map<string, MonthlyStat>();
  for (const row of daily) {
    const month = row.stat_date.slice(0, 7);
    const existing = map.get(month) ?? {
      month,
      total_alerts: 0,
      critical_count: 0,
      warning_count: 0,
      resolved_count: 0,
      escalated_count: 0,
    };
    existing.total_alerts += row.total_alerts;
    existing.critical_count += row.critical_count;
    existing.warning_count += row.warning_count;
    existing.resolved_count += row.resolved_count;
    existing.escalated_count += row.escalated_count;
    map.set(month, existing);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export default function ExecutivePage() {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [daily, setDaily] = useState<ExecutiveAlertStat[]>([]);
  const [wardRanking, setWardRanking] = useState<WardRanking[]>([]);
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monthly = toMonthly(daily);
  const rows = view === "daily" ? daily : monthly;
  const [mockTrend] = useState(() => generateMockTrend());
  const supabase = createClient();

  useEffect(() => {
    if (staff?.role !== "executive") return;

    const channel = supabase
      .channel("executive-stats-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        async () => {
          console.log("realtime event received!"); // ← เพิ่มบรรทัดนี้ชั่วคราว
          try {
            const [dailyData, wardData] = await Promise.all([
              fetchExecutiveStats(),
              fetchWardRanking(),
            ]);
            setDaily(dailyData);
            setWardRanking(wardData);
          } catch (e) {
            console.error("realtime refresh failed:", e);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const currentStaff = await fetchCurrentStaff();
        if (cancelled) return;
        setStaff(currentStaff);

        if (currentStaff?.role === "executive") {
          const [dailyData, wardData] = await Promise.all([
            fetchExecutiveStats(),
            fetchWardRanking(),
          ]);
          if (cancelled) return;
          setDaily(dailyData);
          setWardRanking(wardData);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-2">
        <Loader2 className="animate-spin text-emerald-400" size={20} />
        <span className="text-sm text-slate-400">กำลังโหลด...</span>
      </div>
    );
  }

  if (staff?.role !== "executive") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-slate-400">
          หน้านี้สำหรับผู้บริหารเท่านั้น (role: executive)
        </p>
        <Link
          href="/"
          className="text-sm text-emerald-400 flex items-center gap-1"
        >
          <ArrowLeft size={14} /> กลับหน้าแรก
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-base font-semibold">
            สถิติภาพรวมการแจ้งเตือน (ผู้บริหาร)
          </h1>
        </div>
        <button
          onClick={() =>
            signOut().then(() => (window.location.href = "/login"))
          }
          className="text-[11px] text-red-400 border border-slate-800 rounded-md px-3 py-2 hover:bg-slate-900"
        >
          ออกจากระบบ
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}
        <h2 className="text-sm font-medium text-slate-300 mb-2">
          แนวโน้มการแจ้งเตือนรายชั่วโมง (ตัวอย่าง)
        </h2>
        <div className="rounded-lg border border-amber-500/30 bg-slate-900/60 p-4 mb-2">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={mockTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="label" stroke="#64748B" fontSize={10} />
              <YAxis stroke="#64748B" fontSize={10} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#0F172A",
                  border: "1px solid #334155",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#38BDF8"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-amber-400/80 mb-6">
          ⚠ ข้อมูลตัวอย่างสำหรับสาธิตรูปแบบการแสดงผลเท่านั้น
          ยังไม่เชื่อมต่อกับฐานข้อมูลจริง —
          ตัวเลขสุ่มขึ้นใหม่ทุกครั้งที่โหลดหน้า
        </p>
        <h2 className="text-sm font-medium text-slate-300 mb-2">
          อันดับหอตามจำนวนการแจ้งเตือนรวม
        </h2>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 mb-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pl-4 pr-4">อันดับ</th>
                <th className="py-2 pr-4">หอผู้ป่วย</th>
                <th className="py-2 pr-4">ทั้งหมด</th>
                <th className="py-2 pr-4 text-rose-400">วิกฤต</th>
                <th className="py-2 pr-4 text-amber-400">เฝ้าระวัง</th>
              </tr>
            </thead>

            <tbody>
              {wardRanking.map((w, i) => (
                <tr key={w.ward_id} className="border-b border-slate-900">
                  <td className="py-2 pl-4 pr-4 font-mono text-slate-500">
                    #{i + 1}
                  </td>
                  <td className="py-2 pr-4">{w.ward_name}</td>
                  <td className="py-2 pr-4 font-mono">{w.total_alerts}</td>
                  <td className="py-2 pr-4 font-mono text-rose-400">
                    {w.critical_count}
                  </td>
                  <td className="py-2 pr-4 font-mono text-amber-400">
                    {w.warning_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {wardRanking.length === 0 && (
            <p className="text-sm text-slate-500 p-4">ยังไม่มีข้อมูล</p>
          )}
        </div>

        <div className="flex mb-5 rounded-md border border-slate-800 overflow-hidden text-sm w-fit">
          <button
            onClick={() => setView("daily")}
            className={`px-4 py-2 ${view === "daily" ? "bg-emerald-400/10 text-emerald-400" : "text-slate-400"}`}
          >
            รายวัน
          </button>
          <button
            onClick={() => setView("monthly")}
            className={`px-4 py-2 ${view === "monthly" ? "bg-emerald-400/10 text-emerald-400" : "text-slate-400"}`}
          >
            รายเดือน
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4">
                  {view === "daily" ? "วันที่" : "เดือน"}
                </th>
                <th className="py-2 pr-4">Alert ทั้งหมด</th>
                <th className="py-2 pr-4 text-rose-400">Critical</th>
                <th className="py-2 pr-4 text-amber-400">Warning</th>
                <th className="py-2 pr-4">แก้ไขแล้ว</th>
                <th className="py-2 pr-4">Escalate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={"stat_date" in r ? r.stat_date : r.month}
                  className="border-b border-slate-900"
                >
                  <td className="py-2 pr-4 font-mono">
                    {"stat_date" in r ? r.stat_date : r.month}
                  </td>
                  <td className="py-2 pr-4 font-mono">{r.total_alerts}</td>
                  <td className="py-2 pr-4 font-mono text-rose-400">
                    {r.critical_count}
                  </td>
                  <td className="py-2 pr-4 font-mono text-amber-400">
                    {r.warning_count}
                  </td>
                  <td className="py-2 pr-4 font-mono">{r.resolved_count}</td>
                  <td className="py-2 pr-4 font-mono">{r.escalated_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-slate-500 mt-4">ยังไม่มีข้อมูล</p>
        )}
      </main>
    </div>
  );
}
