import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createApp} from '../server/app.mjs';
import {serverOptions} from '../server/http.mjs';
import {customerOrderUrl,customerOrderToken,apiEndpoint} from '../shared/deployment.mjs';
const {app}=createApp({allowedOrigins:['https://ktppuz.github.io'],trustProxy:1});let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});base=`http://127.0.0.1:${server.address().port}`;});
after(()=>server?.close());

test('Pages QR retains repository base path and fragment survives a refresh without a server route',()=>{
 const token='a'.repeat(48),url=new URL(customerOrderUrl('https://ktppuz.github.io/ktppos-food/',token));
 assert.equal(url.pathname,'/ktppos-food/');assert.equal(url.hash,`#/order/${token}`);
 assert.equal(customerOrderToken(url.pathname,url.hash),token);
 assert.equal(customerOrderToken('/order/'+token,''),token);
 assert.equal(customerOrderToken('/ktppos-food/',''),null);
 assert.equal(customerOrderToken('/order/',''),'');
 assert.equal(customerOrderUrl('https://example.com',token),`https://example.com/#/order/${token}`);
 for(const base of ['javascript:alert(1)','https://user:pass@example.com','https://example.com?token=x','https://example.com/#old'])assert.throws(()=>customerOrderUrl(base,token));
});
test('API paths default to same-origin or use the configured HTTPS backend',()=>{
 assert.equal(apiEndpoint(undefined,'/auth/login'),'/api/auth/login');
 assert.equal(apiEndpoint('https://ktp.onrender.com/api/','/guest/token/orders'),'https://ktp.onrender.com/api/guest/token/orders');
});
test('health is public and does not require a staff session',async()=>{const r=await fetch(base+'/healthz');assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok'});});
test('allowed Pages preflight works before authentication and supports Bearer headers',async()=>{
 const r=await fetch(base+'/api/auth/login',{method:'OPTIONS',headers:{Origin:'https://ktppuz.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://ktppuz.github.io');assert.match(r.headers.get('access-control-allow-headers'),/Authorization/);assert.equal(r.headers.get('access-control-allow-credentials'),null);
});
test('cross-origin staff login and guest endpoints retain CORS headers without bypassing auth',async()=>{
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://ktppuz.github.io','Content-Type':'application/json'},body:JSON.stringify({userId:'restaurant-u0',pin:'1234'})});
 assert.equal(login.status,200);const {token}=await login.json();
 const state=await fetch(base+'/api/state',{headers:{Origin:'https://ktppuz.github.io',Authorization:`Bearer ${token}`}});assert.equal(state.status,200);assert.equal(state.headers.get('access-control-allow-origin'),'https://ktppuz.github.io');
 const guest=await fetch(base+'/api/guest/'+'a'.repeat(48),{headers:{Origin:'https://ktppuz.github.io'}});assert.equal(guest.status,404);assert.equal(guest.headers.get('access-control-allow-origin'),'https://ktppuz.github.io');
 const unauthorized=await fetch(base+'/api/state',{headers:{Origin:'https://ktppuz.github.io'}});assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('access-control-allow-origin'),'https://ktppuz.github.io');
});
test('unlisted origins cannot read API responses and same-origin HTTPS behind a proxy works',async()=>{
 const bad=await fetch(base+'/api/demo',{headers:{Origin:'https://unlisted.example'}});assert.equal(bad.status,403);assert.equal(bad.headers.get('access-control-allow-origin'),null);
 const host=new URL(base).host;
 const same=await fetch(base+'/api/demo',{headers:{Origin:`https://${host}`,'X-Forwarded-Proto':'https'}});assert.equal(same.status,200);assert.equal(same.headers.get('access-control-allow-origin'),`https://${host}`);
});
test('server public QR URL prefers explicit configuration, then Render URL, and never cloud-private IPs',()=>{
 const render=serverOptions({PORT:'10000',NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://ktp.onrender.com',TRUST_PROXY:'1'},['http://10.0.0.1:10000']);assert.deepEqual(render.customerBaseUrls,['https://ktp.onrender.com']);assert.equal(render.trustProxy,1);
 assert.deepEqual(serverOptions({NODE_ENV:'production'},['http://10.0.0.1:5173']).customerBaseUrls,[]);
 assert.deepEqual(serverOptions({CUSTOMER_BASE_URL:'https://ktppuz.github.io/ktppos-food/',RENDER_EXTERNAL_URL:'https://ktp.onrender.com'}).customerBaseUrls,['https://ktppuz.github.io/ktppos-food']);
 assert.deepEqual(serverOptions({HOST:'127.0.0.1'},['http://10.0.0.1:5173']).customerBaseUrls,['http://localhost:5173']);
 assert.throws(()=>serverOptions({PORT:'bad'}));assert.throws(()=>serverOptions({CUSTOMER_BASE_URL:'javascript:alert(1)'}));
});

test('Pages deployment without an API publishes setup, while malformed URLs still fail validation',()=>{
 const check=value=>spawnSync(process.execPath,['scripts/check-pages-env.mjs'],{env:{...process.env,VITE_API_BASE_URL:value},encoding:'utf8'});
 const missing=check('');assert.equal(missing.status,0);assert.match(missing.stdout,/Publishing the backend setup page/);
 assert.equal(check('https://api.example.com/api').status,0);
 for(const value of ['http://localhost:5173/api','not-a-url','https://api.example.com'])assert.equal(check(value).status,1);
});
