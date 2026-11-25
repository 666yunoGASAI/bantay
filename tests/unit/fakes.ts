/** Test doubles: record what Bantay tried to do, and can be told to fail. */
import type { Notifier } from '../../src/discord';
import type { IssueTracker } from '../../src/github';

export function fakeTracker(options: { failOpen?: boolean } = {}) {
  let next = 1;
  const calls: string[] = [];
  const tracker: IssueTracker & { calls: string[]; failOpen: boolean } = {
    calls,
    failOpen: options.failOpen ?? false,
    async open(title) {
      if (tracker.failOpen) throw new Error('GitHub is down');
      const number = next++;
      calls.push(`open #${number}: ${title}`);
      return { number, url: `https://github.com/demo/bantay/issues/${number}` };
    },
    async comment(n, body) {
      calls.push(`comment #${n}: ${body}`);
    },
    async close(n) {
      calls.push(`close #${n}`);
    },
  };
  return tracker;
}

export function fakeNotifier(options: { fail?: boolean } = {}) {
  const calls: string[] = [];
  const notifier: Notifier & { calls: string[] } = {
    calls,
    async down(incident) {
      if (options.fail) throw new Error('webhook 500');
      calls.push(`down ${incident.checkId}`);
    },
    async up(incident) {
      if (options.fail) throw new Error('webhook 500');
      calls.push(`up ${incident.checkId}`);
    },
  };
  return notifier;
}

/** A fake `fetch` that records requests and answers with the given status/body. */
export function fakeFetch(status = 200, body: unknown = {}) {
  const requests: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    requests.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetch: fn, requests };
}
