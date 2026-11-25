/**
 * Turns Playwright's JSON report into Bantay check results.
 * Convention: test.describe('<Site name>') wraps the checks for one site;
 * each test title is the check name.
 */
import type { CheckResult } from './types.js';

interface PwAttachment { name: string; path?: string }
interface PwResult {
  status: string;
  duration: number;
  retry: number;
  error?: { message?: string };
  attachments?: PwAttachment[];
}
interface PwTest {
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  annotations?: { type: string; description?: string }[];
  results: PwResult[];
}
interface PwSpec { title: string; tests: PwTest[] }
interface PwSuite { title: string; specs?: PwSpec[]; suites?: PwSuite[] }
export interface PwReport { suites?: PwSuite[] }

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/** Removes terminal colour codes and keeps the first meaningful line of an error. */
export function cleanError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  // eslint-disable-next-line no-control-regex
  const plain = message.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, 3).join(' ').slice(0, 300);
}

/**
 * Errors that mean the PATROL is broken (browser missing, launch crash), not the site.
 * These must never be recorded as downtime or trigger alerts.
 */
const INFRASTRUCTURE_ERRORS = [
  /browserType\.launch/i,
  /Executable doesn't exist/i,
  /npx playwright install/i,
  /Target page, context or browser has been closed/i,
];

export function isInfrastructureError(message: string | undefined): boolean {
  return !!message && INFRASTRUCTURE_ERRORS.some((pattern) => pattern.test(message));
}

export function parseReport(report: PwReport): CheckResult[] {
  const results: CheckResult[] = [];

  const walk = (suite: PwSuite, parents: string[]) => {
    const path = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        if (test.status === 'skipped' || test.results.length === 0) continue;
        // The first title is the spec file name; the site is the describe block below it.
        const site = path.length > 1 ? path[path.length - 1] : 'Unknown site';
        const last = test.results[test.results.length - 1];
        const down = test.status === 'unexpected';
        const responseTime = test.annotations?.find((a) => a.type === 'response-time')?.description;
        results.push({
          id: `${slugify(site)}/${slugify(spec.title)}`,
          site,
          name: spec.title,
          status: down ? 'down' : 'up',
          durationMs: Math.round(test.results.reduce((sum, r) => sum + r.duration, 0)),
          responseTimeMs: responseTime !== undefined ? Number(responseTime) : undefined,
          retried: test.status === 'flaky',
          error: down ? cleanError(last.error?.message) : undefined,
          screenshotPath: down ? last.attachments?.find((a) => a.name === 'screenshot')?.path : undefined,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, path);
  };

  for (const suite of report.suites ?? []) walk(suite, []);
  return results;
}
