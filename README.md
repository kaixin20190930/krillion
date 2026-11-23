# Krillion Tips

Astro 5 + Cloudflare Workers. Evergreen guides remain static; daily pages, archives and sitemap read live D1 data. Independent, unofficial guide. Public-endpoint consistency is not independent player verification.

## Production resources

- Site Worker: `krillion-tips`, production domain `krillion.tips`.
- Scheduled Worker: `krillion-sync`, `wrangler.sync.jsonc`.
- D1: `krillion-content`, binding `CONTENT`.
- Private R2: `krillion-source`, binding `RAW`; original today/reveal responses and published snapshots.
- `data/dives/*.json`: export / editorial backup, not a second live source.
- GitHub Actions is configured to deploy code on pushes to main, but requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. Daily content does not rebuild or deploy the site.

## Date and publication rules

The one current date is the civil date in `America/New_York`. A positive integer Dive number from the official endpoint takes priority. The civil-day difference from 2026-07-16 is only an estimate used to log exceptions, never to override an observed official number. A pending record has no Dive number. Date, reset timestamp and seven distinct prompts must validate; invalid candidates are not published.

No 15-minute date offset. Preheat retains the actual current dive. At ET midnight the page changes date even if the new dataset is not ready. It displays `pending`, `prompts_ready` or `partial` as needed; it never substitutes yesterday for today. All titles, headings, metadata and visible dates use the same daily view.

One shared daily record contains exact prompt text, selected answers, aliases, source, fetch/check/publication timestamps, revision/hash and separate endpoint/player verification flags. Polling unchanged data only updates lastCheckedAt, not updatedAt or sitemap lastmod.

## Scheduled execution

These are not Codex app automations. Collection runs on Cloudflare even when the operator's computer and Codex are closed.

| Feature | Where it runs | Definition / results |
|---|---|---|
| Collection and publication | Cloudflare `krillion-sync` scheduled Worker | `workers/sync.ts`, `wrangler.sync.jsonc`; Worker logs and D1 `runs` |
| Missing-data fallback | Site Worker when a daily page is requested | `src/lib/daily.ts`, `src/middleware.ts`; visible page status |
| Reset countdown | Visitor's browser, using the server-provided reset timestamp | `src/pages/when-does-krillion-reset.astro`; countdown and saved observations on that page |

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

Acceptance: record last old-date source and production observations separately, first new-date source observation, first successful canonical production check, first ready check and latest content update. The source-first-seen → first-site-ok interval must be between 0 and 300 seconds. The first page can be prompt-only; answer readiness and reset-relative lateness are separate checks. Latest update is not a declaration of a final edition. Provider mail acceptance does not prove publication or inbox receipt. Two real transitions cannot be claimed completed on implementation day.

Legacy unchanged runs reused an earlier successful page check. Migration backfill uses first successful records conservatively, but last/prior production observations use only legacy published runs or new raw-linked checks that actually fetched production. Missing observations stay missing; they are not reconstructed from fetch timestamps.

### 2026-11-23 execution table (Beijing time)

| Time | Action | Acceptance |
|---|---|---|
| Now–12:45 | Confirm deployed cron, readable logs, notification configuration and raw-response storage. Do not manually change date or Dive number. | Missing new data shows the new date with pending status and no guessed number or old answers. Old content is available only in clearly dated archives. |
| 12:45 | Preheat; retain the actual November 22 official content. | No premature date change or invented new prompts. |
| 12:55–13:15 | Check official data and the canonical production page every minute; retain each due check. | Save last old source/production observations, first new source observation, first site=ok and latest content update. |
| When new data appears | Validate official date, observed number, seven prompts and answer tier/score pairs; publish valid available data. | One shared D1 record supplies daily pages; pending/prompts_ready/partial are explicit and never mix yesterday's answers with today's date. |
| Immediately after publication | Check homepage, answers, Hints and the dated archive page. | Save successful production-check timestamps, not collection-start timestamps. Source → production ≤300 seconds meets the freshness target. |
| 13:15 if still not ready | Save a dedicated timeout15 event and enqueue its email; continue retries. | D1 outbox contains timeout15:2026-11-23, runs/check.json retain failure evidence, and subsequent retries continue. |
| After real new prompts appear | Export live data, prepare one non-spoiling hint per exact prompt and publish hints only. | Until edited, cards explicitly display general methods; no claim that all seven hints are tailored. |
| 21:00 | Recheck official content and save review status. | A review is not independent player verification or a promise that upstream data will never change. |

The reset page's `2026-11-23T05:00:00Z` field is the next-reset timestamp, not its datePublished. It remains unchanged. GSC is not a real-time daily-release acceptance signal; no repeated indexing requests are part of this table.

## Automatic content flow

1. Fetch `https://krillion.io/api/today`; validate date, dive, reset and seven distinct prompts.
2. Fetch `/api/reveal?date=YYYY-MM-DD`; validate exact IDs/text and tier/score consistency.
3. Select up to three examples per actually available tier; retain aliases. Missing tiers remain absent.
4. Save every actual today/reveal request in private R2: exact response body and URL/start/receive/status/error metadata, including unchanged content and HTTP/JSON errors. Network failures have metadata but no nonexistent response body.
5. Atomically publish a D1 revision. Lock and content hash prevent concurrent/unchanged publications.
6. Fetch the canonical production answer page on every due poll and confirm date, dive, revision and status. On new publication also check homepage, Hints and the dated archive. Save first site=ok / first ready site=ok independently from the legacy firstPublishedAt fetch-stage field. Article datePublished uses production evidence, not that legacy field.
7. Queue first production success / rollover / update / missed deadline / dedicated 15-minute timeout / mismatch / three failures / recovery notifications. The first-success email includes source-first-seen, production-first-check, elapsed seconds and current readiness status.

A later failure retains an existing correct same-day record. Invalid candidates are quarantined. Retries continue after fifteen minutes on later ticks, without blocking sleeps. R2 `polls/YYYY-MM-DD/<startedAt>/` stores `today.json`, `today.meta.json`, `reveal.json`/metadata when requested, `processed.json` for normalized content and `check.json` for outcome/page checks. On failures before normalization there is no processed candidate to fabricate. `dives/.../revision-N/` remains the immutable revision-level evidence. `reconcile/.../saved-prompts.json` is explicitly saved history, not an original today response. The page is deliberately not an exhaustive database.

## Daily editorial hints

Use Node 22. Official prompts and answer examples are automatic; tailored hints are editorial work and can be edited without touching scoring or rebuilding. General methods are labeled as such; the Hints page counts prepared hints and its metadata does not promise seven tailored clues. Never guess future prompts. Only actual in-game checks could establish player verification; the hint publisher cannot change that flag.

```bash
npm run content:export -- 2026-11-21
# Edit only prompts[i].hint in data/dives/2026-11-21.json
npm run content:publish-hints -- data/dives/2026-11-21.json
```

The publisher rereads live data, validates date/number/exact prompts, merges hints only and checks for concurrent updates. Answer/score/player-verification edits in the file are not published. Subsequent syncs preserve hints while prompt text is unchanged. Raw answer data is not regenerated with AI.

## Email notification activation

**Enabled on 2026-11-21.** The sending domain `krillion.tips` is enabled with configured DNS, the `EMAIL` binding is deployed, and recipient/sender addresses are stored in Cloudflare secrets. The first queued production notification was accepted by the provider at **22:34 Beijing**; actual inbox receipt still needs operator confirmation. Provider acceptance is not proof of inbox delivery or two-day reset acceptance.

To change or reconfigure delivery:

1. Obtain the operator's recipient email; do not infer it from the Cloudflare login.
2. Complete sending-domain setup in Cloudflare Email Service and destination verification if required by the account. Do not overwrite existing mail DNS blindly.
3. Retain the `send_email: [{name: "EMAIL"}]` binding in `wrangler.sync.jsonc`.
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

In the Cloudflare dashboard:

- Compute → Workers and Pages → `krillion-sync` → Settings / Cron Triggers: see the deployed schedule. Observability: see invocations and failures.
- Storage and Databases → D1 → `krillion-content` → Console: query `runs` for collection outcomes, `observations` for actual reset transitions, `outbox` for notification attempts/receipts, and `revisions` for published content history.
- Compute → Email Service → Email Sending → `krillion.tips` → Activity log: inspect provider delivery events.
- `/when-does-krillion-reset/`: public countdown, old/new source observations, old/first/first-ready production checks, latest content update and source-to-production elapsed seconds in Beijing time. Private full logs remain in D1/R2.

Emails report significant changes and failures; they are not the complete execution log. Unchanged hourly checks do not generate mail. Missing mail alone cannot prove the scheduler is healthy; check Worker/D1 logs separately.

```bash
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 execute krillion-content --remote --command "SELECT at,date,outcome,detail FROM runs ORDER BY id DESC LIMIT 10"
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 execute krillion-content --remote --command "SELECT * FROM observations ORDER BY date DESC LIMIT 3"
WRANGLER_LOG_PATH=/tmp/krillion-wrangler-logs npx wrangler d1 execute krillion-content --remote --command "SELECT event_key,sent_at,attempts,receipt FROM outbox ORDER BY created_at DESC LIMIT 10"
```

Do not bulk-backfill the previous 127 days before the two daily-reset acceptance windows pass.
