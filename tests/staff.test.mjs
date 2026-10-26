import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
const {app,data}=createApp();let server,base;const tokens={};
async function call(route,method='GET',body,token=tokens.owner){
 const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
}
async function login(userId,pin='1234'){return call('/auth/login','POST',{userId,pin},'');}
const fields={name:'ทีมงานใหม่',email:'new-staff@example.com',role:'Waiter',branchId:'r1',pin:'5678'};
before(async()=>{
 server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 base=`http://127.0.0.1:${server.address().port}/api`;
 for(const [key,id] of Object.entries({owner:'restaurant-u0',manager:'restaurant-u1',hq:'restaurant-u5',other:'brand-u0'}))tokens[key]=(await login(id)).body.token;
});
after(()=>server?.close());
test('only owners can create, edit or delete staff; self and other tenants are protected',async()=>{
 for(const role of ['manager','hq']){
  assert.equal((await call('/users','POST',fields,tokens[role])).status,403);
  assert.equal((await call('/users/restaurant-u3','PATCH',{name:'No'},tokens[role])).status,403);
  assert.equal((await call('/users/restaurant-u3','DELETE',null,tokens[role])).status,403);
 }
 assert.equal((await call('/users','POST',fields,'')).status,401);
 assert.equal((await call('/users/brand-u3','PATCH',{name:'No'})).status,404);
 assert.equal((await call('/users/brand-u3','DELETE')).status,404);
 assert.equal((await call('/users/restaurant-u0','DELETE')).status,409);
 assert.equal((await call('/users/restaurant-u0','PATCH',{role:'Waiter'})).status,409);
});
test('staff validation rejects duplicates, invalid fields and foreign branches without changing data',async()=>{
 const count=data.users.length;
 for(const patch of [{name:' '},{email:'bad'},{pin:'abcd'},{pin:'123'},{role:'Admin'}])assert.equal((await call('/users','POST',{...fields,...patch})).status,400);
 assert.equal((await call('/users','POST',{...fields,branchId:'b1'})).status,403);
 assert.equal((await call('/users','POST',{...fields,email:'OWNER@RESTAURANT.DEMO'})).status,409);
 assert.equal(data.users.length,count);
});
test('owners add and edit staff, preserve PIN on blank-free updates, and revoke access when credentials change',async()=>{
 const created=await call('/users','POST',{...fields,tenantId:'brand',id:'attacker'});
 assert.equal(created.status,201);const employee=created.body;
 assert.equal(employee.tenantId,'restaurant');assert.notEqual(employee.id,'attacker');assert.equal(employee.pin,undefined);
 const staffToken=(await login(employee.id,'5678')).body.token;
 assert.equal((await call('/state','GET',null,staffToken)).status,200);
 assert.equal((await call(`/users/${employee.id}`,'PATCH',{name:'แก้ไขทีมงาน',email:'EDITED@EXAMPLE.COM'})).status,200);
 assert.equal((await login(employee.id,'5678')).status,200);
 const updated=await call(`/users/${employee.id}`,'PATCH',{role:'Cashier',pin:'9012'});
 assert.equal(updated.status,200);assert.equal(updated.body.email,'edited@example.com');assert.equal(updated.body.pin,undefined);
 assert.equal((await call('/state','GET',null,staffToken)).status,401);
 assert.equal((await login(employee.id,'5678')).status,401);
 const newToken=(await login(employee.id,'9012')).body.token;
 assert.equal((await call('/state','GET',null,newToken)).body.user.role,'Cashier');
 const snapshot=structuredClone(data.users.find(u=>u.id===employee.id));
 assert.equal((await call(`/users/${employee.id}`,'PATCH',{name:'Should not save',branchId:'b1'})).status,403);
 assert.deepEqual(data.users.find(u=>u.id===employee.id),snapshot);
 const history=data.orders.length;
 assert.equal((await call(`/users/${employee.id}`,'DELETE')).status,200);
 assert.equal((await call('/state','GET',null,newToken)).status,401);
 assert.equal((await login(employee.id,'9012')).status,401);assert.equal(data.orders.length,history);
 assert.ok(data.audit.some(a=>a.action==='เพิ่มทีมงาน'&&a.detail==='ทีมงานใหม่'));
 assert.ok(data.audit.some(a=>a.action==='ลบทีมงาน'&&a.detail==='แก้ไขทีมงาน'));
 assert.ok(data.audit.every(a=>!a.detail.includes('9012')));
});
test('enterprise owners can assign a team member to another branch in the same tenant',async()=>{
 const created=await call('/users','POST',{...fields,email:'branch@example.com',branchId:'b2'},tokens.other);
 assert.equal(created.status,201);
 const updated=await call(`/users/${created.body.id}`,'PATCH',{branchId:'b3'},tokens.other);
 assert.equal(updated.status,200);assert.equal(updated.body.branchId,'b3');
 await call(`/users/${created.body.id}`,'DELETE',null,tokens.other);
});
