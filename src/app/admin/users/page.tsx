"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  fetchCurrentStaff,
  fetchStaffDirectory,
  fetchWards,
  signOut,
  updateStaffRoleWard,
  type StaffDirectoryRow,
  type WardOption,
} from "@/lib/data";
import type { StaffProfile } from "@/lib/types";

const ROLES = [
  "nurse",
  "physician",
  "nurse_manager",
  "rapid_response",
  "biomed_it",
  "executive",
  "admin",
];
const WARD_REQUIRED_ROLES = ["nurse", "nurse_manager"];

export default function AdminUsersPage() {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [rows, setRows] = useState<StaffDirectoryRow[]>([]);
  const [wards, setWards] = useState<WardOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { role: string; wardId: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const currentStaff = await fetchCurrentStaff();
      setStaff(currentStaff);
      if (currentStaff?.role === "admin") {
        const [directory, wardList] = await Promise.all([
          fetchStaffDirectory(),
          fetchWards(),
        ]);
        setRows(directory);
        setWards(wardList);
        setDrafts({}); // เคลียร์ draft เก่าทิ้ง บังคับให้ค่าที่เห็นตรงกับฐานข้อมูลจริงเสมอหลัง reload
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  load();
}, []);

  function draftFor(row: StaffDirectoryRow) {
    if (drafts[row.id]) return drafts[row.id];
    const matchedWard = wards.find((w) => w.name === row.ward_name);
    return { role: row.role, wardId: matchedWard?.id ?? "" };
  }

  async function handleSave(row: StaffDirectoryRow) {
    const d = draftFor(row);

    if (!d.wardId && WARD_REQUIRED_ROLES.includes(d.role)) {
      const confirmed = window.confirm(
        `บัญชี "${row.full_name}" (${d.role}) กำลังจะถูกตั้งเป็น "ไม่ผูกหอ"\n\nบทบาทนี้ต้องมีหอถึงจะเห็นผู้ป่วยได้ ถ้าบันทึกแบบนี้ บัญชีนี้จะมองไม่เห็นผู้ป่วยเลยจนกว่าจะมาผูกหอใหม่ในภายหลัง\n\nยืนยันจะบันทึกแบบนี้ใช่ไหม?`
      );
      if (!confirmed) return;
    }

    setSavingId(row.id);
    setError(null);
    try {
      await updateStaffRoleWard(row.id, d.role, d.wardId || null);
      setSuccessId(row.id);
      setTimeout(() => setSuccessId(null), 2000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-2">
        <Loader2 className="animate-spin text-emerald-400" size={20} />
        <span className="text-sm text-slate-400">กำลังโหลด...</span>
      </div>
    );
  }

  if (staff?.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-slate-400">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น (role: admin)</p>
        <Link href="/" className="text-sm text-emerald-400 flex items-center gap-1">
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
          <h1 className="text-base font-semibold">จัดการบัญชีผู้ใช้งาน</h1>
        </div>
        <button
          onClick={() => signOut().then(() => (window.location.href = "/login"))}
          className="text-[11px] text-red-400 border border-slate-800 rounded-md px-3 py-2 hover:bg-slate-900"
        >
          ออกจากระบบ
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <p className="text-xs text-slate-500 mb-4">
          ทั้งหมด {rows.length} บัญชี — เปลี่ยนบทบาทหรือหอที่สังกัด แล้วกดบันทึกทีละบัญชี
        </p>

        <div className="space-y-2">
          {rows.map((row) => {
            const d = draftFor(row);
            const changed =
              d.role !== row.role ||
              (wards.find((w) => w.name === row.ward_name)?.id ?? "") !== d.wardId;
            return (
              <div
                key={row.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-45">
                  <p className="text-sm font-medium text-slate-100">{row.full_name}</p>
                  <p className="text-xs text-slate-500">
                    ปัจจุบัน: {row.role} · {row.ward_name ?? "ยังไม่ผูกหอ"}
                  </p>
                </div>

                <select
                  value={d.role}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [row.id]: { ...d, role: e.target.value } }))
                  }
                  className="text-sm bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-100"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <select
                  value={d.wardId}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [row.id]: { ...d, wardId: e.target.value } }))
                  }
                  className="text-sm bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-100"
                >
                  <option value="">— ไม่ผูกหอ —</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleSave(row)}
                  disabled={savingId === row.id || !changed}
                  className="flex items-center gap-1 text-xs font-medium bg-emerald-400 hover:bg-emerald-300 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 rounded-md px-3 py-1.5"
                >
                  {savingId === row.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  {successId === row.id ? "บันทึกแล้ว ✓" : "บันทึก"}
                </button>
              </div>
            );
          })}
        </div>

        {rows.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีบัญชีในระบบ</p>}
      </main>
    </div>
  );
}