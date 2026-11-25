/** GitHub and Discord clients, tested against a fake fetch: no network, exact requests checked. */
import { describe, expect, it } from 'vitest';
import { createDiscordNotifier, downMessage, upMessage } from '../../src/discord';
import { createGitHubIssues, GitHubApiError } from '../../src/github';
import type { CheckResult, Incident } from '../../src/types';
import { fakeFetch } from './fakes';

const incident: Incident = {
  checkId: 'bracket-lord/site-is-reachable',
  site: 'Bracket Lord',
  name: 'Site is reachable',
  openedAt: '2026-11-25T03:00:00.000Z',
  issueNumber: 12,
  issueUrl: 'https://github.com/demo/bantay/issues/12',
  screenshotUrl: 'https://img/shot.png',
};
const result: CheckResult = { id: incident.checkId, site: 'Bracket Lord', name: 'Site is reachable', status: 'down', durationMs: 5, retried: false, error: '503 Service Unavailable' };

describe('GitHub issues client', () => {
  it('opens an issue with auth, API version, title, body and labels', async () => {
    const { fetch, requests } = fakeFetch(201, { number: 12, html_url: 'https://github.com/demo/bantay/issues/12' });
    const issues = createGitHubIssues({ token: 't0ken', repository: 'demo/bantay', fetch });

    const issue = await issues.open('Title', 'Body', ['bantay', 'incident']);

    expect(issue).toEqual({ number: 12, url: 'https://github.com/demo/bantay/issues/12' });
    expect(requests[0]).toMatchObject({
      url: 'https://api.github.com/repos/demo/bantay/issues',
      method: 'POST',
      body: { title: 'Title', body: 'Body', labels: ['bantay', 'incident'] },
    });
    expect(requests[0].headers).toMatchObject({ Authorization: 'Bearer t0ken', 'X-GitHub-Api-Version': '2022-11-28' });
  });

  it('comments on and closes an issue', async () => {
    const { fetch, requests } = fakeFetch(200);
    const issues = createGitHubIssues({ token: 't', repository: 'demo/bantay', fetch });
    await issues.comment(12, 'Recovered');
    await issues.close(12);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST https://api.github.com/repos/demo/bantay/issues/12/comments',
      'PATCH https://api.github.com/repos/demo/bantay/issues/12',
    ]);
    expect(requests[1].body).toEqual({ state: 'closed', state_reason: 'completed' });
  });

  it('supports a custom API URL (GitHub Enterprise, or a mock server)', async () => {
    const { fetch, requests } = fakeFetch(200);
    await createGitHubIssues({ token: 't', repository: 'o/r', fetch, apiUrl: 'http://localhost:4999' }).close(1);
    expect(requests[0].url).toBe('http://localhost:4999/repos/o/r/issues/1');
  });

  it('throws a readable error with the status code when GitHub refuses', async () => {
    const { fetch } = fakeFetch(403, { message: 'Resource not accessible by integration' });
    const issues = createGitHubIssues({ token: 't', repository: 'demo/bantay', fetch });
    const error = await issues.open('T', 'B', []).catch((e) => e);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error.status).toBe(403);
    expect(error.message).toContain('Resource not accessible by integration');
  });
});

describe('Discord alerts', () => {
  it('down alert: red, names the check, shows the error, links the issue and run, shows the screenshot', () => {
    const embed = downMessage(incident, result, 'https://github.com/demo/bantay/actions/runs/1').embeds[0];
    expect(embed.title).toBe('🔴 Bracket Lord: Site is reachable is down');
    expect(embed.description).toBe('503 Service Unavailable');
    expect(embed.color).toBe(0xd2372c);
    expect(embed.fields).toContainEqual({ name: 'Issue', value: '[#12](https://github.com/demo/bantay/issues/12)', inline: true });
    expect(embed.fields).toContainEqual({ name: 'Run', value: '[Logs and trace](https://github.com/demo/bantay/actions/runs/1)', inline: true });
    expect(embed.image).toEqual({ url: 'https://img/shot.png' });
  });

  it('up alert: green, says how long it was down', () => {
    const embed = upMessage(incident, '2026-11-25T05:15:00.000Z').embeds[0];
    expect(embed.title).toBe('🟢 Bracket Lord: Site is reachable is back up');
    expect(embed.description).toBe('Down for 2h 15m.');
    expect(embed.color).toBe(0x1e8e5a);
  });

  it('posts JSON to the webhook, and throws when Discord rejects it', async () => {
    const ok = fakeFetch(204);
    await createDiscordNotifier('https://discord/webhook', ok.fetch).up(incident, '2026-11-25T04:00:00.000Z');
    expect(ok.requests[0]).toMatchObject({ url: 'https://discord/webhook', method: 'POST', body: { username: 'Bantay' } });

    const bad = fakeFetch(429);
    await expect(createDiscordNotifier('https://discord/webhook', bad.fetch).down(incident, result)).rejects.toThrow('429');
  });
});
