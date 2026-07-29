import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TICK_MS = 1200;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function randomWalk(prev, spread, drift = 0) {
  return prev + (Math.random() - 0.5) * spread + drift;
}

// threshold เดียวกับที่เขียนไว้ใน src/lib/status.ts — ถ้าแก้ต้องแก้ให้ตรงกันทั้งสองที่
const VENT_RULES = {
  tidal_volume: {
    critical: (v) => v < 350,
    warning: (v) => v < 380,
    msgCrit: "Tidal Volume ต่ำกว่าเกณฑ์",
    msgWarn: "Tidal Volume ค่อนข้างต่ำ",
  },
  resp_rate: {
    critical: (v) => v > 28,
    warning: (v) => v > 22,
    msgCrit: "Resp Rate สูงผิดปกติ",
    msgWarn: "Resp Rate สูงกว่าปกติ",
  },
  spo2: {
    critical: (v) => v < 88,
    warning: (v) => v < 92,
    msgCrit: "SpO2 ต่ำมาก — ต้องดูด่วน",
    msgWarn: "SpO2 ต่ำกว่าเกณฑ์",
  },
  peak_pressure: {
    critical: (v) => v > 35,
    warning: (v) => v > 30,
    msgCrit: "Peak Pressure สูงเกินไป",
    msgWarn: "Peak Pressure สูงกว่าเกณฑ์",
  },
  leak: {
    critical: (v) => v > 25,
    warning: (v) => v > 15,
    msgCrit: "Leak สูงมาก — ตรวจสอบวงจร",
    msgWarn: "Leak สูงกว่าเกณฑ์",
  },
};

const state = new Map();
const ticking = new Set(); // เก็บ patient.id ที่กำลังทำ tick อยู่ ยังไม่เสร็จ

function seedState() {
  return {
    vitals: {
      tidal_volume: 440 + (Math.random() - 0.5) * 40,
      resp_rate: 16 + (Math.random() - 0.5) * 4,
      spo2: 97 + (Math.random() - 0.5) * 2,
      fio2: 30 + (Math.random() - 0.5) * 8,
      peak_pressure: 20 + (Math.random() - 0.5) * 6,
      leak: 4 + Math.random() * 4,
    },
    iv: {
      remaining_pct: 60 + Math.random() * 30,
      rate_ml_hr: 80,
      status: "running",
    },
    anomaly: null,
    cooldown: 5,
  };
}

async function findUnresolvedAlert(patientId, param) {
  const { data } = await supabase
    .from("alerts")
    .select("id, level, acknowledged_at")
    .eq("patient_id", patientId)
    .eq("param", param)
    .is("resolved_at", null)
    .limit(1);
  return (data ?? [])[0] ?? null;
}

async function maybeInsertAlert(patientId, level, param, category, msg) {
  const existing = await findUnresolvedAlert(patientId, param);

  if (existing && existing.level === level) return;

  if (existing && existing.level !== level) {
    // ถ้าพยาบาล/แพทย์ acknowledge ไปแล้ว ให้ปล่อยไว้ ไม่แตะ — เป็นสิทธิ์ของคนหน้างานตัดสินใจเอง
    if (existing.acknowledged_at) return;

    await supabase
      .from("alerts")
      .update({ resolved_at: new Date().toISOString(), resolution_note: `เปลี่ยนระดับเป็น ${level} อัตโนมัติ` })
      .eq("id", existing.id);
  }

  const { error } = await supabase.from("alerts").insert({
    patient_id: patientId,
    level,
    param,
    category,
    msg,
    recipients: level === "critical" ? ["พยาบาล", "แพทย์"] : ["พยาบาล"],
    escalate_after_min: level === "critical" ? 15 : 45,
    escalate_to:
      level === "critical" ? "ทีม Rapid Response / แพทย์เวร" : "แพทย์",
  });
  if (error) console.error("insert alert failed:", error.message);
}
async function autoResolveIfRecovered(patientId, param, stillAbnormal) {
  if (stillAbnormal) return;
  const { data } = await supabase
    .from("alerts")
    .select("id")
    .eq("patient_id", patientId)
    .eq("param", param)
    .is("resolved_at", null)
    .limit(1);
  if (data && data.length > 0) {
    await supabase
      .from("alerts")
      .update({
        resolved_at: new Date().toISOString(),
        resolution_note: "ค่ากลับสู่ปกติอัตโนมัติ (auto-resolved by system)",
      })
      .eq("id", data[0].id);
  }
}

async function tick(patient) {
  const s = state.get(patient.id);
  const hasVent =
    patient.monitor_type === "vent" || patient.monitor_type === "both";
  const hasIV =
    patient.monitor_type === "iv" || patient.monitor_type === "both";

  if (hasVent) {
    if (!s.anomaly && s.cooldown <= 0 && Math.random() < 0.2) {
      const params = Object.keys(VENT_RULES);
      s.anomaly = {
        param: params[Math.floor(Math.random() * params.length)],
        ticksLeft: 6,
      };
    }
    const drift = {};
    if (s.anomaly) {
      const d = {
        tidal_volume: -6,
        resp_rate: 1.4,
        spo2: -0.6,
        peak_pressure: 1.2,
        leak: 1.5,
      };
      drift[s.anomaly.param] = d[s.anomaly.param];
      s.anomaly.ticksLeft -= 1;
      if (s.anomaly.ticksLeft <= 0) {
        s.anomaly = null;
        s.cooldown = 10;
      }
    }
    s.vitals.tidal_volume = clamp(
      randomWalk(s.vitals.tidal_volume, 8, drift.tidal_volume || 0),
      260,
      620,
    );
    s.vitals.resp_rate = clamp(
      randomWalk(s.vitals.resp_rate, 0.8, drift.resp_rate || 0),
      8,
      42,
    );
    s.vitals.spo2 = clamp(
      randomWalk(s.vitals.spo2, 0.5, drift.spo2 || 0),
      78,
      100,
    );
    s.vitals.fio2 = clamp(randomWalk(s.vitals.fio2, 1, 0), 21, 100);
    s.vitals.peak_pressure = clamp(
      randomWalk(s.vitals.peak_pressure, 0.8, drift.peak_pressure || 0),
      8,
      45,
    );
    s.vitals.leak = clamp(
      randomWalk(s.vitals.leak, 0.8, drift.leak || 0),
      0,
      45,
    );
    s.cooldown -= 1;

    await supabase
      .from("vitals_readings")
      .insert({ patient_id: patient.id, ...s.vitals });

    for (const [param, rule] of Object.entries(VENT_RULES)) {
      const v = s.vitals[param];
      const abnormal = rule.critical(v) || rule.warning(v);
      if (rule.critical(v))
        await maybeInsertAlert(
          patient.id,
          "critical",
          param,
          "vent",
          rule.msgCrit,
        );
      else if (rule.warning(v))
        await maybeInsertAlert(
          patient.id,
          "warning",
          param,
          "vent",
          rule.msgWarn,
        );
      await autoResolveIfRecovered(patient.id, param, abnormal);
    }
  }

  if (hasIV) {
    if (s.iv.status === "running") {
      s.iv.remaining_pct = clamp(
        s.iv.remaining_pct - s.iv.rate_ml_hr * 0.01,
        0,
        100,
      );
      if (s.iv.remaining_pct <= 0) s.iv.remaining_pct = 100; // จำลองเปลี่ยนถุงใหม่
    }
    await supabase
      .from("iv_readings")
      .insert({ patient_id: patient.id, ...s.iv });

    const ivAbnormal = s.iv.remaining_pct < 20;
    if (s.iv.remaining_pct < 5)
      await maybeInsertAlert(
        patient.id,
        "critical",
        "iv_remaining",
        "iv",
        `สารน้ำใกล้หมด (${s.iv.remaining_pct.toFixed(0)}%)`,
      );
    else if (s.iv.remaining_pct < 20)
      await maybeInsertAlert(
        patient.id,
        "warning",
        "iv_remaining",
        "iv",
        `สารน้ำเหลือน้อย (${s.iv.remaining_pct.toFixed(0)}%)`,
      );
    await autoResolveIfRecovered(patient.id, "iv_remaining", ivAbnormal);
  }
}

async function main() {
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, monitor_type, name");
  if (error) throw error;
  if (!patients || patients.length === 0) {
    console.error("ไม่พบผู้ป่วยในระบบ — ลอง insert ผ่าน SQL ก่อน");
    process.exit(1);
  }

  patients.forEach((p) => state.set(p.id, seedState()));
  console.log(
    `เริ่มจำลองข้อมูลผู้ป่วย ${patients.length} คน ทุก ${TICK_MS / 1000} วินาที (Ctrl+C เพื่อหยุด)`,
  );

  setInterval(() => {
    patients.forEach((p) => {
      if (ticking.has(p.id)) {
        console.warn(`ข้าม tick ของ ${p.name} — รอบก่อนหน้ายังทำไม่เสร็จ`);
        return;
      }
      ticking.add(p.id);
      tick(p)
        .catch((e) => console.error(`tick error for ${p.name}:`, e.message))
        .finally(() => ticking.delete(p.id));
    });
  }, TICK_MS);
}

main();
