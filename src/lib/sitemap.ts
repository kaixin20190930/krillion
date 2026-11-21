import { listDives, type SiteEnv } from './daily';

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
  { path: '/krillion-archive/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-hints/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-tiers/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/krillion-unlimited/', lastmod: STATIC_CONTENT_UPDATED },
  { path: '/when-does-krillion-reset/', lastmod: STATIC_CONTENT_UPDATED },
];

const archiveEntriesFor = (answerDays: Awaited<ReturnType<typeof listDives>>): SitemapEntry[] => answerDays.map((day) => ({
  path: `/krillion-archive/${day.date}/`,
  lastmod: day.updatedAt,
}));

const monthEntriesFor = (answerDays: Awaited<ReturnType<typeof listDives>>): SitemapEntry[] => Array.from(
  new Set(answerDays.map((day) => day.date.slice(0, 7))),
).map((month) => ({
  path: `/krillion-archive/${month}/`,
  lastmod: answerDays.filter(day=>day.date.startsWith(month)).reduce((max,day)=>day.updatedAt>max?day.updatedAt:max,STATIC_CONTENT_UPDATED),
}));

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export async function buildSitemapXml(env: SiteEnv) {
  const answerDays = await listDives(env);
  const updated = answerDays.reduce((max,day)=>day.updatedAt>max?day.updatedAt:max,STATIC_CONTENT_UPDATED);
  const dynamic = new Set(['/', '/krillion-answers-today/', '/krillion-hints/', '/krillion-archive/']);
  const entries = [...staticEntries.map(entry=>dynamic.has(entry.path)?{...entry,lastmod:updated}:entry), ...monthEntriesFor(answerDays), ...archiveEntriesFor(answerDays)];
  const urls = entries
    .map(({ path, lastmod }) => {
      const loc = `<loc>${escapeXml(new URL(path, SITE_URL).href)}</loc>`;
      const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
      return `<url>${loc}${modified}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
