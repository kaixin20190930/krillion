# Krillion Tips

Astro 5 + Cloudflare Workers. Evergreen guides remain static; daily pages, archives and sitemap read live D1 data. Independent, unofficial guide. Public-endpoint consistency is not independent player verification.

## Production resources

- Site Worker: `krillion-tips`, production domain `krillion.tips`.
- Scheduled Worker: `krillion-sync`, `wrangler.sync.jsonc`.
- D1: `krillion-content`, binding `CONTENT`.
- Private R2: `krillion-source`, binding `RAW`; original today/reveal responses and published snapshots.
- `data/dives/*.json`: export / editorial backup, not a second live source.
- GitHub Actions deploys code on pushes to main. Daily content does not rebuild or deploy the site.

## Date and publication rules

The one current date is the civil date in `America/New_York`. Dive number is the civil-day difference from 2026-07-16, plus one. The official endpoint's date, number and reset timestamp must agree; discrepancies are quarantined and do not silently override the formula.

No 15-minute date offset. Preheat retains the actual current dive. At ET midnight the page changes date even if the new dataset is not ready. It displays `pending`, `prompts_ready` or `partial` as needed; it never substitutes yesterday for today. All titles, headings, metadata and visible dates use the same daily view.

One shared daily record contains exact prompt text, selected answers, aliases, source, fetch/check/publication timestamps, revision/hash and separate endpoint/player verification flags. Polling unchanged data only updates lastCheckedAt, not updatedAt or sitemap lastmod.

## Scheduled execution

Cloudflare cron is `* * * * *` (UTC). Most ticks only decide whether a fetch is due. Runtime time-zone conversion handles US daylight saving automatically; no seasonal cron edits.

| Stage | Beijing standard-time season | Beijing US-daylight-time season | Action |
|---|---|---|---|
| Preheat T−15 | 12:45 | 11:45 | Check current dive; keep its date |
| T−5 to T+15 | 12:55–13:15 | 11:55–12:15 | Poll every minute |
| Target first publication T+5 | By 13:05 | By 12:05 | Publish valid prompts and available examples; availability-dependent |
| T+15 to T+2h | 13:15–15:00 | 12:15–14:00 | Poll every 10 minutes |
| Other hours | Minute 17 each hour | Minute 17 each hour | Lightweight date/data check |
| Daily review | 21:00 | 21:00 | Recheck source, record status, retain 30 days of run logs |
| Weekly reconciliation | Sunday 21:30 | Sunday 21:30 | Recheck the last seven saved dates; do not invent missing history |

The 21:00 review does not mark anything player-verified. Reset schedule is supported by the official client and API; actual first-seen transitions still need observation. Two upcoming acceptance windows: **2026-11-22 and 2026-11-23 at 13:00 Beijing**, with first-publication target 13:05.

Acceptance: last prior-date and first new-date observations bracket the reset, date/number match official data, the production revision is visible, no yesterday-as-today state occurs, and email is received once configured. Two real transitions cannot be claimed completed on implementation day.

## Automatic content flow

1. Fetch `https://krillion.io/api/today`; validate date, dive, reset and seven distinct prompts.
2. Fetch `/api/reveal?date=YYYY-MM-DD`; validate exact IDs/text and tier/score consistency.
3. Select up to three examples per actually available tier; retain aliases. Missing tiers remain absent.
4. Save original responses and published snapshot in private R2.
5. Atomically publish a D1 revision. Lock and content hash prevent concurrent/unchanged publications.
6. Fetch the production answer page and confirm date, dive and revision.
7. Queue first publish / rollover / update / missed deadline / mismatch / three failures / recovery notifications.

A later failure retains an existing correct same-day record. Invalid candidates are quarantined. Retries occur on later ticks, without blocking sleeps. R2 stores the complete raw answer response; the page is deliberately not an exhaustive database.

## Daily editorial hints

Use Node 22. Official prompts and answer examples are automatic; tailored hints can be edited without touching scoring or rebuilding.

```bash
npm run content:export -- 2026-11-21
# Edit only prompts[i].hint in data/dives/2026-11-21.json
npm run content:publish-hints -- data/dives/2026-11-21.json
```

The publisher rereads live data, validates date/number/exact prompts, merges hints only and checks for concurrent updates. Answer/score/player-verification edits in the file are not published. Subsequent syncs preserve hints while prompt text is unchanged. Raw answer data is not regenerated with AI.

## Email notification activation

Email delivery is prepared but **disabled until recipient and sender setup are complete**.

1. Obtain the operator's recipient email; do not infer it from the Cloudflare login.
2. Verify that destination mailbox in Cloudflare Email Service and complete sending-domain setup for `krillion.tips` (including the DNS requirements shown by Cloudflare). Do not overwrite existing mail DNS blindly.
3. Enable the commented `send_email: [{name: "EMAIL"}]` binding in `wrangler.sync.jsonc`.
4. Store addresses through the prompts below, not in Git:
   ```bash
   npx wrangler secret put NOTIFY_TO --config wrangler.sync.jsonc
   npx wrangler secret put NOTIFY_FROM --config wrangler.sync.jsonc
   WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npm run deploy:sync
   ```
5. Confirm actual receipt in the mailbox. A successful send API receipt alone is not proof of inbox delivery.

Only changed state is queued, not unchanged hourly polls. The outbox deduplicates events and retries failed sends at ten-minute intervals (up to eight attempts); unsent events older than one day are not replayed. Inspect outbox sent_at/receipt separately from collection success.

## Deployment and minimal validation

```bash
npm ci
npm run build
npm run check:daily
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 migrations apply krillion-content --remote
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler deploy
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npm run deploy:sync
```

No admin panel, AI content generator, new framework or broad testing suite. Only build, compact midnight/DST/mismatch checks and one production end-to-end inspection.

The GitHub deploy token needs access to this Worker, its D1 migrations and R2 bindings. Secrets are kept in Cloudflare/GitHub, never repository content. If CI secrets are absent, local authenticated Wrangler deployment remains the production path; do not claim CI success without checking a run.

## Caching, SEO and Search Console

- Daily SSR uses explicit Cloudflare Cache API keys containing ET date and content revision, at most 60 seconds and never past the next reset.
- Pending / prompt-only responses are no-store. Reset countdown page is no-store.
- Saved archive pages cache up to one day; any published content change changes the cache key.
- `/_astro/*` static assets: one-year immutable caching. SSR security headers are emitted in middleware, not only static `_headers`.
- Genuine missing archive dates/months return 404 and noindex.
- Homepage owns the site-level overview; today, hints, tiers, unlimited and archive pages have distinct titles.
- Dynamic sitemap uses actual content modification dates and published archives only.
- Existing HTTPS and www-to-apex redirects are retained.
- Existing GSC submission points at `https://krillion.tips/sitemap.xml`. The URL remains unchanged; daily revisions do not require daily resubmission.

## Operational inspection

```bash
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 execute krillion-content --remote --command "SELECT at,date,outcome,detail FROM runs ORDER BY id DESC LIMIT 10"
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 execute krillion-content --remote --command "SELECT * FROM observations ORDER BY date DESC LIMIT 3"
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 execute krillion-content --remote --command "SELECT event_key,sent_at,attempts,receipt FROM outbox ORDER BY created_at DESC LIMIT 10"
```

Do not bulk-backfill the previous 127 days before the two daily-reset acceptance windows pass.
