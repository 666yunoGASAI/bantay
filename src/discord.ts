/** Discord alerts via an incoming webhook. Only sent when a check changes state. */
import { durationText } from './incidents.js';
import type { CheckResult, Incident } from './types.js';

export interface Notifier {
  down(incident: Incident, result: CheckResult, runUrl?: string): Promise<void>;
  up(incident: Incident, closedAt: string): Promise<void>;
}

const RED = 0xd2372c;
const GREEN = 0x1e8e5a;

export function downMessage(incident: Incident, result: CheckResult, runUrl?: string) {
  return {
    username: 'Bantay',
    embeds: [
      {
        title: `🔴 ${incident.site}: ${incident.name} is down`,
        description: result.error ?? 'The check failed.',
        color: RED,
        url: incident.issueUrl,
        fields: [
          ...(incident.issueUrl ? [{ name: 'Issue', value: `[#${incident.issueNumber}](${incident.issueUrl})`, inline: true }] : []),
          ...(runUrl ? [{ name: 'Run', value: `[Logs and trace](${runUrl})`, inline: true }] : []),
          { name: 'Confirmed', value: 'Failed twice in a row', inline: true },
        ],
        ...(incident.screenshotUrl ? { image: { url: incident.screenshotUrl } } : {}),
        timestamp: incident.openedAt,
      },
    ],
  };
}

export function upMessage(incident: Incident, closedAt: string) {
  return {
    username: 'Bantay',
    embeds: [
      {
        title: `🟢 ${incident.site}: ${incident.name} is back up`,
        description: `Down for ${durationText(incident.openedAt, closedAt)}.`,
        color: GREEN,
        url: incident.issueUrl,
        timestamp: closedAt,
      },
    ],
  };
}

export function createDiscordNotifier(webhookUrl: string, doFetch: typeof fetch = fetch): Notifier {
  async function send(payload: unknown) {
    const response = await doFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Discord webhook failed with ${response.status}`);
  }
  return {
    down: (incident, result, runUrl) => send(downMessage(incident, result, runUrl)),
    up: (incident, closedAt) => send(upMessage(incident, closedAt)),
  };
}
