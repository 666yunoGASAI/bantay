/**
 * Config for the MONITORS (checks against live sites), used by `npm run patrol`.
 * The status-page tests use playwright.config.ts instead.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './monitors',
  testMatch: '**/*.monitor.ts',
  fullyParallel: true,
  workers: 2,
  // A check must fail twice in a row before it counts as down: no 3 a.m. alerts for a blip.
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'bantay-results/report.json' }],
    ['html', { outputFolder: 'bantay-results/html', open: 'never' }],
  ],
  outputDir: 'bantay-results/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Identify ourselves in the site's logs.
    userAgent: `${devices['Desktop Chrome'].userAgent} BantayMonitor/1.0`,
  },
});
