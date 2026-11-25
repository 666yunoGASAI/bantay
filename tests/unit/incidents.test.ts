import { describe, expect, it } from 'vitest';
import { durationText, planIncidents } from '../../src/incidents';
import type { CheckResult, Incident } from '../../src/types';

const result = (id: string, status: 'up' | 'down'): CheckResult => ({ id, site: 'S', name: id, status, durationMs: 1, retried: false });
const incident = (checkId: string): Incident => ({ checkId, site: 'S', name: checkId, openedAt: '2026-11-25T00:00:00Z', issueNumber: 1 });

describe('planIncidents', () => {
  it('opens an incident for a newly failing check', () => {
    const plan = planIncidents({ open: [], resolved: [] }, [result('a', 'down'), result('b', 'up')]);
    expect(plan.toOpen.map((r) => r.id)).toEqual(['a']);
    expect(plan.toClose).toEqual([]);
  });

  it('stays quiet while an already-open incident is still failing (no duplicate issue or alert)', () => {
    const plan = planIncidents({ open: [incident('a')], resolved: [] }, [result('a', 'down')]);
    expect(plan.toOpen).toEqual([]);
    expect(plan.stillDown.map((s) => s.incident.checkId)).toEqual(['a']);
  });

  it('closes the incident when the check passes again', () => {
    const plan = planIncidents({ open: [incident('a')], resolved: [] }, [result('a', 'up')]);
    expect(plan.toClose.map((c) => c.incident.checkId)).toEqual(['a']);
  });

  it('does nothing for healthy checks with no incident', () => {
    expect(planIncidents({ open: [], resolved: [] }, [result('a', 'up')])).toEqual({ toOpen: [], toClose: [], stillDown: [] });
  });

  it('leaves incidents alone for checks that did not run this time', () => {
    const plan = planIncidents({ open: [incident('removed')], resolved: [] }, [result('a', 'up')]);
    expect(plan).toEqual({ toOpen: [], toClose: [], stillDown: [] });
  });

  it('handles several checks changing at once', () => {
    const plan = planIncidents({ open: [incident('a'), incident('b')], resolved: [] }, [
      result('a', 'up'),
      result('b', 'down'),
      result('c', 'down'),
    ]);
    expect(plan.toClose.map((c) => c.incident.checkId)).toEqual(['a']);
    expect(plan.stillDown.map((s) => s.incident.checkId)).toEqual(['b']);
    expect(plan.toOpen.map((r) => r.id)).toEqual(['c']);
  });
});

describe('durationText', () => {
  it.each([
    ['2026-11-25T00:00:00Z', '2026-11-25T00:00:20Z', 'under a minute'],
    ['2026-11-25T00:00:00Z', '2026-11-25T00:45:00Z', '45m'],
    ['2026-11-25T00:00:00Z', '2026-11-25T03:00:00Z', '3h'],
    ['2026-11-25T00:00:00Z', '2026-11-25T02:15:00Z', '2h 15m'],
    ['2026-11-25T00:00:00Z', '2026-11-27T05:00:00Z', '2d 5h'],
  ])('%s → %s = %s', (from, to, expected) => {
    expect(durationText(from, to)).toBe(expected);
  });
});
