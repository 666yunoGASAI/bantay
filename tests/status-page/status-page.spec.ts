import { aCurrent, aHistory, expect, hoursAgo, noIncidents, test } from './fixtures';

test.describe('Status page', () => {
  test('all checks up: green headline, every check row up @smoke', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: aCurrent(), history: aHistory(10) });
    await openStatusPage();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All systems are up.');
    await expect(page.getByTestId('last-checked')).toHaveText('Last checked 15 minutes ago. Checks run every 3 hours.');
    await expect(page.getByTestId('check')).toHaveCount(2);
    await expect(page.locator('[data-testid="check"][data-status="up"]')).toHaveCount(2);
    await expect(page.getByText('2 of 2 checks up')).toBeVisible();
    await expect(page.getByText('182 ms')).toBeVisible();
  });

  test('a failing check: red headline, error shown, open incident linked to its issue @smoke', async ({ page, serveData, openStatusPage }) => {
    const current = aCurrent();
    current.overall = 'down';
    current.checks[1] = { ...current.checks[1], status: 'down', uptime: 95.83, error: 'Timed out waiting for "Create bracket"' };
    await serveData({
      current,
      history: aHistory(24),
      incidents: {
        open: [{ checkId: current.checks[1].id, site: 'Bracket Lord', name: 'Create a tournament', openedAt: hoursAgo(1), issueNumber: 7, issueUrl: 'https://github.com/demo/bantay/issues/7' }],
        resolved: [],
      },
    });
    await openStatusPage();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 check is down.');
    await expect(page.getByTestId('hero')).toContainText('Timed out waiting for "Create bracket"');
    const row = page.getByTestId('check').filter({ hasText: 'Create a tournament' });
    await expect(row).toHaveAttribute('data-status', 'down');
    await expect(row.getByTestId('uptime')).toHaveText('95.83%');

    const incident = page.getByTestId('incident').first();
    await expect(incident).toContainText('Ongoing');
    await expect(incident.getByRole('link', { name: 'Issue #7' })).toHaveAttribute('href', 'https://github.com/demo/bantay/issues/7');
  });

  test('the patrol strip shows one bar per run, in order, with down runs marked', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: aCurrent(), history: aHistory(10, [2, 7]) });
    await openStatusPage();

    const strip = page.getByTestId('check').first().getByTestId('strip');
    await expect(strip).toHaveAttribute('aria-label', 'Last 10 patrols: 8 up, 2 down');
    const bars = strip.locator('.bar:not([data-status="empty"])');
    await expect(bars).toHaveCount(10);
    await expect(bars.nth(2)).toHaveAttribute('data-status', 'down');
    await expect(bars.nth(7)).toHaveAttribute('data-status', 'down');
    await expect(strip.locator('.bar[data-status="empty"]')).toHaveCount(38); // pads to 48
  });

  test('only the newest 48 runs are drawn', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: aCurrent(), history: aHistory(60) });
    await openStatusPage();
    await expect(page.getByTestId('strip').first().locator('.bar')).toHaveCount(48);
    await expect(page.getByTestId('strip').first()).toHaveAttribute('aria-label', /^Last 48 patrols/);
  });

  test('a check that passed only on retry is shown as Unstable', async ({ page, serveData, openStatusPage }) => {
    const current = aCurrent();
    current.checks[0] = { ...current.checks[0], retried: true };
    await serveData({ current, history: aHistory(3) });
    await openStatusPage();
    await expect(page.getByTestId('check').first()).toHaveAttribute('data-status', 'unstable');
    await expect(page.getByTestId('check').first()).toContainText('Unstable');
  });

  test('resolved incidents show how long the outage lasted', async ({ page, serveData, openStatusPage }) => {
    await serveData({
      current: aCurrent(),
      history: aHistory(5),
      incidents: {
        open: [],
        resolved: [{ checkId: 'x', site: 'Bracket Lord', name: 'Site is reachable', openedAt: hoursAgo(30), closedAt: hoursAgo(27.75), issueNumber: 3, issueUrl: 'https://github.com/demo/bantay/issues/3' }],
      },
    });
    await openStatusPage();
    await expect(page.getByTestId('incident')).toContainText('Down for 2h 15m');
    await expect(page.getByRole('link', { name: 'Issue #3' })).toBeVisible();
  });

  test('warns when the patrol itself seems stuck (no run for over twice the interval)', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: aCurrent({ checkedAt: hoursAgo(9) }), history: aHistory(3) });
    await openStatusPage();
    await expect(page.getByTestId('stale-notice')).toContainText('The last patrol was 9 hours ago');
  });

  test('no stale warning while the patrol is on schedule', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: aCurrent({ checkedAt: hoursAgo(5) }), history: aHistory(3) });
    await openStatusPage();
    await expect(page.getByTestId('hero')).toBeVisible();
    await expect(page.getByTestId('stale-notice')).toHaveCount(0);
  });

  test('before the first patrol, explains that results are coming', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: null, history: null, incidents: null });
    await openStatusPage();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Bantay hasn't patrolled yet.");
  });

  test('corrupted data shows a clear message instead of a blank page', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: '{"checkedAt": "2026-11-28T05:45', history: aHistory(2) });
    await openStatusPage();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Status data couldn't be read.");
  });

  test('missing history still renders the checks (with empty strips)', async ({ page, serveData, openStatusPage }) => {
    await serveData({ current: aCurrent(), history: null, incidents: noIncidents });
    await openStatusPage();
    await expect(page.getByTestId('check')).toHaveCount(2);
    await expect(page.getByTestId('strip').first()).toHaveAttribute('aria-label', 'Last 0 patrols: 0 up, 0 down');
    await expect(page.getByText('No incidents logged.')).toBeVisible();
  });

  test('error text from a site is shown as text, never run as HTML', async ({ page, serveData, openStatusPage }) => {
    const current = aCurrent();
    current.checks[0] = { ...current.checks[0], status: 'down', error: '<img src=x onerror="window.__pwned=1">' };
    await serveData({ current, history: aHistory(2) });
    await openStatusPage();
    await expect(page.getByTestId('hero')).toContainText('<img src=x onerror="window.__pwned=1">');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});
