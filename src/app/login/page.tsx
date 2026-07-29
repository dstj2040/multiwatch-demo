"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wind, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("สมัครสำเร็จ — บัญชีนี้เป็น role 'nurse' โดยยังไม่ผูก ward ต้องแจ้งผู้ดูแลระบบก่อนใช้งานได้");
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-lg bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
            <Wind size={18} className="text-emerald-400" />
          </div>
          <span className="text-lg font-semibold tracking-tight">MultiWatch</span>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex mb-5 rounded-md border border-slate-800 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
              className={`flex-1 py-2 ${mode === "signin" ? "bg-emerald-400/10 text-emerald-400" : "text-slate-400"}`}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
              className={`flex-1 py-2 ${mode === "signup" ? "bg-emerald-400/10 text-emerald-400" : "text-slate-400"}`}
            >
              สมัครใหม่
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">อีเมล</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 outline-none focus:border-emerald-400/50"
                placeholder="nurse@example.com"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">รหัสผ่าน</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 outline-none focus:border-emerald-400/50"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}
            {info && <p className="text-xs text-emerald-400">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-emerald-400 hover:bg-emerald-300 disabled:bg-slate-700 text-slate-950 rounded-md py-2 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}