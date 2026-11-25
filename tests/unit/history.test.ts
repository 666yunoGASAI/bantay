import { describe, expect, it } from 'vitest';
import { appendRun, toRunRecord, uptime } from '../../src/history';
import type { CheckResult, History } from '../../src/types';

const result = (id: string, status: 'up' | 'down', ms?: number): CheckResult => ({
  id, site: 'S', name: id, status, durationMs: 10, retried: false, responseTimeMs: ms,
});
const run = (n: number, statuses: Record<string, 'up' | 'down'>) =>
  toRunRecord(`r${n}`, new Date(Date.UTC(2026, 10, 1, n)), Object.entries(statuses).map(([id, s]) => result(id, s)));

describe('toRunRecord', () => {
  it('keeps only what history needs, including response time when present', () => {
    const record = toRunRecord('r1', new Date('2026-11-25T00:00:00Z'), [result('a', 'up', 120), result('b', 'down')]);
    expect(record).toEqual({
      runId: 'r1',
      at: '2026-11-25T00:00:00.000Z',
      results: [{ id: 'a', status: 'up', ms: 120 }, { id: 'b', status: 'down' }],
    });
  });
});

describe('appendRun', () => {
  it('adds the run at the end and keeps only the newest N', () => {
    let history: History = { runs: [] };
    for (let i = 0; i < 5; i++) history = appendRun(history, run(i, { a: 'up' }), 3);
    expect(history.runs.map((r) => r.runId)).toEqual(['r2', 'r3', 'r4']);
  });

  it('does not change the history it was given', () => {
    const before: History = { runs: [run(0, { a: 'up' })] };
    appendRun(before, run(1, { a: 'up' }));
    expect(before.runs).toHaveLength(1);
  });
});

describe('uptime', () => {
  it('is null with no data', () => {
    expect(uptime({ runs: [] }, 'a')).toBeNull();
  });

  it('is the share of runs where the check was up, to 2 decimals', () => {
    const history = { runs: [run(0, { a: 'up' }), run(1, { a: 'down' }), run(2, { a: 'up' })] };
    expect(uptime(history, 'a')).toBe(66.67);
  });

  it('ignores runs from before the check existed', () => {
    const history = { runs: [run(0, { old: 'up' }), run(1, { old: 'up', a: 'up' })] };
    expect(uptime(history, 'a')).toBe(100);
  });
});
