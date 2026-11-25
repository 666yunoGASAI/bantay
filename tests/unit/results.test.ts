import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanError, isInfrastructureError, parseReport, slugify, type PwReport } from '../../src/results';

const report = JSON.parse(readFileSync(new URL('../fixtures/playwright-report.json', import.meta.url), 'utf8')) as PwReport;

describe('parseReport', () => {
  const results = parseReport(report);
  const byName = (name: string) => results.find((r) => r.name === name)!;

  it('creates one result per check and skips skipped tests', () => {
    expect(results.map((r) => r.name)).toEqual(['Site is reachable', 'Create a tournament', 'Report a match result']);
  });

  it('takes the site name from the describe block, not the file name', () => {
    expect(results.every((r) => r.site === 'Bracket Lord')).toBe(true);
    expect(byName('Create a tournament').id).toBe('bracket-lord/create-a-tournament');
  });

  it('reads the response time annotation', () => {
    expect(byName('Site is reachable').responseTimeMs).toBe(184);
  });

  it('marks a check down only when every attempt failed, using the LAST attempt for error and screenshot', () => {
    const failed = byName('Create a tournament');
    expect(failed.status).toBe('down');
    expect(failed.error).toBe(
      "Error: expect(locator).toBeVisible() failed Locator: getByRole('button', { name: 'Create bracket' }) Expected: visible",
    );
    expect(failed.screenshotPath).toBe('artifacts/retry1/test-failed-1.png');
    expect(failed.durationMs).toBe(20150);
  });

  it('counts a check that passed on retry as up, but flags it as retried', () => {
    const flaky = byName('Report a match result');
    expect(flaky.status).toBe('up');
    expect(flaky.retried).toBe(true);
    expect(flaky.error).toBeUndefined();
  });

  it('returns nothing for an empty report', () => {
    expect(parseReport({})).toEqual([]);
  });
});

describe('cleanError', () => {
  it('strips terminal colours and keeps the first three lines', () => {
    expect(cleanError('\u001b[31mBoom\u001b[39m\nline 2\n\nline 3\nline 4')).toBe('Boom line 2 line 3');
  });
  it('caps very long messages at 300 characters', () => {
    expect(cleanError('x'.repeat(1000))).toHaveLength(300);
  });
  it('returns undefined for no message', () => {
    expect(cleanError(undefined)).toBeUndefined();
  });
});

describe('isInfrastructureError', () => {
  it.each([
    "browserType.launch: Executable doesn't exist at /ms-playwright/chromium",
    'Looks like Playwright was just installed. Please run: npx playwright install',
  ])('treats "%s" as the patrol being broken', (message) => {
    expect(isInfrastructureError(message)).toBe(true);
  });

  it.each(['Error: expect(locator).toBeVisible() failed', 'net::ERR_NAME_NOT_RESOLVED at https://example.com', undefined])(
    'treats "%s" as a real site failure (or none)',
    (message) => {
      expect(isInfrastructureError(message)).toBe(false);
    },
  );
});

describe('slugify', () => {
  it.each([
    ['Bracket Lord', 'bracket-lord'],
    ['Saved data survives a reload', 'saved-data-survives-a-reload'],
    ["Site's  home   page!", 'sites-home-page'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
