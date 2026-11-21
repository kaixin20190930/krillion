import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { civilTime, contentFingerprint, etDate, type Dive } from '../src/lib/daily.ts';
const [mode, argument] = process.argv.slice(2);
if (!['export','publish-hints'].includes(mode)) throw new Error('Use content:export [YYYY-MM-DD] or content:publish-hints data/dives/YYYY-MM-DD.json');
const file = mode === 'publish-hints' ? resolve(argument ?? '') : '';
if (file && !file.startsWith(resolve('data/dives') + '/')) throw new Error('The content file must be inside data/dives/');
const edit: Dive | null = file ? JSON.parse(readFileSync(file,'utf8')) : null;
const date = edit?.date ?? argument ?? etDate();
civilTime(date);
const env = { ...process.env, WRANGLER_LOG_PATH: '/tmp/krillion-wrangler-logs' };
const wrangler = (args: string[]) => execFileSync('npx', ['wrangler',...args], {env,encoding:'utf8',maxBuffer:4*1024*1024});
const quote = (s: string) => `'${s.replaceAll("'","''")}'`;
const readLive = (): Dive => {
  const results = JSON.parse(wrangler(['d1','execute','krillion-content','--remote','--json','--command',`SELECT payload FROM dives WHERE date=${quote(date)}`]));
  if (!results[0]?.results[0]) throw new Error('No published dive for this date');
  return JSON.parse(results[0].results[0].payload);
};
const current = readLive();
if (edit) {
  if (edit.dive !== current.dive || edit.prompts.length !== 7 || edit.prompts.some((p,i)=>p.id!==current.prompts[i].id || p.text!==current.prompts[i].text)) throw new Error('Date/dive/prompt mismatch: export fresh data first');
  const prompts = current.prompts.map((p,i)=>{
    const hint=edit.prompts[i].hint;
    if (typeof hint!=='string' || !hint.trim() || hint.length>600) throw new Error('Each hint must be nonempty and at most 600 characters');
    return {...p,hint:hint.trim()};
  });
  const next = {...current,prompts,revision:current.revision+1,updatedAt:new Date().toISOString()};
  next.contentHash=await contentFingerprint(next);
  if (next.contentHash===current.contentHash) { console.log('No hint changes; not published.'); process.exit(0); }
  const scratch=mkdtempSync(join(tmpdir(),'krillion-content-'));
  try {
    const snapshot=join(scratch,'published.json');
    writeFileSync(snapshot,JSON.stringify(next,null,2));
    const rawKey=`edits/${date}/${next.contentHash}`;
    wrangler(['r2','object','put',`krillion-source/${rawKey}/published.json`,'--file',snapshot,'--remote']);
    const sql=join(scratch,'publish.sql');
    const payload=quote(JSON.stringify(next));
    writeFileSync(sql,`UPDATE dives SET revision=${next.revision},content_hash=${quote(next.contentHash)},payload=${payload},updated_at=${quote(next.updatedAt)} WHERE date=${quote(date)} AND revision=${current.revision} AND content_hash=${quote(current.contentHash)};\nINSERT OR IGNORE INTO revisions(date,revision,content_hash,raw_key,payload,created_at) SELECT ${quote(date)},${next.revision},${quote(next.contentHash)},${quote(rawKey)},${payload},${quote(next.updatedAt)} WHERE EXISTS(SELECT 1 FROM dives WHERE date=${quote(date)} AND revision=${next.revision} AND content_hash=${quote(next.contentHash)});`);
    wrangler(['d1','execute','krillion-content','--remote','--file',sql]);
    if (readLive().contentHash!==next.contentHash) throw new Error('Concurrent update detected: export fresh data and retry');
    writeFileSync(file,JSON.stringify(next,null,2)+'\n');
    console.log(`Published hints for ${date}, revision ${next.revision}. No site rebuild required.`);
  } finally { rmSync(scratch,{recursive:true,force:true}); }
} else {
  mkdirSync('data/dives',{recursive:true});
  const target=resolve('data/dives',`${date}.json`);
  writeFileSync(target,JSON.stringify(current,null,2)+'\n');
  console.log(`Exported ${date}, revision ${current.revision}, to ${target}`);
}
