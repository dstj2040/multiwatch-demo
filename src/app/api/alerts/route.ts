import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ทุกการเขียนข้อมูลจากหน้าเว็บผ่านจุดนี้จุดเดียว
// เบราว์เซอร์ไม่มีสิทธิ์เขียน DB เอง (RLS อ่านอย่างเดียว) — server ทำแทนในนาม "พยาบาล demo"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE = 500;

// rate limit แบบง่าย ต่อ IP ต่อ instance (best-effort บน serverless แต่พอกันกดรัวๆ)
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // กันหน่วยความจำบวม
  return recent.length > MAX_PER_WINDOW;
}

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

type Action = "acknowledge" | "resolve" | "escalate";

export async function POST(request: NextRequest) {
  // รับเฉพาะ request จากหน้าเว็บตัวเอง
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      /* origin ผิดรูปแบบ */
    }
    if (!host || originHost !== host) return fail(403, "forbidden origin");
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) return fail(429, "กดถี่เกินไป ลองใหม่อีกครั้งในอีกสักครู่");

  const demoStaffId = process.env.DEMO_STAFF_ID;
  if (!demoStaffId || !UUID_RE.test(demoStaffId)) {
    return fail(500, "server ยังไม่ได้ตั้งค่า DEMO_STAFF_ID");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid JSON");
  }
  const { action, alertId, note } = (body ?? {}) as {
    action?: unknown;
    alertId?: unknown;
    note?: unknown;
  };

  if (action !== "acknowledge" && action !== "resolve" && action !== "escalate") {
    return fail(400, "invalid action");
  }
  if (typeof alertId !== "number" || !Number.isSafeInteger(alertId) || alertId <= 0) {
    return fail(400, "invalid alertId");
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const a = action as Action;

  // ใส่เงื่อนไขสถานะไว้ใน WHERE เลย — ทำงานแบบ atomic ไม่ต้องอ่านก่อนเขียน
  let query;
  if (a === "acknowledge") {
    query = supabase
      .from("alerts")
      .update({ acknowledged_at: now, acknowledged_by: demoStaffId })
      .eq("id", alertId)
      .is("acknowledged_at", null)
      .is("resolved_at", null);
  } else if (a === "resolve") {
    const text = typeof note === "string" ? note.trim() : "";
    if (!text) return fail(400, "ต้องระบุบันทึกการแก้ไข");
    if (text.length > MAX_NOTE) return fail(400, `บันทึกยาวเกิน ${MAX_NOTE} ตัวอักษร`);
    query = supabase
      .from("alerts")
      .update({ resolved_at: now, resolved_by: demoStaffId, resolution_note: text })
      .eq("id", alertId)
      .is("resolved_at", null);
  } else {
    query = supabase
      .from("alerts")
      .update({ escalated: true, escalated_at: now })
      .eq("id", alertId)
      .eq("escalated", false)
      .is("resolved_at", null);
  }

  const { data, error } = await query.select("id");
  if (error) {
    console.error(`[api/alerts] ${a} #${alertId} failed:`, error.message);
    return fail(500, "บันทึกไม่สำเร็จ");
  }
  if (!data || data.length === 0) {
    return fail(409, "alert นี้ถูกดำเนินการหรือปิดไปแล้ว");
  }
  return Response.json({ ok: true });
}
