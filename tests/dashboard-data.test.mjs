import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/dashboard-data.ts'],bundle:true,format:'esm',write:false});
const {dashboardData,exampleReceipt,recordedTotal,percentChange}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const now=new Date('2026-10-27T10:00:00Z');
const item=(extra={})=>({id:'actual-item',menuId:'m1',name:'ชื่อที่ขายจริง',qty:2,unitPrice:80,modifiers:[],note:'',...extra});
const order=(extra={})=>({id:'uuid-order',number:1,branchId:'r1',type:'dinein',tableId:null,status:'paid',createdAt:'2026-10-26T14:00:00Z',paidAt:'2026-10-27T02:00:00Z',items:[item()],totals:{subtotal:160,discount:10,service:0,tax:10.5,total:160.5},discount:10,serviceRate:0,taxRate:7,...extra});

test('cards and chart total use recorded sales, scoped branch, Thai payment date and refunds',()=>{
 const data=dashboardData([
  order(),order({id:'midnight',paidAt:'2026-10-26T17:00:00Z',totals:{total:100}}),
  order({id:'before-midnight',paidAt:'2026-10-26T16:59:59Z'}),order({id:'other',branchId:'r2'}),
  order({id:'unpaid',status:'cooking'}),order({id:'refund',status:'refunded',totals:{total:50}}),
  order({id:'sample',source:'demo'}),order({id:'cancelled',status:'cancelled'})
 ],[], 'r1','today',now);
 assert.equal(data.revenue,260.5);assert.equal(data.paid.length,2);assert.equal(data.average,130.25);
 assert.equal(data.refundTotal,50);assert.equal(data.refunds.length,1);assert.equal(data.orders.length,3);
 assert.equal(data.points.length,6);assert.equal(data.points[0].amount,100);assert.equal(data.points[2].amount,160.5);
 assert.equal(data.points.reduce((sum,p)=>sum+p.amount,0),data.revenue);
});

test('7 and 30 calendar day ranges include boundaries and chart matches selected period',()=>{
 for(const [period,first,lastExcluded,count] of [['7days','2026-10-20T17:00:00Z','2026-10-20T16:59:59Z',7],['30days','2026-09-27T17:00:00Z','2026-09-27T16:59:59Z',30]]){
  const data=dashboardData([order(),order({id:'first',paidAt:first}),order({id:'excluded',paidAt:lastExcluded})],[],'r1',period,now);
  assert.equal(data.paid.length,2);assert.equal(data.points.length,count);
  assert.equal(data.points.reduce((sum,p)=>sum+p.amount,0),data.revenue);
  assert.equal(data.points[0].amount,160.5);
 }
});

test('best sellers use sold prices and saved names, including removed menus',()=>{
 const data=dashboardData([order(),order({id:'removed',items:[item({menuId:'removed',name:'เมนูที่ลบไปแล้ว',qty:3,unitPrice:70})]}),order({status:'refunded',items:[item({qty:99})]})],[{id:'m1',name:'ชื่อใหม่',price:999,image:'real.jpg'}],'r1','today',now);
 assert.deepEqual(data.bestsellers.map(x=>[x.name,x.quantity,x.amount]),[['เมนูที่ลบไปแล้ว',3,210],['ชื่อที่ขายจริง',2,160]]);
 assert.equal(data.bestsellers[0].image,'');assert.equal(data.bestsellers[1].image,'real.jpg');
});

test('only known legacy example receipts are excluded; paying old sample tables is retained',()=>{
 const fixture=order({id:'o1234',createdAt:'2026-10-27T02:00:00Z',items:[item({id:'seeditem-5'})]});
 assert.equal(exampleReceipt(fixture),true);
 assert.equal(exampleReceipt({...fixture,paidAt:'2026-10-27T03:00:00Z'}),false);
 assert.equal(exampleReceipt({...fixture,id:'uuid-order'}),false);
 assert.equal(exampleReceipt({...fixture,items:[item()]}),false);
 assert.equal(dashboardData([fixture],[],'r1','today',now).revenue,0);
});

test('empty data shows zero metrics and total fallback handles persisted discounts and rounding',()=>{
 const data=dashboardData([],[],'r1','today',now);
 assert.equal(data.revenue,0);assert.equal(data.average,0);assert.equal(data.refundTotal,0);
 assert.deepEqual(data.bestsellers,[]);assert.ok(data.points.every(p=>p.amount===0));
 assert.equal(recordedTotal(order({totals:undefined,roundingAdjustment:0.01})),160.51);
 assert.equal(recordedTotal(order({totals:{total:0}})),0);
});

test('previous period compares the same elapsed time one period earlier',()=>{
 // now = 17:00 Bangkok on 27 Oct; yesterday counts 00:00–17:00 Bangkok only.
 const data=dashboardData([
  order(),
  order({id:'y-in',paidAt:'2026-10-26T09:00:00Z',totals:{total:100}}),
  order({id:'y-start',paidAt:'2026-10-25T17:00:00Z',totals:{total:20}}),
  order({id:'y-late',paidAt:'2026-10-26T10:00:01Z',totals:{total:999}}),
  order({id:'y-before',paidAt:'2026-10-25T16:59:59Z',totals:{total:999}}),
  order({id:'y-refund',status:'refunded',paidAt:'2026-10-26T01:00:00Z',totals:{total:30}}),
  order({id:'y-other',branchId:'r2',paidAt:'2026-10-26T01:00:00Z'}),
  order({id:'y-sample',source:'demo',paidAt:'2026-10-26T01:00:00Z'})
 ],[],'r1','today',now);
 assert.deepEqual(data.previous,{revenue:120,paidCount:2,average:60,refundTotal:30});
 const week=dashboardData([order({paidAt:'2026-10-14T00:00:00Z',totals:{total:40}}),order({id:'old',paidAt:'2026-10-13T16:59:59Z'})],[],'r1','7days',now);
 assert.equal(week.previous.revenue,40);assert.equal(week.previous.paidCount,1);
});

test('percent change rounds to one decimal and is null without a baseline',()=>{
 assert.equal(percentChange(150,100),50);assert.equal(percentChange(50,150),-66.7);
 assert.equal(percentChange(0,100),-100);assert.equal(percentChange(80,0),null);
});

test('hourly sales use Bangkok time and pick the highest hour as peak',()=>{
 const data=dashboardData([
  order({id:'a',paidAt:'2026-10-27T05:10:00Z',totals:{total:100}}),
  order({id:'b',paidAt:'2026-10-27T05:50:00Z',totals:{total:50}}),
  order({id:'c',paidAt:'2026-10-27T01:00:00Z',totals:{total:120}}),
  order({id:'r',status:'refunded',paidAt:'2026-10-27T01:00:00Z',totals:{total:500}})
 ],[],'r1','today',now);
 assert.equal(data.hours.length,24);
 assert.deepEqual(data.hours[12],{hour:12,amount:150,count:2});
 assert.deepEqual(data.hours[8],{hour:8,amount:120,count:1});
 assert.equal(data.peakHour.hour,12);
 assert.equal(data.hours.reduce((sum,slot)=>sum+slot.amount,0),data.revenue);
 assert.equal(dashboardData([],[],'r1','today',now).peakHour,null);
});
