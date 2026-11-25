/**
 * Checks for Bracket Lord. Each test is one check on the status page.
 * They walk the same paths a real user does: load, create, play, reload.
 * Selectors stick to visible text and roles, so cosmetic changes don't cause false alarms.
 */
import { expect, test, type Page } from '@playwright/test';
import { getSite } from '../bantay.config';

const site = getSite('bracket-lord');

/** Creates a tournament with the built-in sample teams and returns once the bracket shows. */
async function createTournament(page: Page) {
  await page.goto('/#/new');
  await page.getByLabel('Tournament name').fill(`Bantay patrol ${new Date().toISOString().slice(0, 16)}`);
  await page.getByRole('button', { name: 'Fill with sample teams' }).click();
  await page.getByRole('button', { name: 'Create bracket' }).click();
  await expect(page).toHaveURL(/#\/t\//);
  await expect(page.getByText(/8 teams · 3 rounds · 0 byes/)).toBeVisible();
}

/** Reports a 2–0 result for the first match and returns the winner's name. */
async function reportFirstMatch(page: Page) {
  const match = page.getByTestId('match-r1-m1');
  const winner = (await match.getByTestId('team-name').first().innerText()).trim();
  await match.getByRole('button', { name: 'Report result' }).click();
  const scores = page.getByRole('dialog').getByRole('spinbutton');
  await scores.nth(0).fill('2');
  await scores.nth(1).fill('0');
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  return winner;
}

test.describe(site.name, () => {
  test.use({ baseURL: site.url });

  test('Site is reachable', async ({ request }) => {
    const started = Date.now();
    const response = await request.get('/');
    const ms = Date.now() - started;
    test.info().annotations.push({ type: 'response-time', description: String(ms) });

    expect(response.status(), `${site.url} should answer 200`).toBe(200);
    expect(ms, 'response time in ms').toBeLessThan(5_000);
  });

  test('Home page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Chaos drill (BANTAY_CHAOS=1): look for a heading that never exists, to demo the full
    // incident flow (issue + alert + screenshot) without actually breaking the site.
    const heading = process.env.BANTAY_CHAOS ? 'Chaos drill: this heading does not exist' : 'Your tournaments';
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    expect(errors, 'JavaScript errors on the page').toEqual([]);
  });

  test('Create a tournament', async ({ page }) => {
    await createTournament(page);
    await expect(page.getByTestId('round-1').getByTestId(/^match-/)).toHaveCount(4);
  });

  test('Report a match result', async ({ page }) => {
    await createTournament(page);
    const winner = await reportFirstMatch(page);
    await expect(page.getByTestId('match-r2-m1').getByTestId('team-name').first()).toHaveText(winner);
  });

  test('Saved data survives a reload', async ({ page }) => {
    await createTournament(page);
    const winner = await reportFirstMatch(page);
    await page.reload();
    await expect(page.getByTestId('match-r1-m1').locator('[data-winner="true"]')).toContainText(winner);
  });
});
