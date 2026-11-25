import type { CheckResult, History, RunRecord } from './types.js';

/** ~30 days of patrols at one run every 3 hours. */
export const MAX_RUNS = 240;

export function toRunRecord(runId: string, at: Date, results: CheckResult[]): RunRecord {
  return {
    runId,
    at: at.toISOString(),
    results: results.map((r) => ({
      id: r.id,
      status: r.status,
      ...(r.responseTimeMs !== undefined ? { ms: r.responseTimeMs } : {}),
    })),
  };
}

/** Appends a run and keeps only the newest `max` runs. Never mutates the input. */
export function appendRun(history: History, run: RunRecord, max = MAX_RUNS): History {
  const runs = [...history.runs, run];
  return { runs: runs.slice(Math.max(0, runs.length - max)) };
}

/**
 * Share of runs in which a check was up, as a percentage with 2 decimals.
 * Runs that didn't include the check (e.g. before it existed) are ignored.
 * Returns null when there is no data yet.
 */
export function uptime(history: History, checkId: string): number | null {
  let seen = 0;
  let up = 0;
  for (const run of history.runs) {
    const entry = run.results.find((r) => r.id === checkId);
    if (!entry) continue;
    seen++;
    if (entry.status === 'up') up++;
  }
  if (seen === 0) return null;
  return Math.round((up / seen) * 10000) / 100;
}
