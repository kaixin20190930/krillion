# Krillion Tips

Static Astro site for verified daily Krillion answers, hints, strategy, and archives. Production target: Cloudflare Workers with static assets.

## Local development

```bash
npm install
npm run dev
```

## Add a new daily answer page

1. Copy `src/data/answers/2026-11-20.json` to `src/data/answers/YYYY-MM-DD.json`.
2. Replace the date, dive number, verification timestamp, reset timestamp, seven prompts, hints, and representative tier answers.
3. Keep one verified example for each displayed tier. Do not invent answers.
4. Run `npm run verify`.
5. Deploy with `npm run deploy`.

The home page, “answers today,” hints page, archive index, and sitemap automatically select the newest dated JSON file. Older files remain available as permanent archive pages.

## Cloudflare deployment

The deployment target is defined in `wrangler.jsonc`. The first deployment requires:

```bash
npx wrangler login
npm run deploy
```

The custom domains are `krillion.tips` and `www.krillion.tips`. The apex should be canonical; redirect `www` to the apex in Cloudflare Redirect Rules if both hostnames are enabled.

## Search Console

After DNS and HTTPS are active, add the Domain property `krillion.tips` in Google Search Console and submit:

```text
https://krillion.tips/sitemap.xml
```
