/**
 * What Bantay watches. To add a site:
 *   1. add it here
 *   2. create monitors/<id>.monitor.ts with a test.describe('<name>') block of checks
 */
import type { Site } from './src/types.js';

export const sites: Site[] = [
  {
    id: 'bracket-lord',
    name: 'Bracket Lord',
    url: 'https://bracket-lord.vercel.app',
    repo: 'https://github.com/666yunoGASAI/bracket-lord',
  },
];

/** Keep in sync with the cron in .github/workflows/patrol.yml. */
export const intervalHours = 3;
/** Shown on the status page. */
export const scheduleText = 'every 3 hours';

/**
 * Looks up a site by id. BANTAY_URL_<ID> overrides the URL, e.g.
 * BANTAY_URL_BRACKET_LORD=http://localhost:5173 to patrol a local copy.
 */
export function getSite(id: string): Site {
  const site = sites.find((s) => s.id === id);
  if (!site) throw new Error(`Unknown site "${id}". Add it to bantay.config.ts.`);
  const override = process.env[`BANTAY_URL_${id.toUpperCase().replace(/-/g, '_')}`];
  return { ...site, url: (override ?? site.url).replace(/\/$/, '') };
}
