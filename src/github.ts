/** Minimal GitHub Issues client. `fetch` is injected so tests never touch the network. */

export interface IssueRef {
  number: number;
  url: string;
}

export interface IssueTracker {
  open(title: string, body: string, labels: string[]): Promise<IssueRef>;
  comment(issueNumber: number, body: string): Promise<void>;
  close(issueNumber: number): Promise<void>;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export function createGitHubIssues(options: {
  token: string;
  repository: string; // "owner/repo"
  fetch?: typeof fetch;
  apiUrl?: string;
}): IssueTracker {
  const doFetch = options.fetch ?? fetch;
  const base = `${options.apiUrl ?? 'https://api.github.com'}/repos/${options.repository}`;

  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const response = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'bantay-monitor',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new GitHubApiError(`GitHub ${method} ${path} failed with ${response.status}: ${text.slice(0, 200)}`, response.status);
    }
    return response.status === 204 ? undefined : response.json();
  }

  return {
    async open(title, body, labels) {
      const issue = await call('POST', '/issues', { title, body, labels });
      return { number: issue.number, url: issue.html_url };
    },
    async comment(issueNumber, body) {
      await call('POST', `/issues/${issueNumber}/comments`, { body });
    },
    async close(issueNumber) {
      await call('PATCH', `/issues/${issueNumber}`, { state: 'closed', state_reason: 'completed' });
    },
  };
}
