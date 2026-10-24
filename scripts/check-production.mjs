import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ktp-production-'));
const base='http://127.0.0.1:5192';
let child,logs='';
async function start(){
  logs='';
  child=spawn(process.execPath,['server/index.mjs','--production'],{env:{...process.env,NODE_ENV:'production',PORT:'5192',HOST:'127.0.0.1',DATA_DIR:dataDir,TRUST_PROXY:'1',CUSTOMER_BASE_URL:'https://ktppuz.github.io/ktppos-food/',CORS_ALLOWED_ORIGINS:'https://ktppuz.github.io'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw new Error('Production server exited: '+logs);
    if(logs.includes('KTP Table POS →'))try{const r=await fetch(base+'/healthz');if(r.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Production health check timed out: '+logs);
}
async function stop(){
  if(!child||child.exitCode!==null)return;
  const target=child;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{target.kill('SIGKILL');reject(new Error('Shutdown timeout'));},12000);target.once('exit',()=>{clearTimeout(timer);resolve();});target.kill('SIGTERM');});
}
async function json(route,method='GET',body,token){
 const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.ok(response.ok,`${route}: ${response.status}`);return response.json();
}
try{
 await start();
 const html=await fetch(base).then(r=>r.text());assert.match(html,/<title>KTP Table/);
 const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];assert.equal((await fetch(base+asset)).status,200);
 assert.equal((await fetch(base+'/order/legacy-token')).status,200);
 assert.equal((await fetch(base+'/api/not-found')).status,401);
 const {token}=await json('/api/auth/login','POST',{userId:'restaurant-u0',pin:'1234'});
 assert.equal((await fetch(base+'/api/not-found',{headers:{Authorization:`Bearer ${token}`}})).status,404);
 const state=await json('/api/state','GET',undefined,token);assert.deepEqual(state.customerBaseUrls,['https://ktppuz.github.io/ktppos-food']);
 const session=await json('/api/tables/r1-t15/session','POST',{},token);
 const request={requestId:'production-smoke-request-0001',items:[{menuId:'m1',qty:1}]};
 const submitted=await json(`/api/guest/${session.token}/orders`,'POST',request);assert.equal(submitted.duplicate,false);
 assert.ok(fs.existsSync(path.join(dataDir,'demo.json')));
 await stop();await start();
 const restored=await json(`/api/guest/${session.token}`);assert.equal(restored.orders.length,1);
 const retry=await json(`/api/guest/${session.token}/orders`,'POST',request);assert.equal(retry.duplicate,true);assert.equal(retry.orders[0].items.length,1);
 console.log('Production smoke passed: HTML/assets, legacy guest route, API, public QR URL, persistent data and retry after restart.');
}finally{
 await stop();fs.rmSync(dataDir,{recursive:true,force:true});
}
