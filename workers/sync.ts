import { civilTime, contentFingerprint, digest, diveNumber, etDate, GENERIC_HINT, getDive, hintIsTailored, pendingDive, resetAt, TIER_SCORES, type Dive, type Prompt, type SiteEnv } from '../src/lib/daily.ts';

interface Env extends SiteEnv {
  RAW: { put(key: string, value: string, options?: { httpMetadata: { contentType: string } }): Promise<unknown> };
  EMAIL?: { send(message: { to: string; from: string; subject: string; text: string }): Promise<{ messageId: string }> };
  NOTIFY_TO?: string; NOTIFY_FROM?: string; SITE_URL: string;
}
interface Today { date: string; dayNumber: number; resetsAt: string; prompts: {id: string; text: string}[] }
interface Reveal { date: string; prompts: {id: string; text: string; answers: {answer: string; aliases?: string[]; tier: string; score: number}[]}[] }
const base = 'https://krillion.io';
const iso = () => new Date().toISOString();
async function getState<T>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.CONTENT.prepare('SELECT value FROM state WHERE key=?').bind(key).first<{ value: string }>();
  return row ? JSON.parse(row.value) : fallback;
}
async function setState(env: Env, key: string, value: unknown) {
  await env.CONTENT.prepare('INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, JSON.stringify(value)).run();
}
async function enqueue(env: Env, key: string, subject: string, body: string) {
  await env.CONTENT.prepare('INSERT OR IGNORE INTO outbox(event_key,subject,body,created_at) VALUES (?,?,?,?)').bind(key, `Krillion: ${subject}`, `${body}\n\n${env.SITE_URL}/krillion-answers-today/`, iso()).run();
}
async function sendNotifications(env: Env) {
  if (!env.EMAIL || !env.NOTIFY_TO || !env.NOTIFY_FROM) return;
  const { results } = await env.CONTENT.prepare("SELECT event_key,subject,body FROM outbox WHERE sent_at IS NULL AND attempts<8 AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') AND (last_attempt IS NULL OR last_attempt<strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')) ORDER BY created_at LIMIT 3").all<{event_key: string; subject: string; body: string}>();
  for (const item of results) {
    const claimed = await env.CONTENT.prepare("UPDATE outbox SET attempts=attempts+1,last_attempt=? WHERE event_key=? AND sent_at IS NULL AND (last_attempt IS NULL OR last_attempt<strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes'))").bind(iso(), item.event_key).run();
    if (!claimed.meta.changes) continue;
    try {
      const receipt = await env.EMAIL.send({ to: env.NOTIFY_TO, from: env.NOTIFY_FROM, subject: item.subject, text: item.body });
      await env.CONTENT.prepare('UPDATE outbox SET sent_at=?,receipt=? WHERE event_key=?').bind(iso(), receipt.messageId, item.event_key).run();
    } catch (error) { console.error('Email notification failed', String(error)); }
  }
}
async function fetchJson<T>(env: Env, url: string, key: string): Promise<{ data: T; raw: string; fetchedAt: string }> {
  const meta: { url: string; startedAt: string; receivedAt?: string; status?: number; error?: string } = { url, startedAt: iso() };
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'KrillionTips/1.0 (independent daily guide)', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
    const raw = await response.text();
    meta.receivedAt = iso(); meta.status = response.status;
    // Retain the exact body even for HTTP errors, invalid JSON and unchanged content.
    await env.RAW.put(`${key}.json`, raw, { httpMetadata: { contentType: response.headers.get('content-type') ?? 'application/octet-stream' } });
    if (!response.ok) throw new Error(`Upstream ${response.status}: ${new URL(url).pathname}`);
    return { data: JSON.parse(raw), raw, fetchedAt: meta.receivedAt };
  } catch (error) { meta.error = String(error); throw error; }
  finally { await env.RAW.put(`${key}.meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } }); }
}
export function validateToday(today: Today, expectedDate: string) {
  civilTime(today.date);
  if (today.date !== expectedDate || !Number.isSafeInteger(today.dayNumber) || today.dayNumber < 1) throw new Error('MISMATCH: official date or invalid dive number');
  if (today.resetsAt !== resetAt(expectedDate)) throw new Error('MISMATCH: official reset timestamp');
  if (!Array.isArray(today.prompts) || today.prompts.length !== 7 || new Set(today.prompts.map(p => p.id)).size !== 7 || today.prompts.some(p => !p.id || typeof p.text !== 'string' || !p.text.trim())) throw new Error('MISMATCH: seven distinct prompts required');
}
export function normalizeReveal(today: Today, reveal: Reveal, previous: Dive | null): Prompt[] {
  if (reveal.date !== today.date || !Array.isArray(reveal.prompts) || reveal.prompts.length !== 7 || new Set(reveal.prompts.map(p => p.id)).size !== 7) throw new Error('MISMATCH: reveal date or prompt set');
  return today.prompts.map(prompt => {
    const source = reveal.prompts.find(p => p.id === prompt.id);
    if (!source || source.text !== prompt.text || !Array.isArray(source.answers)) throw new Error('MISMATCH: reveal prompt wording');
    for (const answer of source.answers) {
      if (!answer.answer || !(answer.tier in TIER_SCORES) || answer.score !== TIER_SCORES[answer.tier] || (answer.aliases && (!Array.isArray(answer.aliases) || answer.aliases.some(a => typeof a !== 'string')))) throw new Error('MISMATCH: answer tier or score');
    }
    const answers = Object.keys(TIER_SCORES).flatMap(tier => source.answers.filter(a => a.tier === tier)
      .sort((a, b) => Number(!/^[A-Za-z]/.test(a.answer)) - Number(!/^[A-Za-z]/.test(b.answer)) || a.answer.localeCompare(b.answer, 'en'))
      .slice(0, 3).map(a => ({ answer: a.answer, tier: a.tier, score: a.score, aliases: (a.aliases ?? []).slice(0, 5) })));
    const oldHint = previous?.prompts.find(p => p.id === prompt.id && p.text === prompt.text)?.hint;
    const hint = oldHint && hintIsTailored(oldHint) ? oldHint : GENERIC_HINT;
    return { ...prompt, hint, answers };
  });
}
async function publish(env: Env, today: Today, todayRaw: string, previous: Dive | null, pollKey: string, fetchedAt = iso()) {
  let revealRaw = '', sourceHash = '', revealError = '';
  let prompts: Prompt[] = today.prompts.map(p => ({ ...p, hint: previous?.prompts.find(old => old.id === p.id && old.text === p.text && hintIsTailored(old.hint))?.hint ?? GENERIC_HINT, answers: [] }));
  try {
    const reveal = await fetchJson<Reveal>(env, `${base}/api/reveal?date=${today.date}`, `${pollKey}/reveal`);
    revealRaw = reveal.raw;
    prompts = normalizeReveal(today, reveal.data, previous);
    sourceHash = await digest(revealRaw);
  } catch (error) {
    revealError = String(error);
    if (revealError.includes('MISMATCH')) {
      await env.RAW.put(`quarantine/${today.date}/${fetchedAt}.json`, JSON.stringify({ today: todayRaw, reveal: revealRaw, error: revealError }));
      throw error;
    }
    if (previous && ['partial', 'ready'].includes(previous.status)) throw error;
  }
  const answerPrompts = prompts.filter(p => p.answers.length).length;
  const status: Dive['status'] = answerPrompts === 7 ? 'ready' : answerPrompts > 0 ? 'partial' : 'prompts_ready';
  const contentHash = await contentFingerprint({ date: today.date, dive: today.dayNumber, prompts, sourceHash, status });
  if (contentHash === previous?.contentHash) {
    await env.CONTENT.prepare('UPDATE dives SET last_checked_at=? WHERE date=?').bind(fetchedAt, today.date).run();
    await env.RAW.put(`${pollKey}/processed.json`, JSON.stringify({ ...previous, lastCheckedAt: fetchedAt }));
    return { changed: false, data: previous, revealError };
  }
  const data: Dive = { ...pendingDive(today.date), dive: today.dayNumber, resetsAt: today.resetsAt, status, prompts, sourceHash, source: revealRaw ? `${base}/api/reveal?date=${today.date}` : `${base}/api/today`, fetchedAt, lastCheckedAt: fetchedAt, firstPublishedAt: previous?.firstPublishedAt ?? fetchedAt, updatedAt: iso(), revision: (previous?.revision ?? 0) + 1, contentHash, verification: { endpointConsistent: Boolean(revealRaw), playerVerified: false } };
  const rawKey = `dives/${today.date}/revision-${data.revision}`;
  await env.RAW.put(`${rawKey}/today.json`, todayRaw, { httpMetadata: { contentType: 'application/json' } });
  if (revealRaw) await env.RAW.put(`${rawKey}/reveal.json`, revealRaw, { httpMetadata: { contentType: 'application/json' } });
  await env.RAW.put(`${rawKey}/published.json`, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
  await env.CONTENT.batch([
    env.CONTENT.prepare('INSERT INTO revisions(date,revision,content_hash,raw_key,payload,created_at) VALUES (?,?,?,?,?,?)').bind(data.date, data.revision, contentHash, rawKey, JSON.stringify(data), data.updatedAt),
    env.CONTENT.prepare('INSERT INTO dives(date,dive,revision,content_hash,payload,updated_at,last_checked_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET dive=excluded.dive,revision=excluded.revision,content_hash=excluded.content_hash,payload=excluded.payload,updated_at=excluded.updated_at,last_checked_at=excluded.last_checked_at').bind(data.date, data.dive, data.revision, contentHash, JSON.stringify(data), data.updatedAt, fetchedAt),
  ]);
  await env.RAW.put(`${pollKey}/processed.json`, JSON.stringify(data));
  return { changed: true, data, revealError };
}
async function verifySite(env: Env, data: Dive, allPages = false) {
  const paths = allPages ? ['/krillion-answers-today/', '/', '/krillion-hints/', `/krillion-archive/${data.date}/`] : ['/krillion-answers-today/'];
  const pages: { path: string; status: number; checkedAt: string }[] = [];
  for (const path of paths) {
    // Check the canonical public URL, including its normal cache path.
    const response = await fetch(`${env.SITE_URL}${path}`, { signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok || !html.includes(`data-date="${data.date}"`) || (data.dive !== null && !html.includes(`data-dive="${data.dive}"`)) || !html.includes(`data-revision="${data.revision}"`) || !html.includes(`data-status="${data.status}"`) || (data.status === 'pending' && html.includes('class="card answer-card"'))) throw new Error(`Production page date/dive/revision/status check failed: ${path}`);
    pages.push({ path, status: response.status, checkedAt: iso() });
  }
  return { checkedAt: pages[0].checkedAt, pages };
}
async function reconcile(env: Env, now: Date) {
  for (let ago = 1; ago <= 7; ago++) {
    const date = new Date(civilTime(etDate(now)) - ago * 86400000).toISOString().slice(0, 10);
    const saved = await getDive(env, date);
    if (!saved) continue; // No fabricated/backfilled history.
    if (saved.dive === null) continue;
    const today = { date, dayNumber: saved.dive, resetsAt: saved.resetsAt, prompts: saved.prompts.map(p => ({ id: p.id, text: p.text })) };
    const pollKey = `reconcile/${date}/${iso()}`;
    await env.RAW.put(`${pollKey}/saved-prompts.json`, JSON.stringify(today));
    const result = await publish(env, today, JSON.stringify(today), saved, pollKey);
    if (result.changed) await enqueue(env, `correction:${date}:${result.data.revision}`, '存档修正', `${date} / Dive #${saved.dive} 的上游数据有变化，已更新至版本 ${result.data.revision}。`);
  }
}
export function pollIsDue(now: Date, last: number, failuresBefore: number) {
  const date = etDate(now);
  const sinceReset = (now.getTime() - Date.parse(resetAt(new Date(civilTime(date) - 86400000).toISOString().slice(0, 10)))) / 60000;
  const untilReset = (Date.parse(resetAt(date)) - now.getTime()) / 60000;
  const beijing = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const retry = failuresBefore > 0 && (failuresBefore < 3 || now.getUTCMinutes() % 10 === 0);
  return now.getTime() - last >= 45000 && (retry || !last || untilReset <= 5 || sinceReset <= 15 || (sinceReset <= 120 && now.getUTCMinutes() % 10 === 0) || Math.abs(untilReset - 15) < 1 || now.getUTCMinutes() === 17 || beijing === '21:00' || (beijing === '21:30' && now.getUTCDay() === 0));
}
export const needsTimeoutAlert = (sinceReset: number, status: Dive['status'], siteVerified: boolean) => sinceReset >= 15 && (status !== 'ready' || !siteVerified);
export async function run(env: Env, now: Date) {
  const date = etDate(now);
  const start = Date.parse(resetAt(new Date(civilTime(date) - 86400000).toISOString().slice(0, 10)));
  const sinceReset = (now.getTime() - start) / 60000;
  const beijing = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const weekly = beijing === '21:30' && new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(now) === 'Sun';
  const daily = beijing === '21:00';
  const last = await getState<number>(env, 'last_poll', 0);
  const failuresBefore = await getState<number>(env, 'failures', 0);
  if (!pollIsDue(now, last, failuresBefore)) { await sendNotifications(env); return; }
  const lock = await env.CONTENT.prepare("INSERT INTO locks(name,expires) VALUES ('sync',?) ON CONFLICT(name) DO UPDATE SET expires=excluded.expires WHERE locks.expires<?").bind(now.getTime() + 180000, now.getTime()).run();
  if (!lock.meta.changes) return;
  await setState(env, 'last_poll', now.getTime());
  const pollKey = `polls/${date}/${iso()}`;
  const report: { scheduledAt: string; startedAt: string; finishedAt?: string; outcome?: string; error?: string; pages?: unknown; revision?: number; siteOk?: boolean } = { scheduledAt: now.toISOString(), startedAt: iso() };
  try {
    const result = await fetchJson<Today>(env, `${base}/api/today`, `${pollKey}/today`);
    // Save a valid old-dive observation even if the source has not rolled over yet.
    validateToday(result.data, result.data.date);
    const prior = await getState<{ date: string; seenAt: string } | null>(env, 'last_official', null);
    if (result.data.date < date) {
      await setState(env, 'last_official', { date: result.data.date, seenAt: result.fetchedAt });
      await env.CONTENT.prepare('UPDATE observations SET prior_seen=? WHERE date=? AND first_seen>?').bind(result.fetchedAt, date, result.fetchedAt).run();
    }
    try { validateToday(result.data, date); } catch (error) {
      await env.RAW.put(`quarantine/${date}/${iso()}-today.json`, result.raw);
      throw error;
    }
    if (prior?.date !== date) {
      const priorSite = prior ? await env.CONTENT.prepare('SELECT last_site_ok FROM observations WHERE date=?').bind(prior.date).first<{last_site_ok:string|null}>() : null;
      await env.CONTENT.prepare('INSERT OR IGNORE INTO observations(date,dive,first_seen,prior_seen,scheduled_reset,prior_site_ok) VALUES (?,?,?,?,?,?)').bind(date, result.data.dayNumber, result.fetchedAt, prior?.seenAt ?? null, new Date(start).toISOString(), priorSite?.last_site_ok ?? null).run();
      if (prior) await enqueue(env, `rollover:${date}`, '新一期已发现', `${date} / Dive #${result.data.dayNumber} 已由官方接口返回。`);
    }
    await setState(env, 'last_official', { date, seenAt: result.fetchedAt });
    await env.CONTENT.prepare('UPDATE observations SET dive=? WHERE date=?').bind(result.data.dayNumber, date).run();
    if (result.data.dayNumber !== diveNumber(date)) await env.CONTENT.prepare('INSERT INTO runs(at,date,outcome,detail) VALUES (?,?,?,?)').bind(iso(), date, 'official_number', `observed=${result.data.dayNumber};estimated=${diveNumber(date)};official used`).run();
    const previous = await getDive(env, date);
    const published = await publish(env, result.data, result.raw, previous, pollKey, result.fetchedAt);
    // Retry a failed end-to-end check on the next due poll, even if content is unchanged.
    const checked = await getState<string>(env, 'checked_version', '');
    const site = await verifySite(env, published.data, published.changed || checked.split(':')[0] !== date);
    report.pages = site.pages; report.revision = published.data.revision; report.siteOk = true;
    await env.CONTENT.prepare('UPDATE observations SET first_site_ok=COALESCE(first_site_ok,?),first_ready_site_ok=CASE WHEN ?=\'ready\' THEN COALESCE(first_ready_site_ok,?) ELSE first_ready_site_ok END,last_site_ok=? WHERE date=?').bind(site.checkedAt, published.data.status, site.checkedAt, site.checkedAt, date).run();
    await env.CONTENT.prepare('INSERT INTO runs(at,date,outcome,detail) VALUES (?,?,?,?)').bind(site.checkedAt, date, published.changed ? 'published' : 'unchanged', `revision=${published.data.revision};status=${published.data.status};site=ok;raw=${pollKey}`).run();
    if (checked !== `${date}:${published.data.revision}`) {
      await setState(env, 'checked_version', `${date}:${published.data.revision}`);
      if (!previous || checked.split(':')[0] !== date) {
        const evidence = await env.CONTENT.prepare('SELECT first_seen,first_site_ok FROM observations WHERE date=?').bind(date).first<{first_seen:string;first_site_ok:string}>();
        const seconds = evidence ? (Date.parse(evidence.first_site_ok) - Date.parse(evidence.first_seen)) / 1000 : null;
        await enqueue(env, `first:${date}`, '首版生产页核验成功', `${date} / Dive #${published.data.dive}，状态 ${published.data.status}，版本 ${published.data.revision}。官方首次发现：${evidence?.first_seen ?? '未记录'}；生产首验：${evidence?.first_site_ok ?? site.checkedAt}；间隔：${seconds ?? '未知'} 秒。5 分钟时效：${seconds !== null && seconds >= 0 && seconds <= 300 ? '达标' : '待核实/超时'}。已核对首页、答案、Hints 和当天归档；未宣称真人验分。`);
      }
      else if (published.changed) await enqueue(env, `update:${date}:${published.data.revision}`, '答案更新', `${date} 已更新至 ${published.data.status}，版本 ${published.data.revision}。`);
    }
    if (sinceReset >= 5 && published.data.status !== 'ready') await enqueue(env, `deadline:${date}`, '首发答案尚未齐备', `${date} / Dive #${published.data.dive} 已超过重置后 5 分钟，当前为 ${published.data.status}，不会显示昨日答案冒充今日。`);
    if (published.revealError) throw new Error(published.revealError);
    const failures = await getState<number>(env, 'failures', 0);
    if (failures >= 3) await enqueue(env, `recovery:${date}:${now.getTime()}`, '更新恢复', `${date} 的接口采集与生产页检查已恢复。`);
    await setState(env, 'failures', 0);
    report.outcome = published.changed ? 'published' : 'unchanged';
    if (daily) {
      await setState(env, 'last_daily_review', { at: iso(), date, status: published.data.status, playerVerified: false });
      await env.CONTENT.prepare("DELETE FROM runs WHERE at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')").run();
    }
    if (weekly) { await reconcile(env, now); await setState(env, 'last_weekly_review', iso()); }
  } catch (error) {
    report.outcome = 'failed'; report.error = String(error);
    if (!report.siteOk) {
      try {
        const current = await getDive(env, date) ?? pendingDive(date);
        report.pages = (await verifySite(env, current)).pages;
      } catch (pageError) { report.error += `;fallback=${String(pageError)}`; }
    }
    const count = (await getState<number>(env, 'failures', 0)) + 1;
    await setState(env, 'failures', count);
    await env.CONTENT.prepare('INSERT INTO runs(at,date,outcome,detail) VALUES (?,?,?,?)').bind(iso(), date, 'failed', `${report.error};raw=${pollKey}`).run();
    if (count === 3 || String(error).includes('MISMATCH')) await enqueue(env, `error:${date}:${Math.floor(now.getTime() / 10800000)}`, '更新异常', `${date} 连续失败 ${count} 次：${String(error)}。已保留已有正确数据；异常候选不会上线。`);
    if (sinceReset >= 5 && !(await getDive(env, date))) await enqueue(env, `deadline:${date}`, '今日数据尚未发布', `${date} 已超过重置后 5 分钟，但仍未取得通过校验的今日数据。页面保持 pending，编号等待官方，不以昨日答案替代。`);
    console.error(String(error));
  } finally {
    try {
      const current = await getDive(env, date);
      const siteVerified = current !== null && await getState<string>(env, 'checked_version', '') === `${date}:${current.revision}`;
      if (needsTimeoutAlert(sinceReset, current?.status ?? 'pending', siteVerified)) {
        await enqueue(env, `timeout15:${date}`, '重置后 15 分钟仍未就绪', `${date} 当前状态：${current?.status ?? 'pending'}；生产版本核验：${siteVerified ? '通过' : '未通过'}。任务不会停止，仍按重试计划采集。最近检查：${pollKey}；请查 D1 runs/outbox 与 R2 原始响应。`);
      }
      report.finishedAt = iso();
      await env.RAW.put(`${pollKey}/check.json`, JSON.stringify(report));
      await sendNotifications(env);
    } finally { await env.CONTENT.prepare("DELETE FROM locks WHERE name='sync'").run(); }
  }
}
export default {
  fetch() { return new Response('Krillion daily sync. Scheduled execution only.\n'); },
  scheduled(event: { scheduledTime: number }, env: Env, ctx: { waitUntil(task: Promise<unknown>): void }) { ctx.waitUntil(run(env, new Date(event.scheduledTime))); },
};
