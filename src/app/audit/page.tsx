"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { fetchAuditLog, type AuditLogRow } from "@/lib/data";

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAuditLog(100);
        if (!cancelled) setRows(data);
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
  const patientOptions = [
    ...new Map(
      rows
        .filter((r) => r.patients)
        .map((r) => [r.patient_id, r.patients!.name]),
    ).entries(),
  ];

  const filteredRows =
    selectedPatientId === "all"
      ? rows
      : rows.filter((r) => r.patient_id === selectedPatientId);
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-2">
        <Loader2 className="animate-spin text-emerald-400" size={20} />
        <span className="text-sm text-slate-400">กำลังโหลด...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-base font-semibold">
          ประวัติการแจ้งเตือนและการแก้ไข
        </h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-4">
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 outline-none focus:border-emerald-400/50"
          >
            <option value="all">ผู้ป่วยทั้งหมด</option>
            {patientOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}
        {filteredRows.length === 0 && (
          <p className="text-sm text-slate-500">
            {selectedPatientId === "all"
              ? "ยังไม่มีข้อมูล"
              : "ไม่มีประวัติของผู้ป่วยคนนี้"}
          </p>
        )}

        <div className="space-y-2">
          {filteredRows.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-100">
                  {r.patients?.name ?? "ไม่ทราบผู้ป่วย"}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {new Date(r.created_at).toLocaleString("th-TH")}
                </span>
              </div>
              <p className="text-sm text-slate-300 mb-2">
                <span
                  className={
                    r.level === "critical" ? "text-rose-400" : "text-amber-400"
                  }
                >
                  [{r.level}]
                </span>{" "}
                {r.msg}
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Acknowledge: </span>
                  {r.acknowledged_by_name ? (
                    <span className="text-slate-300">
                      {r.acknowledged_by_name} ·{" "}
                      {new Date(r.acknowledged_at!).toLocaleString("th-TH")}
                    </span>
                  ) : (
                    <span className="text-slate-600">ยังไม่มี</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">Resolve: </span>
                  {r.resolved_by_name ? (
                    <span className="text-slate-300">
                      {r.resolved_by_name} ·{" "}
                      {new Date(r.resolved_at!).toLocaleString("th-TH")}
                    </span>
                  ) : r.resolved_at ? (
                    <span className="text-slate-300">ระบบ (auto-resolved)</span>
                  ) : (
                    <span className="text-slate-600">ยังไม่มี</span>
                  )}
                </div>
              </div>

              {r.resolution_note && (
                <p className="text-xs text-slate-400 mt-2 italic">
                  &quot;{r.resolution_note}&quot;
                </p>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
