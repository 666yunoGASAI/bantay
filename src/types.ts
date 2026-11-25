/** A site Bantay watches. Checks for it live in monitors/<id>.monitor.ts. */
export interface Site {
  id: string;
  name: string;
  url: string;
  repo?: string;
}

export type CheckStatus = 'up' | 'down';

/** One check's outcome in one patrol (one scheduled run). */
export interface CheckResult {
  /** Stable id, e.g. "bracket-lord/create-a-tournament". */
  id: string;
  site: string;
  name: string;
  status: CheckStatus;
  durationMs: number;
  responseTimeMs?: number;
  /** Failed on the first try but passed on the retry. Counted as up, flagged as unstable. */
  retried: boolean;
  error?: string;
  /** Local path of the failure screenshot from the final attempt. */
  screenshotPath?: string;
}

/** Compact per-run entry kept in history.json (names live in current.json). */
export interface RunRecord {
  runId: string;
  at: string;
  results: { id: string; status: CheckStatus; ms?: number }[];
}

export interface History {
  runs: RunRecord[];
}

export interface Incident {
  checkId: string;
  site: string;
  name: string;
  openedAt: string;
  closedAt?: string;
  error?: string;
  issueNumber?: number;
  issueUrl?: string;
  screenshotUrl?: string;
}

export interface IncidentLog {
  open: Incident[];
  resolved: Incident[];
}

export interface CurrentStatus {
  checkedAt: string;
  runUrl?: string;
  overall: 'up' | 'down' | 'unknown';
  checks: {
    id: string;
    site: string;
    name: string;
    status: CheckStatus;
    retried: boolean;
    responseTimeMs?: number;
    uptime: number | null;
    error?: string;
  }[];
  sites: { name: string; url: string }[];
  /** Added by the CLI from bantay.config.ts. */
  schedule?: string;
  intervalHours?: number;
}
