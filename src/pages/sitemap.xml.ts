import type { APIRoute } from 'astro';
import { buildSitemapXml } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) =>
  new Response(await buildSitemapXml(locals.runtime.env), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
