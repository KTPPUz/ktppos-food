import type {MenuItem,Order} from './types';
import {bangkokDate,defaultSalesFilters,filterSalesOrders} from './sales-filters';
export type DashboardPeriod='today'|'7days'|'30days';
const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const DAY=86400000,BANGKOK_OFFSET=7*3600000;
const orderTime=(order:Order)=>new Date(order.paidAt||order.createdAt).getTime();
const bangkokHour=(time:number)=>new Date(time+BANGKOK_OFFSET).getUTCHours();
// Percentage change; null when there is nothing to compare against.
export function percentChange(current:number,previous:number):number|null{
 if(!previous)return null;
 return Math.round((current-previous)/previous*1000)/10;
}
// Legacy fixture receipts have stable seed IDs and identical creation/payment times.
// Paying an existing demo table in the app produces a later paidAt and remains a real transaction.
export function exampleReceipt(order:Order):boolean{
 return order.source==='demo'||(/^o\d+$/.test(order.id)&&!!order.paidAt&&order.createdAt===order.paidAt&&order.items.length>0&&order.items.every(item=>/^seeditem-\d+$/.test(item.id)));
}
export function recordedTotal(order:Order):number{
 if(order.totals&&Number.isFinite(order.totals.total))return order.totals.total;
 const subtotal=round(order.items.reduce((sum,item)=>sum+item.qty*item.unitPrice,0));
 const base=subtotal-(order.discount||0),service=round(base*order.serviceRate/100),tax=round((base+service)*order.taxRate/100);
 return round(base+service+tax+(order.roundingAdjustment||0));
}
export function dashboardData(allOrders:readonly Order[],menu:readonly MenuItem[],branch:string,period:DashboardPeriod,now=new Date()){
 const orders=filterSalesOrders(allOrders.filter(order=>order.branchId===branch&&!exampleReceipt(order)),{...defaultSalesFilters(now),period},'',now);
 const paid=orders.filter(order=>order.status==='paid'),refunds=orders.filter(order=>order.status==='refunded');
 const revenue=round(paid.reduce((sum,order)=>sum+recordedTotal(order),0));
 const today=bangkokDate(now),days=period==='today'?1:period==='7days'?7:30;
 const points=Array.from({length:period==='today'?6:days},(_,index)=>{
  const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(days-1-index));
  const key=period==='today'?today:date.toISOString().slice(0,10);
  const label=period==='today'?`${String(index*4).padStart(2,'0')}:00`:new Intl.DateTimeFormat('th-TH',{timeZone:'UTC',day:'numeric',month:'short'}).format(date);
  return {key:period==='today'?`${today}-${index}`:key,label,amount:round(paid.filter(order=>{
   if(bangkokDate(order.paidAt||order.createdAt)!==key)return false;
   if(period!=='today')return true;
   const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',hourCycle:'h23'}).format(new Date(order.paidAt||order.createdAt)));
   return Math.floor(hour/4)===index;
  }).reduce((sum,order)=>sum+recordedTotal(order),0))};
 });
 const sold=new Map<string,{id:string;name:string;image:string;quantity:number;amount:number}>();
 for(const order of [...paid].sort((a,b)=>(a.paidAt||a.createdAt).localeCompare(b.paidAt||b.createdAt)))for(const item of order.items){
  const existing=sold.get(item.menuId)||{id:item.menuId,name:item.name,image:menu.find(m=>m.id===item.menuId)?.image||'',quantity:0,amount:0};
  existing.name=item.name;existing.quantity+=item.qty;existing.amount=round(existing.amount+item.qty*item.unitPrice);sold.set(item.menuId,existing);
 }
 const bestsellers=[...sold.values()].sort((a,b)=>b.quantity-a.quantity||b.amount-a.amount||a.id.localeCompare(b.id)).slice(0,4);
 // Previous window covers the same elapsed time one period earlier (today 00:00→now vs yesterday 00:00→same time).
 const periodStart=new Date(today+'T00:00:00Z').getTime()-BANGKOK_OFFSET-(days-1)*DAY;
 const previousOrders=allOrders.filter(order=>{
  if(order.branchId!==branch||exampleReceipt(order)||!['paid','refunded'].includes(order.status))return false;
  const time=orderTime(order);return time>=periodStart-days*DAY&&time<=now.getTime()-days*DAY;
 });
 const previousPaid=previousOrders.filter(order=>order.status==='paid'),previousRevenue=round(previousPaid.reduce((sum,order)=>sum+recordedTotal(order),0));
 const previous={revenue:previousRevenue,paidCount:previousPaid.length,average:previousPaid.length?round(previousRevenue/previousPaid.length):0,refundTotal:round(previousOrders.filter(order=>order.status==='refunded').reduce((sum,order)=>sum+recordedTotal(order),0))};
 const hours=Array.from({length:24},(_,hour)=>({hour,amount:0,count:0}));
 for(const order of paid){const slot=hours[bangkokHour(orderTime(order))];slot.amount=round(slot.amount+recordedTotal(order));slot.count++;}
 const peakHour=hours.reduce<typeof hours[number]|null>((best,slot)=>slot.amount>0&&(!best||slot.amount>best.amount)?slot:best,null);
 return {orders,paid,refunds,revenue,average:paid.length?round(revenue/paid.length):0,refundTotal:round(refunds.reduce((sum,order)=>sum+recordedTotal(order),0)),points,bestsellers,previous,hours,peakHour};
}
