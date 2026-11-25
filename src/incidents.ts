import type { CheckResult, Incident, IncidentLog } from './types.js';

export const MAX_RESOLVED = 50;

export interface IncidentPlan {
  /** Checks that just went down and have no open incident. */
  toOpen: CheckResult[];
  /** Open incidents whose check is up again. */
  toClose: { incident: Incident; result: CheckResult }[];
  /** Still down: incident stays open, no new alert (prevents alert spam). */
  stillDown: { incident: Incident; result: CheckResult }[];
}

/**
 * The heart of Bantay's alerting: only state CHANGES produce alerts.
 * down → open one incident; still down → stay quiet; up again → close it.
 * Checks that weren't run this time (removed or renamed) leave incidents untouched.
 */
export function planIncidents(log: IncidentLog, results: CheckResult[]): IncidentPlan {
  const openById = new Map(log.open.map((i) => [i.checkId, i]));
  const plan: IncidentPlan = { toOpen: [], toClose: [], stillDown: [] };

  for (const result of results) {
    const incident = openById.get(result.id);
    if (result.status === 'down') {
      if (incident) plan.stillDown.push({ incident, result });
      else plan.toOpen.push(result);
    } else if (incident) {
      plan.toClose.push({ incident, result });
    }
  }
  return plan;
}

export function durationText(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
