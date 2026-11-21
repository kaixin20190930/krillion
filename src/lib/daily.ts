export interface AnswerExample { tier: string; answer: string; score: number; aliases?: string[] }
export interface Prompt { id: string; text: string; hint: string; answers: AnswerExample[] }
export interface Dive {
  date: string; dive: number; resetsAt: string;
  status: 'pending' | 'prompts_ready' | 'partial' | 'ready';
  prompts: Prompt[]; source: string; fetchedAt: string; lastCheckedAt: string;
  firstPublishedAt: string; updatedAt: string; revision: number; contentHash: string;
  sourceHash?: string;
  verification: { endpointConsistent: boolean; playerVerified: boolean };
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> }
export interface SiteEnv { CONTENT: Database }
export const TIER_SCORES: Record<string, number> = { krillion: 100, deepcut: 85, rare: 60, schooler: 30, tooclever: 15, plankton: 10 };
const dayMs = 86_400_000;
export function civilTime(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid civil date');
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new Error('Invalid civil date');
  return value;
}
export function etDate(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => p.find(item => item.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const diveNumber = (date: string) => Math.round((civilTime(date) - civilTime('2026-07-16')) / dayMs) + 1;
export const displayDate = (date: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(civilTime(date)));
export function resetAt(date: string) {
  const target = civilTime(date) + dayMs;
  let guess = target + 5 * 3_600_000;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const get = (key: string) => Number(parts.find(p => p.type === key)!.value);
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    guess += target - local;
  }
  return new Date(guess).toISOString();
}
export function pendingDive(date: string): Dive {
  return { date, dive: diveNumber(date), resetsAt: resetAt(date), status: 'pending', prompts: [], source: '', fetchedAt: '', lastCheckedAt: '', firstPublishedAt: '', updatedAt: '', revision: 0, contentHash: '', verification: { endpointConsistent: false, playerVerified: false } };
}
export async function getDive(env: SiteEnv, date: string): Promise<Dive | null> {
  const row = await env.CONTENT.prepare('SELECT payload, last_checked_at FROM dives WHERE date=?').bind(date).first<{payload: string; last_checked_at: string}>();
  return row ? { ...JSON.parse(row.payload), lastCheckedAt: row.last_checked_at } : null;
}
export async function listDives(env: SiteEnv): Promise<Dive[]> {
  const { results } = await env.CONTENT.prepare('SELECT payload FROM dives ORDER BY date DESC').all<{payload: string}>();
  return results.map(row => JSON.parse(row.payload));
}
export async function dailyView(env: SiteEnv, now = new Date()) {
  const date = etDate(now);
  const data = await getDive(env, date) ?? pendingDive(date);
  return { ...data, displayDate: displayDate(date), dayNumber: diveNumber(date) };
}
export function statusText(status: Dive['status']) {
  return { pending: 'Today’s dive is awaiting live data. No yesterday answers are shown as today.', prompts_ready: 'Today’s prompts are ready; answer examples are being collected.', partial: 'Some answer examples are ready. More will be added as the reveal data becomes available.', ready: 'Examples retrieved from Krillion’s public reveal endpoint. Not independently player-verified.' }[status];
}
export async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export const contentFingerprint = (data: Pick<Dive, 'date' | 'dive' | 'prompts' | 'sourceHash' | 'status'>) => digest(JSON.stringify({ date: data.date, dive: data.dive, prompts: data.prompts, sourceHash: data.sourceHash ?? '', status: data.status }));
