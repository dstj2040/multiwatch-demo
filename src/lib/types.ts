export type MonitorType = "vent" | "iv" | "both";

export type StaffRole = "nurse" | "physician" | "nurse_manager" | "rapid_response" | "biomed_it" | "executive" | "admin";

export interface Ward {
  id: string;
  name: string;
  created_at: string;
}

export interface Patient {
  id: string;
  name: string;
  ward_id: string;
  mode: string | null;
  brand: string | null;
  iv_brand: string | null;
  iv_fluid: string | null;
  monitor_type: MonitorType;
  attending_physician_id: string | null;
  created_at: string;
}

export interface VitalsReading {
  id: number;
  patient_id: string;
  tidal_volume: number;
  resp_rate: number;
  spo2: number;
  fio2: number;
  peak_pressure: number;
  leak: number;
  recorded_at: string;
}

export interface IVReading {
  id: number;
  patient_id: string;
  remaining_pct: number;
  rate_ml_hr: number;
  status: "running" | "occluded";
  recorded_at: string;
}

export interface AlertRow {
  id: number;
  patient_id: string;
  level: "warning" | "critical";
  param: string;
  category: "vent" | "iv";
  msg: string;
  recipients: string[];
  escalate_after_min: number;
  escalate_to: string;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  escalated: boolean;
  escalated_at: string | null;
  escalated_to_staff_id: string | null;
}

export interface StaffProfile {
  id: string;
  full_name: string;
  role: StaffRole;
  ward_id: string | null;
  created_at: string;
}