import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve('.artifacts/hostinger'),app=path.join(root,'laravel');
if(!fs.existsSync(path.join(app,'vendor/autoload.php')))throw new Error('Run npm run package:hostinger first.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-hostinger-smoke-'));
const database=path.join(dir,'test.sqlite');fs.writeFileSync(database,'');
const env={...process.env,APP_ENV:'testing',APP_KEY:'base64:'+crypto.randomBytes(32).toString('base64'),DB_CONNECTION:'sqlite',DB_DATABASE:database,DB_URL:'',SESSION_DRIVER:'file',CACHE_STORE:'file',QUEUE_CONNECTION:'sync',BCRYPT_ROUNDS:'4'};
const php=env.PHP_BINARY||'php';let server,logs='';
function command(args){const r=spawnSync(php,['artisan',...args],{cwd:app,env,encoding:'utf8'});if(r.status!==0)throw new Error(r.stdout+r.stderr);}
try{
 for(const args of [['migrate','--force'],['pos:seed'],['config:cache'],['route:cache']])command(args);
 const web=path.join(root,'public_html');
 const router=path.join(dir,'router.php');
 fs.writeFileSync(router,`<?php\n$path=parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\nif($path!=='/' && is_file(${JSON.stringify(web)}.$path))return false;\nrequire ${JSON.stringify(path.join(web,'index.php'))};\n`);
 server=spawn(php,['-S','127.0.0.1:5192','-t',web,router],{env,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
 const base='http://127.0.0.1:5192';let ready=false;
 for(let i=0;i<50;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(ready,logs);
 const html=await fetch(base).then(r=>r.text());assert.match(html,/<title>KTP Table/);
 const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];assert.equal((await fetch(base+asset)).status,200);
 assert.equal((await fetch(base+'/order/legacy-token')).status,200);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'restaurant-u0',pin:'1234'})});
 assert.equal(login.status,200);const {token}=await login.json();
 assert.equal((await fetch(base+'/api/state',{headers:{Authorization:`Bearer ${token}`}})).status,200);
 assert.ok(!fs.existsSync(path.join(root,'public_html/.env')));
 assert.ok(!fs.existsSync(path.join(app,'.env')));
 console.log('Hostinger ZIP layout passed: PHP 8.3-compatible runtime, cached routes/config, HTML/assets, legacy QR route, login and POS state.');
}finally{
 if(server){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
 for(const file of ['config.php','routes-v7.php'])fs.rmSync(path.join(app,'bootstrap/cache',file),{force:true});
 fs.rmSync(dir,{recursive:true,force:true});
}
