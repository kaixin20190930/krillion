import { answerDays, latestDay } from '../data/answers';

const SITE_URL = 'https://krillion.tips';
const STATIC_CONTENT_UPDATED = '2026-11-21';

interface SitemapEntry {
  path: string;
  lastmod?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: '/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/about/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/how-to-play/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-1v1/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-answers-today/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-archive/', lastmod: latestDay.date },
  { path: '/krillion-hints/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-tiers/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-unlimited/', lastmod: STATIC_CONTENT_UPDATED },
];

const archiveEntries: SitemapEntry[] = answerDays.map((day) => ({
  path: `/krillion-archive/${day.date}/`,
  lastmod: day.date,
}));

const monthEntries: SitemapEntry[] = Array.from(
  new Set(answerDays.map((day) => day.date.slice(0, 7))),
).map((month) => ({
  path: `/krillion-archive/${month}/`,
  lastmod: answerDays.find((day) => day.date.startsWith(month))?.date,
}));

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export function buildSitemapXml() {
  const entries = [...staticEntries, ...monthEntries, ...archiveEntries];
  const urls = entries
    .map(({ path, lastmod }) => {
      const loc = `<loc>${escapeXml(new URL(path, SITE_URL).href)}</loc>`;
      const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
      return `<url>${loc}${modified}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
