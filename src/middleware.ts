import { defineMiddleware } from 'astro:middleware';
import { etDate, resetAt } from './lib/daily';
export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;
  const edge = typeof caches !== 'undefined' ? (caches as CacheStorage & { default?: Cache }).default : undefined;
  const canCache = env?.CONTENT && edge && context.request.method === 'GET' && !context.url.search && context.url.pathname !== '/when-does-krillion-reset/';
  const date = etDate();
  let cacheKey: Request | undefined;
  if (canCache) {
    const head = await env.CONTENT.prepare('SELECT MAX(updated_at) AS revision FROM dives').first<{revision: string}>();
    const key = new URL(context.url);
    key.searchParams.set('__date', date);
    key.searchParams.set('__code', '2026-11-23-evidence');
    key.searchParams.set('__revision', head?.revision ?? 'pending');
    cacheKey = new Request(key.href);
    const hit = await edge.match(cacheKey);
    if (hit) return hit;
  }
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // SSR reads live D1 data; do not rely on static-asset _headers for these routes.
  response.headers.set('Cache-Control', 'no-store');
  if (cacheKey && edge && response.status === 200) {
    const html = await response.clone().text();
    if (!html.includes('data-status="pending"') && !html.includes('data-status="prompts_ready"')) {
      const historical = context.url.pathname.startsWith('/krillion-archive/');
      const ttl = historical ? 86400 : Math.max(1, Math.min(60, Math.floor((Date.parse(resetAt(date)) - Date.now()) / 1000)));
      response.headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}`);
      context.locals.runtime.ctx.waitUntil(edge.put(cacheKey, response.clone()));
    }
  }
  return response;
});
