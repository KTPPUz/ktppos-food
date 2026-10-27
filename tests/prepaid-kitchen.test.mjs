import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Module} from 'node:module';
import {kitchenStatus,needsService,serviceOpen} from '../shared/order-flow.mjs';

test('financially closed orders retain only explicitly outstanding kitchen work',()=>{
 for(const status of ['pending','cooking','ready']){
  const o={status:'paid',kitchenStatus:status};
  assert.equal(kitchenStatus(o),status);assert.equal(needsService(o),true);assert.equal(serviceOpen(o),true);
 }
 for(const o of [{status:'paid'},{status:'paid',kitchenStatus:'served'},{status:'refunded',kitchenStatus:'cooking'},{status:'cancelled'},{status:'merged'},{status:'split'}]){
  assert.equal(needsService(o),false);assert.equal(serviceOpen(o),false);
 }
 assert.equal(serviceOpen({status:'served'}),true); // Served, still unpaid.
});

test('kitchen renders prepaid work and excludes legacy receipts and refunds',async()=>{
 const result=await build({stdin:{contents:`import {renderToStaticMarkup} from 'react-dom/server';import KitchenBoard from './src/KitchenBoard';
 const item={id:'item',name:'อาหารทดสอบ',qty:1,modifiers:[],note:''};
 const base={number:999,items:[item],type:'takeaway',tableId:null,createdAt:new Date().toISOString()};
 export const html=renderToStaticMarkup(<KitchenBoard orders={[{...base,id:'prepaid',status:'paid',kitchenStatus:'pending'},{...base,id:'legacy',number:1000,status:'paid'},{...base,id:'refund',number:1001,status:'refunded',kitchenStatus:'pending'}]} tableName={()=>''} busy={false} canServe={true} update={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',write:false});
 const compiled=new Module(process.cwd()+'/tests/prepaid-render.cjs');compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(result.outputFiles[0].text,compiled.id);
 const {html}=compiled.exports;
 assert.match(html,/#999/);assert.match(html,/ชำระเงินแล้ว/);assert.match(html,/เริ่มทำอาหาร/);
 assert.doesNotMatch(html,/#1000|#1001/);
});

test('browser demo keeps paid QR orders visible through serving without charging twice',async()=>{
 const result=await build({entryPoints:['src/demo/transport.mjs'],bundle:true,format:'esm',write:false,define:{'import.meta.env.BASE_URL':'"/"'}});
 const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
 globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.location={origin:'http://demo.test',protocol:'http:',host:'demo.test'};
 const {demoFetch}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const login=await demoFetch('/auth/login',{method:'POST',body:JSON.stringify({userId:'restaurant-u0',pin:'1234'})});
 const {token}=await login.json();
 const call=async(path,method='GET',body)=>{const r=await demoFetch(path,{method,headers:{Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const session=(await call('/tables/r1-t15/session','POST',{})).body;
 const guest='/guest/'+session.token;
 const created=await call(guest+'/orders','POST',{requestId:'prepaid-demo-request-0001',items:[{menuId:'m30',qty:1}]});assert.equal(created.status,201);
 const path='/orders/'+created.body.orderId;
 assert.equal((await call(path+'/payments','POST',{method:'cash',received:1000})).body.kitchenStatus,'pending');
 assert.equal((await call(path+'/payments','POST',{method:'cash',received:1000})).status,409);
 let state=(await call(guest)).body;assert.equal(state.session.active,true);assert.equal(state.session.acceptingOrders,false);
 assert.equal((await call('/state')).body.orders.find(o=>o.id===created.body.orderId).status,'paid');
 for(const status of ['cooking','ready','served']){
  const r=await call(path+'/kitchen-batches/'+created.body.batchId+'/status','PATCH',{status});assert.equal(r.status,200);assert.equal(r.body.status,'paid');assert.equal(r.body.kitchenStatus,status);
 }
 state=(await call(guest)).body;assert.equal(state.session.active,false);assert.equal(state.orders[0].kitchenStatus,'served');
});
