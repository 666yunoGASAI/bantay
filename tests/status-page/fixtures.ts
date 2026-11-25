/**
 * Builders for status-page scenarios, plus a fixture that serves them in place of the
 * real site/data/*.json files. Every test controls exactly what the page receives.
 */
import { test as base, expect, type Page } from '@playwright/test';
import type { CurrentStatus, History, IncidentLog } from '../../src/types';

export const NOW = new Date('2026-11-28T06:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const CHECKS = [
  { id: 'bracket-lord/site-is-reachable', name: 'Site is reachable' },
  { id: 'bracket-lord/create-a-tournament', name: 'Create a tournament' },
];

export function aCurrent(overrides: Partial<CurrentStatus> = {}): CurrentStatus {
  return {
    checkedAt: hoursAgo(0.25),
    overall: 'up',
    schedule: 'every 3 hours',
    intervalHours: 3,
    sites: [{ name: 'Bracket Lord', url: 'https://bracket-lord.vercel.app' }],
    checks: CHECKS.map((c, i) => ({
      ...c,
      site: 'Bracket Lord',
      status: 'up' as const,
      retried: false,
      uptime: 100,
      ...(i === 0 ? { responseTimeMs: 182 } : {}),
    })),
    ...overrides,
  };
}

/** n runs, one every 3 hours, oldest first. `downAt` lists run indexes where check 0 was down. */
export function aHistory(n: number, downAt: number[] = []): History {
  return {
    runs: Array.from({ length: n }, (_, i) => ({
      runId: `run-${i}`,
      at: hoursAgo((n - 1 - i) * 3),
      results: CHECKS.map((c, ci) => ({ id: c.id, status: ci === 0 && downAt.includes(i) ? ('down' as const) : ('up' as const) })),
    })),
  };
}

export const noIncidents: IncidentLog = { open: [], resolved: [] };

type Body = object | string | null; // null → 404, string → raw (e.g. corrupted) body

interface Fixtures {
  serveData: (data: { current?: Body; history?: Body; incidents?: Body }) => Promise<void>;
  openStatusPage: () => Promise<void>;
}

async function route(page: Page, file: string, body: Body | undefined) {
  await page.route(`**/data/${file}*`, (r) => {
    if (body === undefined || body === null) return r.fulfill({ status: 404, body: 'Not found' });
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  });
}

export const test = base.extend<Fixtures>({
  serveData: async ({ page }, use) => {
    await use(async ({ current, history, incidents }) => {
      await route(page, 'current.json', current);
      await route(page, 'history.json', history ?? { runs: [] });
      await route(page, 'incidents.json', incidents ?? noIncidents);
    });
  },
  openStatusPage: async ({ page }, use) => {
    await use(async () => {
      await page.clock.setFixedTime(NOW); // "Last checked 15 minutes ago" depends on the clock
      await page.goto('/');
      await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
    });
  },
});

export { expect, hoursAgo };
