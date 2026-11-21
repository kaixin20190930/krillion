import type { Runtime } from '@astrojs/cloudflare';
import type { SiteEnv } from './lib/daily';
declare global {
  namespace App { interface Locals extends Runtime<SiteEnv> {} }
}
export {};
