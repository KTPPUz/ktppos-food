import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
function run(command,args,options={}){const r=spawnSync(command,args,{stdio:'inherit',...options});if(r.status!==0)process.exit(r.status||1);}
run(process.execPath,['scripts/build-hostinger.mjs']);
const root=path.resolve('.artifacts/hostinger');
fs.rmSync(root,{recursive:true,force:true});fs.mkdirSync(root,{recursive:true});
const app=path.join(root,'laravel');
const excluded=new Set(['vendor','node_modules','.env','.git','tests','database.sqlite','database.sqlite-shm','database.sqlite-wal']);
fs.cpSync('backend',app,{recursive:true,filter:source=>{
 const relative=path.relative('backend',source),parts=relative.split(path.sep);
 if(parts.some(part=>excluded.has(part)||(part.startsWith('.env.')&&part!=='.env.example')||part.endsWith('.log')||part.startsWith('.phpunit')))return false;
 if(relative.startsWith('bootstrap/cache/')&&relative.endsWith('.php'))return false;
 if(relative.startsWith('storage/')&&!source.endsWith('.gitignore')&&fs.statSync(source).isFile())return false;
 return true;
}});
run('composer',['install','--no-dev','--prefer-dist','--optimize-autoloader','--no-interaction'],{cwd:app});
// Composer discovers packages in staging; never ship machine-specific caches.
for(const file of ['config.php','routes-v7.php'])fs.rmSync(path.join(app,'bootstrap/cache',file),{force:true});
const web=path.join(root,'public_html');fs.cpSync('backend/public',web,{recursive:true});
let index=fs.readFileSync(path.join(web,'index.php'),'utf8').replaceAll("__DIR__.'/../storage/","__DIR__.'/../laravel/storage/").replaceAll("__DIR__.'/../vendor/","__DIR__.'/../laravel/vendor/").replaceAll("__DIR__.'/../bootstrap/","__DIR__.'/../laravel/bootstrap/");
index=index.replace('$app->handleRequest',"$app->usePublicPath(__DIR__);\n\n$app->handleRequest");
fs.writeFileSync(path.join(web,'index.php'),index);
fs.copyFileSync('docs/HOSTINGER.md',path.join(root,'HOSTINGER.md'));
fs.rmSync(path.resolve('.artifacts/hostinger.zip'),{force:true});
run('zip',['-qr','../hostinger.zip','laravel','public_html','HOSTINGER.md'],{cwd:root});
console.log('Ready: .artifacts/hostinger.zip (no .env or customer database included).');
