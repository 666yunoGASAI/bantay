# Setting up Bantay

About 15 minutes, once. You need the GitHub and Vercel accounts you already use for Bracket Lord, and a Discord account.

## 1. Push the repo to GitHub

Create a **public** repository called `bantay` on GitHub (no README, .gitignore or license), then from this folder:

```powershell
git init
git add .
git commit -m "Initial commit: Bantay"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/bantay.git
git push -u origin main
```

The **CI** workflow runs straight away and tests Bantay itself.

## 2. Create a Discord webhook (for alerts)

1. In Discord, create a server for yourself (**+** → **Create My Own**), or use one you own.
2. Make a text channel called `#bantay-alerts`.
3. Hover the channel → ⚙️ **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**.
4. Name it **Bantay** and click **Copy Webhook URL**.

Treat the webhook URL like a password: anyone who has it can post in your channel. Never put it in the code.

## 3. Give the webhook to GitHub as a secret

On your `bantay` repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

- Name: `DISCORD_WEBHOOK_URL`
- Secret: paste the webhook URL

GitHub issues need no setup: the workflow uses the built-in `GITHUB_TOKEN`.

## 4. Run the first patrol

**Actions** tab → **Patrol** → **Run workflow** → **Run workflow**.

When it finishes (~2 minutes), you'll see a new commit `patrol: 5/5 up`, and the run's summary page shows a results table. After that it runs on its own every 3 hours.

## 5. Try the chaos drill

**Actions** → **Patrol** → **Run workflow** → tick **Chaos drill** → **Run workflow**.

Within a couple of minutes:
- a new issue appears under **Issues**, with the error, a screenshot and reproduction steps
- `#bantay-alerts` gets a red alert

Then run **Patrol** again *without* chaos. The issue gets a "Recovered" comment and closes itself, and Discord gets a green "back up" message. Screenshot both for your portfolio.

## 6. Deploy the status page on Vercel

**Add New… → Project** → import `bantay` → **Deploy**. `vercel.json` already tells Vercel to serve the `site` folder with no build step.

Every patrol commit redeploys the page automatically. Put the link in the README's "Status page" line.

## Troubleshooting

| Problem | Fix |
|---|---|
| Patrol fails at "Save results" with a 403 | **Settings → Actions → General → Workflow permissions** → choose **Read and write permissions** → Save |
| No issues are created | Same setting as above. Also check that **Issues** is enabled under **Settings → General → Features** |
| No Discord alerts | Check the secret is named exactly `DISCORD_WEBHOOK_URL`. Alerts only fire when a check *changes* state, so use the chaos drill to test |
| Patrol says "the patrol itself is broken" | That's Bantay refusing to report a fake outage. Open the run logs: usually a browser install problem. Re-run the workflow |
| The status page shows "may be stuck" | The scheduled run hasn't happened for over 6 hours. Check the **Actions** tab. GitHub pauses schedules on inactive repos; re-enable the workflow there |
