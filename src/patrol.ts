/**
 * One patrol = one scheduled run. Pure orchestration: every side effect
 * (GitHub, Discord) is passed in, so the whole flow is unit-testable with fakes.
 */
import { appendRun, toRunRecord, uptime } from './history.js';
import { durationText, MAX_RESOLVED, planIncidents } from './incidents.js';
import type { IssueTracker } from './github.js';
import type { Notifier } from './discord.js';
import type { CheckResult, CurrentStatus, History, Incident, IncidentLog, Site } from './types.js';

export interface PatrolInput {
  results: CheckResult[];
  now: Date;
  runId: string;
  runUrl?: string;
  history: History;
  incidents: IncidentLog;
  sites: Site[];
  tracker?: IssueTracker;
  notifier?: Notifier;
  screenshotUrlFor?: (result: CheckResult) => string | undefined;
  log?: (message: string) => void;
}

export interface PatrolOutput {
  history: History;
  incidents: IncidentLog;
  current: CurrentStatus;
  /** Human-readable list of what happened, e.g. "opened bracket-lord/x (#12)". */
  actions: string[];
}

export const ISSUE_LABELS = ['bantay', 'incident'];

export function issueTitle(incident: Incident): string {
  return `🔴 ${incident.site}: ${incident.name} is failing`;
}

export function issueBody(incident: Incident, site: Site | undefined, runUrl?: string): string {
  const siteLink = site ? `[${site.name}](${site.url})` : incident.site;
  return [
    '**Bantay detected a failing check.** It failed, was retried, and failed again.',
    '',
    '| | |',
    '|---|---|',
    `| Site | ${siteLink} |`,
    `| Check | ${incident.name} |`,
    `| First failed | ${incident.openedAt.replace('T', ' ').slice(0, 16)} UTC |`,
    '',
    '### Error',
    '```',
    incident.error ?? 'No error message was captured.',
    '```',
    ...(incident.screenshotUrl ? ['', '### What the browser saw', `![Failure screenshot](${incident.screenshotUrl})`] : []),
    '',
    '### Reproduce it',
    `1. Open ${site?.url ?? 'the site'} and try: **${incident.name}**`,
    `2. Or run the check locally: \`npm run monitors -- -g "${incident.name}"\``,
    ...(runUrl ? ['', `Full logs, trace and screenshots: [workflow run](${runUrl})`] : []),
    '',
    '_Bantay closes this issue automatically when the check passes again._',
  ].join('\n');
}

export async function runPatrol(input: PatrolInput): Promise<PatrolOutput> {
  const log = input.log ?? (() => {});
  const nowIso = input.now.toISOString();
  const actions: string[] = [];
  const siteByName = new Map(input.sites.map((s) => [s.name, s]));

  const history = appendRun(input.history, toRunRecord(input.runId, input.now, input.results));
  const plan = planIncidents(input.incidents, input.results);

  const open: Incident[] = input.incidents.open.map((i) => ({ ...i }));
  let resolved: Incident[] = [...input.incidents.resolved];

  async function fileIssue(incident: Incident) {
    if (!input.tracker) return;
    try {
      const issue = await input.tracker.open(
        issueTitle(incident),
        issueBody(incident, siteByName.get(incident.site), input.runUrl),
        ISSUE_LABELS,
      );
      incident.issueNumber = issue.number;
      incident.issueUrl = issue.url;
    } catch (e) {
      // Never lose the incident because GitHub hiccuped: it is retried next patrol.
      log(`Could not open a GitHub issue for ${incident.checkId}: ${(e as Error).message}`);
    }
  }

  async function notify(action: () => Promise<void>, what: string) {
    if (!input.notifier) return;
    try {
      await action();
    } catch (e) {
      log(`Could not send the Discord ${what} alert: ${(e as Error).message}`);
    }
  }

  // 1. New failures: open an incident, file an issue, alert once.
  for (const result of plan.toOpen) {
    const incident: Incident = {
      checkId: result.id,
      site: result.site,
      name: result.name,
      openedAt: nowIso,
      error: result.error,
      screenshotUrl: input.screenshotUrlFor?.(result),
    };
    await fileIssue(incident);
    await notify(() => input.notifier!.down(incident, result, input.runUrl), 'down');
    open.push(incident);
    actions.push(`opened ${incident.checkId}${incident.issueNumber ? ` (#${incident.issueNumber})` : ''}`);
  }

  // 2. Still failing: stay quiet, but retry the issue if GitHub failed last time.
  for (const { incident, result } of plan.stillDown) {
    const current = open.find((i) => i.checkId === incident.checkId)!;
    current.error = result.error ?? current.error;
    if (current.issueNumber === undefined) {
      await fileIssue(current);
      if (current.issueNumber !== undefined) actions.push(`filed missing issue for ${current.checkId} (#${current.issueNumber})`);
    }
    actions.push(`still down ${current.checkId}`);
  }

  // 3. Recovered: comment, close the issue, alert once, move to the resolved log.
  for (const { incident } of plan.toClose) {
    const closed: Incident = { ...incident, closedAt: nowIso };
    if (input.tracker && closed.issueNumber !== undefined) {
      try {
        await input.tracker.comment(
          closed.issueNumber,
          `🟢 Recovered at ${nowIso.replace('T', ' ').slice(0, 16)} UTC. It was down for ${durationText(closed.openedAt, nowIso)}.`,
        );
        await input.tracker.close(closed.issueNumber);
      } catch (e) {
        log(`Could not close issue #${closed.issueNumber}: ${(e as Error).message}`);
      }
    }
    await notify(() => input.notifier!.up(closed, nowIso), 'recovery');
    const index = open.findIndex((i) => i.checkId === incident.checkId);
    open.splice(index, 1);
    resolved = [closed, ...resolved].slice(0, MAX_RESOLVED);
    actions.push(`closed ${closed.checkId}${closed.issueNumber ? ` (#${closed.issueNumber})` : ''}`);
  }

  const current: CurrentStatus = {
    checkedAt: nowIso,
    runUrl: input.runUrl,
    overall:
      input.results.length === 0 ? 'unknown' : input.results.some((r) => r.status === 'down') ? 'down' : 'up',
    checks: input.results.map((r) => ({
      id: r.id,
      site: r.site,
      name: r.name,
      status: r.status,
      retried: r.retried,
      responseTimeMs: r.responseTimeMs,
      uptime: uptime(history, r.id),
      error: r.error,
    })),
    sites: input.sites.map((s) => ({ name: s.name, url: s.url })),
  };

  return { history, incidents: { open, resolved }, current, actions };
}
