/**
 * `npm run patrol`: runs every monitor, then records results, opens/closes
 * incidents, sends alerts and refreshes the status page data in site/data/.
 *
 * Environment (all optional; without them Bantay runs in local "dry" mode):
 *   GITHUB_TOKEN + GITHUB_REPOSITORY  → open/close GitHub issues
 *   DISCORD_WEBHOOK_URL               → Discord alerts
 *   GITHUB_RUN_ID, GITHUB_SERVER_URL  → link alerts to the workflow run
 *   BANTAY_CHAOS=1                    → deliberately break one check (demo)
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { intervalHours, scheduleText, sites } from '../bantay.config.js';
import { createDiscordNotifier } from './discord.js';
import { createGitHubIssues } from './github.js';
import { runPatrol } from './patrol.js';
import { isInfrastructureError, parseReport, type PwReport } from './results.js';
import type { CheckResult, History, IncidentLog } from './types.js';

const DATA_DIR = 'site/data';
const SHOTS_DIR = join(DATA_DIR, 'screenshots');
const REPORT = 'bantay-results/report.json';
const KEEP_SCREENSHOTS = 30;

function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
  } catch {
    console.warn(`⚠ ${path} was unreadable, starting it fresh.`);
    return fallback;
  }
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function pruneScreenshots() {
  const files = readdirSync(SHOTS_DIR)
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({ f, t: statSync(join(SHOTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(KEEP_SCREENSHOTS)) rmSync(join(SHOTS_DIR, f));
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  rmSync(REPORT, { force: true });

  console.log('🔦 Bantay patrol starting…\n');
  spawnSync('npx', ['playwright', 'test', '-c', 'playwright.monitors.config.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (!existsSync(REPORT)) {
    // The monitors themselves could not run (install problem, syntax error…).
    // Don't record that as the sites being down.
    console.error(`\n✖ No report at ${REPORT}. The patrol itself failed, so nothing was recorded.`);
    process.exit(1);
  }

  const results = parseReport(JSON.parse(readFileSync(REPORT, 'utf8')) as PwReport);

  const broken = results.filter((r) => isInfrastructureError(r.error));
  if (broken.length > 0) {
    console.error(`\n✖ ${broken.length} check(s) failed because the patrol itself is broken, not the site:`);
    console.error(`  ${broken[0].error}`);
    console.error('  Nothing was recorded and no alerts were sent. Fix the runner (e.g. `npx playwright install`) and retry.');
    process.exit(1);
  }
  const now = new Date();
  const runId = process.env.GITHUB_RUN_ID ?? `local-${now.getTime()}`;
  const repo = process.env.GITHUB_REPOSITORY;
  const runUrl =
    process.env.GITHUB_RUN_ID && repo
      ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined;

  const screenshotUrlFor = (r: CheckResult) => {
    if (!r.screenshotPath || !existsSync(r.screenshotPath)) return undefined;
    const file = `${runId}-${r.id.replace(/\//g, '--')}.png`;
    copyFileSync(r.screenshotPath, join(SHOTS_DIR, file));
    return repo
      ? `https://raw.githubusercontent.com/${repo}/main/${SHOTS_DIR}/${file}`
      : `data/screenshots/${file}`;
  };

  const token = process.env.GITHUB_TOKEN;
  const webhook = process.env.DISCORD_WEBHOOK_URL;

  const output = await runPatrol({
    results,
    now,
    runId,
    runUrl,
    sites,
    history: readJson<History>(join(DATA_DIR, 'history.json'), { runs: [] }),
    incidents: readJson<IncidentLog>(join(DATA_DIR, 'incidents.json'), { open: [], resolved: [] }),
    tracker: token && repo ? createGitHubIssues({ token, repository: repo, apiUrl: process.env.GITHUB_API_URL }) : undefined,
    notifier: webhook ? createDiscordNotifier(webhook) : undefined,
    screenshotUrlFor,
    log: (m) => console.warn(`⚠ ${m}`),
  });

  writeJson(join(DATA_DIR, 'history.json'), output.history);
  writeJson(join(DATA_DIR, 'incidents.json'), output.incidents);
  writeJson(join(DATA_DIR, 'current.json'), { ...output.current, schedule: scheduleText, intervalHours });
  pruneScreenshots();

  const up = results.filter((r) => r.status === 'up').length;
  console.log(`\n🔦 Patrol done: ${up}/${results.length} checks up.`);
  if (!token || !repo) console.log('   (No GITHUB_TOKEN/GITHUB_REPOSITORY: issues skipped.)');
  if (!webhook) console.log('   (No DISCORD_WEBHOOK_URL: alerts skipped.)');
  for (const action of output.actions) console.log(`   • ${action}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = output.current.checks
      .map((c) => `| ${c.status === 'up' ? '🟢' : '🔴'} | ${c.site} | ${c.name} | ${c.responseTimeMs ?? ''} | ${c.uptime ?? '–'}% |`)
      .join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Bantay patrol: ${up}/${results.length} checks up\n\n| | Site | Check | Response (ms) | Uptime |\n|---|---|---|---|---|\n${rows}\n\n${output.actions.map((a) => `- ${a}`).join('\n')}\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
