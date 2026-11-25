// Bantay status page. Plain JS, no build step: Vercel serves this folder as-is.
// Everything is built with textContent (never innerHTML) because check names and
// error messages come from outside and must never be able to inject markup.

const DATA = './data';
const STRIP_LENGTH = 48; // last 48 patrols ≈ 6 days at one patrol every 3 hours

/** Fetches a JSON file. Distinguishes "not there yet" from "there but broken". */
async function load(name) {
  try {
    const response = await fetch(`${DATA}/${name}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return { state: 'missing' };
    return { state: 'ok', data: await response.json() };
  } catch {
    return { state: 'broken' };
  }
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function ago(iso, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function duration(fromIso, toIso) {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function when(iso) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------

function hero(current) {
  const down = current.checks.filter((c) => c.status === 'down');
  const headline =
    down.length === 0 ? 'All systems are up.' : down.length === 1 ? '1 check is down.' : `${down.length} checks are down.`;
  const schedule = current.schedule ? ` Checks run ${current.schedule}.` : '';
  return h(
    'section',
    { class: `hero ${down.length ? 'is-down' : 'is-up'}`, 'data-testid': 'hero' },
    h('h1', { text: headline }),
    h('p', { class: 'hero-detail', 'data-testid': 'last-checked' }, `Last checked ${ago(current.checkedAt)}.${schedule}`),
    down.length
      ? h('ul', { class: 'down-list' }, down.map((c) => h('li', {}, h('strong', { text: `${c.site}: ${c.name}` }), c.error ? ` · ${c.error}` : '')))
      : null,
  );
}

function staleNotice(current) {
  if (!current.intervalHours) return null;
  const hours = (Date.now() - Date.parse(current.checkedAt)) / 3600000;
  if (hours <= current.intervalHours * 2) return null;
  return h(
    'p',
    { class: 'notice', role: 'alert', 'data-testid': 'stale-notice' },
    `The last patrol was ${ago(current.checkedAt)}, but checks should run ${current.schedule ?? `every ${current.intervalHours} hours`}. `,
    'The results below may be out of date: the patrol itself might be stuck.',
  );
}

function strip(checkId, runs) {
  const recent = runs.slice(-STRIP_LENGTH);
  const statuses = recent.map((run) => run.results.find((r) => r.id === checkId)?.status ?? 'none');
  const up = statuses.filter((s) => s === 'up').length;
  const down = statuses.filter((s) => s === 'down').length;
  return h(
    'div',
    {
      class: 'strip',
      role: 'img',
      'aria-label': `Last ${plural(recent.length, 'patrol')}: ${up} up, ${down} down`,
      'data-testid': 'strip',
    },
    Array.from({ length: STRIP_LENGTH - recent.length }, () => h('span', { class: 'bar', 'data-status': 'empty' })),
    recent.map((run, i) =>
      h('span', { class: 'bar', 'data-status': statuses[i], title: `${when(run.at)}: ${statuses[i] === 'none' ? 'not checked' : statuses[i]}` }),
    ),
  );
}

function checkRow(check, runs) {
  const word = check.status === 'down' ? 'Down' : check.retried ? 'Unstable' : 'Up';
  const state = check.status === 'down' ? 'down' : check.retried ? 'unstable' : 'up';
  return h(
    'li',
    { class: 'check', 'data-testid': 'check', 'data-status': state },
    h('span', { class: 'status-word', text: word }),
    h('span', { class: 'check-name', text: check.name }),
    strip(check.id, runs),
    h('span', { class: 'uptime', 'data-testid': 'uptime', text: check.uptime === null || check.uptime === undefined ? '–' : `${check.uptime}%` }),
    h('span', { class: 'rt', text: check.responseTimeMs !== undefined ? `${check.responseTimeMs} ms` : '' }),
  );
}

function sitesSection(current, history) {
  const runs = history.state === 'ok' ? history.data.runs ?? [] : [];
  return current.sites.map((site) => {
    const checks = current.checks.filter((c) => c.site === site.name);
    const upCount = checks.filter((c) => c.status === 'up').length;
    return h(
      'section',
      { class: 'site', 'aria-labelledby': `site-${site.name}`, 'data-testid': 'site' },
      h(
        'div',
        { class: 'site-head' },
        h('h2', { id: `site-${site.name}`, text: site.name }),
        h('span', { class: 'site-count', text: `${upCount} of ${plural(checks.length, 'check')} up` }),
        h('a', { href: site.url, class: 'site-link', rel: 'noopener', target: '_blank', text: 'Visit site' }),
      ),
      h('div', { class: 'legend', 'aria-hidden': 'true' }, h('span', { text: 'Check' }), h('span', { text: `Last ${STRIP_LENGTH} patrols` }), h('span', { text: 'Uptime' }), h('span', { text: 'Response' })),
      h('ul', { class: 'checks' }, checks.map((c) => checkRow(c, runs))),
    );
  });
}

function incidentsSection(incidents) {
  const log = incidents.state === 'ok' ? incidents.data : { open: [], resolved: [] };
  const items = [
    ...log.open.map((i) =>
      h(
        'li',
        { class: 'incident is-open', 'data-testid': 'incident' },
        h('span', { class: 'incident-state', text: 'Ongoing' }),
        h('span', { class: 'incident-name', text: `${i.site}: ${i.name}` }),
        h('span', { class: 'incident-when', text: `Since ${when(i.openedAt)}` }),
        i.issueUrl ? h('a', { href: i.issueUrl, rel: 'noopener', target: '_blank', text: `Issue #${i.issueNumber}` }) : h('span'),
      ),
    ),
    ...log.resolved.slice(0, 10).map((i) =>
      h(
        'li',
        { class: 'incident', 'data-testid': 'incident' },
        h('span', { class: 'incident-state', text: `Down for ${duration(i.openedAt, i.closedAt)}` }),
        h('span', { class: 'incident-name', text: `${i.site}: ${i.name}` }),
        h('span', { class: 'incident-when', text: when(i.openedAt) }),
        i.issueUrl ? h('a', { href: i.issueUrl, rel: 'noopener', target: '_blank', text: `Issue #${i.issueNumber}` }) : h('span'),
      ),
    ),
  ];
  return h(
    'section',
    { class: 'incidents', 'aria-labelledby': 'incidents-title' },
    h('h2', { id: 'incidents-title', text: 'Incidents' }),
    items.length ? h('ul', {}, items) : h('p', { class: 'quiet', text: 'No incidents logged. Nothing has gone down since Bantay started watching.' }),
  );
}

function message(title, text) {
  return h('section', { class: 'hero is-unknown', 'data-testid': 'hero' }, h('h1', { text: title }), h('p', { class: 'hero-detail', text }));
}

async function main() {
  const app = document.getElementById('app');
  const [current, history, incidents] = await Promise.all([load('current.json'), load('history.json'), load('incidents.json')]);

  let content;
  if (current.state === 'missing') {
    content = [message("Bantay hasn't patrolled yet.", 'Results appear here after the first scheduled run.')];
  } else if (current.state === 'broken' || !Array.isArray(current.data?.checks)) {
    content = [message("Status data couldn't be read.", 'The next patrol rewrites it. Check the workflow logs if this keeps happening.')];
  } else {
    content = [staleNotice(current.data), hero(current.data), ...sitesSection(current.data, history), incidentsSection(incidents)];
  }
  app.replaceChildren(...content.filter(Boolean));
  app.setAttribute('aria-busy', 'false');
}

main();
