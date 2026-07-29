export type Status = "normal" | "warning" | "critical";

export function ventParamStatus(param: string, value: number): Status {
  switch (param) {
    case "tidal_volume":
      if (value < 350) return "critical";
      if (value < 380) return "warning";
      return "normal";
    case "resp_rate":
      if (value > 28) return "critical";
      if (value > 22) return "warning";
      return "normal";
    case "spo2":
      if (value < 88) return "critical";
      if (value < 92) return "warning";
      return "normal";
    case "peak_pressure":
      if (value > 35) return "critical";
      if (value > 30) return "warning";
      return "normal";
    case "leak":
      if (value > 25) return "critical";
      if (value > 15) return "warning";
      return "normal";
    default:
      return "normal";
  }
}

export function ivStatus(remainingPct: number, pumpStatus: "running" | "occluded"): Status {
  if (pumpStatus === "occluded") return "critical";
  if (remainingPct < 5) return "critical";
  if (remainingPct < 20) return "warning";
  return "normal";
}
export function severityScore(alerts: { level: "warning" | "critical"; resolved_at: string | null }[]): number {
  return alerts
    .filter((a) => !a.resolved_at)
    .reduce((score, a) => score + (a.level === "critical" ? 3 : 1), 0);
}
export function overallStatus(alerts: { level: "warning" | "critical"; resolved_at: string | null }[]): Status {
  const active = alerts.filter((a) => !a.resolved_at);
  if (active.some((a) => a.level === "critical")) return "critical";
  if (active.length > 0) return "warning";
  return "normal";
}