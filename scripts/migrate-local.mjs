import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(new URL('../dist/server/wrangler.json',import.meta.url))) {
  console.error('Run npm run build before applying local migrations.'); process.exit(1);
}
const files = readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
function run(sql, json=false) {
  const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql,...(json?['--json']:[])],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
  if(result.error||result.status!==0){console.error(result.stderr||result.error||result.stdout);process.exit(1);} return result.stdout;
}
run('CREATE TABLE IF NOT EXISTS memory_room_local_migrations (name TEXT PRIMARY KEY NOT NULL)');
const results=JSON.parse(run('SELECT name FROM memory_room_local_migrations',true));
const applied=new Set(results.flatMap(r=>r.results||[]).map(r=>r.name));
for(const file of files){
  if(applied.has(file))continue;
  const sql=readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8');
  const literal=file.replaceAll("'","''");
  // Wrangler D1 local execution wraps multi-statement commands in a transaction.
  run(`${sql}\nINSERT INTO memory_room_local_migrations (name) VALUES ('${literal}');`);
  console.log(`Applied ${file}`);
}
console.log('Local database is ready.');
