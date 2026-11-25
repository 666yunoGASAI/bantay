/**
 * End-to-end behaviour of a patrol, with GitHub and Discord replaced by fakes.
 * Each test walks through patrols in order, the way the scheduled workflow would.
 */
import { describe, expect, it } from 'vitest';
import { issueBody, runPatrol, type PatrolInput } from '../../src/patrol';
import type { CheckResult, History, IncidentLog, Site } from '../../src/types';
import { fakeNotifier, fakeTracker } from './fakes';

const sites: Site[] = [{ id: 'bracket-lord', name: 'Bracket Lord', url: 'https://bracket-lord.vercel.app' }];
const check = (name: string, status: 'up' | 'down', extra: Partial<CheckResult> = {}): CheckResult => ({
  id: `bracket-lord/${name.toLowerCase().replace(/ /g, '-')}`,
  site: 'Bracket Lord',
  name,
  status,
  durationMs: 100,
  retried: false,
  ...(status === 'down' ? { error: `${name} failed` } : {}),
  ...extra,
});

let clock = Date.UTC(2026, 10, 25, 0, 0);
function patrol(state: { history: History; incidents: IncidentLog }, results: CheckResult[], extra: Partial<PatrolInput> = {}) {
  clock += 3 * 3600_000;
  return runPatrol({ results, now: new Date(clock), runId: `run-${clock}`, sites, ...state, ...extra });
}
const empty = () => ({ history: { runs: [] } as History, incidents: { open: [], resolved: [] } as IncidentLog });

describe('a full outage: break → still broken → recover', () => {
  it('opens one issue and one alert, stays quiet while down, then closes and announces recovery', async () => {
    const tracker = fakeTracker();
    const notifier = fakeNotifier();
    const deps = { tracker, notifier };

    // Patrol 1: everything fine.
    let out = await patrol(empty(), [check('Create a tournament', 'up')], deps);
    expect(out.actions).toEqual([]);
    expect(tracker.calls).toEqual([]);

    // Patrol 2: breaks.
    out = await patrol(out, [check('Create a tournament', 'down')], deps);
    expect(out.actions).toEqual(['opened bracket-lord/create-a-tournament (#1)']);
    expect(tracker.calls).toEqual(['open #1: 🔴 Bracket Lord: Create a tournament is failing']);
    expect(notifier.calls).toEqual(['down bracket-lord/create-a-tournament']);
    expect(out.incidents.open).toHaveLength(1);
    expect(out.current.overall).toBe('down');

    // Patrol 3: still broken. No new issue, no new alert.
    out = await patrol(out, [check('Create a tournament', 'down')], deps);
    expect(tracker.calls).toHaveLength(1);
    expect(notifier.calls).toHaveLength(1);

    // Patrol 4: recovered.
    out = await patrol(out, [check('Create a tournament', 'up')], deps);
    expect(tracker.calls.slice(1)).toEqual([
      expect.stringMatching(/^comment #1: 🟢 Recovered at .* It was down for 6h\.$/),
      'close #1',
    ]);
    expect(notifier.calls).toEqual(['down bracket-lord/create-a-tournament', 'up bracket-lord/create-a-tournament']);
    expect(out.incidents.open).toEqual([]);
    expect(out.incidents.resolved[0]).toMatchObject({ issueNumber: 1, closedAt: expect.any(String) });
    expect(out.current.overall).toBe('up');
    expect(out.current.checks[0].uptime).toBe(50); // 2 of 4 patrols up
  });
});

describe('resilience', () => {
  it('records the incident even if GitHub is down, and files the issue on the next patrol', async () => {
    const tracker = fakeTracker({ failOpen: true });
    const warnings: string[] = [];
    let out = await patrol(empty(), [check('Site is reachable', 'down')], { tracker, log: (m) => warnings.push(m) });

    expect(out.incidents.open).toHaveLength(1);
    expect(out.incidents.open[0].issueNumber).toBeUndefined();
    expect(warnings[0]).toMatch(/Could not open a GitHub issue .*GitHub is down/);

    tracker.failOpen = false;
    out = await patrol(out, [check('Site is reachable', 'down')], { tracker });
    expect(out.incidents.open[0].issueNumber).toBe(1);
    expect(out.actions).toContain('filed missing issue for bracket-lord/site-is-reachable (#1)');
  });

  it('a failing Discord webhook never blocks the issue or the saved data', async () => {
    const tracker = fakeTracker();
    const warnings: string[] = [];
    const out = await patrol(empty(), [check('Site is reachable', 'down')], {
      tracker,
      notifier: fakeNotifier({ fail: true }),
      log: (m) => warnings.push(m),
    });
    expect(tracker.calls).toHaveLength(1);
    expect(out.incidents.open).toHaveLength(1);
    expect(warnings).toEqual(['Could not send the Discord down alert: webhook 500']);
  });

  it('works with no GitHub or Discord configured (local dry run)', async () => {
    const out = await patrol(empty(), [check('Site is reachable', 'down')]);
    expect(out.actions).toEqual(['opened bracket-lord/site-is-reachable']);
    expect(out.incidents.open[0].issueUrl).toBeUndefined();
  });

  it('keeps at most 50 resolved incidents', async () => {
    let state = empty();
    for (let i = 0; i < 55; i++) {
      state = await patrol(state, [check('Flappy', 'down')]);
      state = await patrol(state, [check('Flappy', 'up')]);
    }
    expect(state.incidents.resolved).toHaveLength(50);
  });
});

describe('status snapshot', () => {
  it('is "unknown" when no checks ran', async () => {
    const out = await patrol(empty(), []);
    expect(out.current.overall).toBe('unknown');
  });

  it('includes response time, retry flag and uptime per check', async () => {
    const out = await patrol(empty(), [check('Site is reachable', 'up', { responseTimeMs: 180, retried: true })]);
    expect(out.current.checks[0]).toMatchObject({ responseTimeMs: 180, retried: true, uptime: 100 });
  });

  it('attaches the screenshot URL to new incidents', async () => {
    const out = await patrol(empty(), [check('Site is reachable', 'down')], { screenshotUrlFor: () => 'https://img/1.png' });
    expect(out.incidents.open[0].screenshotUrl).toBe('https://img/1.png');
  });
});

describe('issueBody', () => {
  it('gives a developer everything needed to act: site, error, screenshot, reproduction, logs', () => {
    const body = issueBody(
      {
        checkId: 'bracket-lord/create-a-tournament',
        site: 'Bracket Lord',
        name: 'Create a tournament',
        openedAt: '2026-11-25T03:00:00.000Z',
        error: 'Timeout waiting for Create bracket',
        screenshotUrl: 'https://img/shot.png',
      },
      sites[0],
      'https://github.com/demo/bantay/actions/runs/42',
    );
    expect(body).toContain('| Site | [Bracket Lord](https://bracket-lord.vercel.app) |');
    expect(body).toContain('| First failed | 2026-11-25 03:00 UTC |');
    expect(body).toContain('Timeout waiting for Create bracket');
    expect(body).toContain('![Failure screenshot](https://img/shot.png)');
    expect(body).toContain('npm run monitors -- -g "Create a tournament"');
    expect(body).toContain('[workflow run](https://github.com/demo/bantay/actions/runs/42)');
  });
});
