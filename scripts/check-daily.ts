import assert from 'node:assert/strict';
import { etDate, diveNumber, resetAt, pendingDive, dailyView, GENERIC_HINT } from '../src/lib/daily.ts';
import { validateToday, normalizeReveal, pollIsDue, needsTimeoutAlert, run } from '../workers/sync.ts';
assert.equal(etDate(new Date('2026-11-21T04:59:59Z')), '2026-11-20');
assert.equal(etDate(new Date('2026-11-21T05:00:00Z')), '2026-11-21');
assert.equal(diveNumber('2026-07-16'), 1);
assert.equal(diveNumber('2026-11-21'), 129);
assert.equal(resetAt('2026-03-07'), '2026-03-08T05:00:00.000Z');
assert.equal(resetAt('2026-03-08'), '2026-03-09T04:00:00.000Z');
assert.equal(resetAt('2026-10-31'), '2026-11-01T04:00:00.000Z');
assert.equal(resetAt('2026-11-01'), '2026-11-02T05:00:00.000Z');
const today = {date:'2026-11-21',dayNumber:129,resetsAt:resetAt('2026-11-21'),prompts:Array.from({length:7},(_,i)=>({id:`p${i+1}`,text:`Prompt ${i+1}`}))};
validateToday(today, today.date);
validateToday({...today,dayNumber:130}, today.date); // Official observed number takes priority.
assert.throws(()=>validateToday({...today,dayNumber:0}, today.date));
assert.throws(()=>validateToday({...today,date:'2026-11-20'}, today.date));
assert.throws(()=>normalizeReveal(today,{date:today.date,prompts:today.prompts.map(p=>({...p,text:'wrong',answers:[]}))},null));
assert.equal(pendingDive('2026-11-23').dive, null);
assert.deepEqual(pendingDive('2026-11-23').prompts, []);
assert.equal(normalizeReveal(today,{date:today.date,prompts:today.prompts.map(p=>({...p,answers:[]}))},null)[0].hint, GENERIC_HINT);
const last = Date.parse('2026-11-23T04:40:00Z');
for (const at of ['04:45','04:55','04:59','05:00','05:05','05:15','05:20']) assert.equal(pollIsDue(new Date(`2026-11-23T${at}:00Z`),last,0), true);
assert.equal(pollIsDue(new Date('2026-11-23T05:25:00Z'),last,3), false);
assert.equal(pollIsDue(new Date('2026-11-23T05:30:00Z'),last,3), true);
assert.equal(needsTimeoutAlert(15,'pending',false), true);
assert.equal(needsTimeoutAlert(15,'partial',true), true);
assert.equal(needsTimeoutAlert(15,'ready',false), true);
assert.equal(needsTimeoutAlert(15,'ready',true), false);

// One isolated failure-path check: no production writes or real emails.
const state = new Map<string,string>();
const raw = new Map<string,string>();
const events: string[] = [];
const statements = (sql:string) => {
  let values:unknown[]=[];
  return {
    bind(...args:unknown[]) { values=args; return this; },
    async first<T>() { return (sql.includes('FROM state') && state.has(String(values[0])) ? {value:state.get(String(values[0]))} : null) as T|null; },
    async all<T>() { return {results:[] as T[]}; },
    async run() {
      if (sql.startsWith('INSERT INTO state')) state.set(String(values[0]),String(values[1]));
      if (sql.startsWith('INSERT OR IGNORE INTO outbox')) events.push(String(values[0]));
      return {meta:{changes:1}};
    }
  };
};
const env = {CONTENT:{prepare:statements,async batch(){return undefined;}},RAW:{async put(key:string,value:string){raw.set(key,value);}},SITE_URL:'https://krillion.tips'};
const view = await dailyView(env,new Date('2026-11-23T05:15:00Z'));
assert.equal(view.date,'2026-11-23'); assert.equal(view.dayNumber,null); assert.equal(view.prompts.length,0);
const savedFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => String(url).includes('krillion.io') ? new Response('{"error":"not ready"}',{status:503}) : new Response('<p data-date="2026-11-23" data-revision="0" data-status="pending">waiting</p>');
  await run(env,new Date('2026-11-23T05:15:00Z'));
} finally { globalThis.fetch=savedFetch; }
assert(events.includes('timeout15:2026-11-23'));
assert([...raw].some(([key,value])=>key.endsWith('/today.json') && value==='{"error":"not ready"}'));
assert([...raw].some(([key,value])=>key.endsWith('/check.json') && JSON.parse(value).outcome==='failed'));
console.log('Date/DST, official numbering, general hints, polling, pending and 15-minute failure evidence checks passed.');
