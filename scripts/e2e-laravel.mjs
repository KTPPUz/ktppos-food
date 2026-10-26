import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-laravel-e2e-'));
const database=path.join(dir,'test.sqlite');fs.writeFileSync(database,'');
const env={...process.env,APP_ENV:'testing',APP_DEBUG:'false',DB_CONNECTION:'sqlite',DB_DATABASE:database,DB_URL:'',BCRYPT_ROUNDS:'4',PHP_API_PORT:'5198'};
for(const args of [['migrate','--force'],['pos:seed']]){
 const r=spawnSync(env.PHP_BINARY||'php',['artisan',...args],{cwd:path.resolve('backend'),env,stdio:'inherit'});
 if(r.status!==0){fs.rmSync(dir,{recursive:true,force:true});process.exit(r.status||1);}
}
const child=spawn(process.execPath,['scripts/dev-laravel.mjs'],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.on('exit',code=>{fs.rmSync(dir,{recursive:true,force:true});process.exit(code||0);});
