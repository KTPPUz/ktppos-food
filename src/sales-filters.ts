import type {Order} from './types';
export type SalesPeriod='today'|'yesterday'|'7days'|'30days'|'month'|'custom'|'all';
export type SalesFilters={period:SalesPeriod;from:string;to:string;type:'all'|'dinein'|'takeaway'|'delivery';method:'all'|'cash'|'qr'|'card';status:'all'|'paid'|'refunded'};
export function bangkokDate(value:Date|string):string{
 const date=typeof value==='string'?new Date(value):value;if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(key:string)=>parts.find(item=>item.type===key)?.value||'';return `${part('year')}-${part('month')}-${part('day')}`;
}
export function defaultSalesFilters(now=new Date()):SalesFilters{const today=bangkokDate(now);return {period:'today',from:today,to:today,type:'all',method:'all',status:'all'};}
function validDate(value:string):boolean{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function daysBefore(today:string,days:number):string{const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-days);return date.toISOString().slice(0,10);}
export function salesDateRange(filters:SalesFilters,now=new Date()):{from:string;to:string;error:string}{
 const today=bangkokDate(now);
 if(filters.period==='custom'){
  if(!validDate(filters.from)||!validDate(filters.to))return {from:'',to:'',error:'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบถ้วน'};
  if(filters.from>filters.to)return {from:'',to:'',error:'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด'};
  return {from:filters.from,to:filters.to,error:''};
 }
 if(filters.period==='all')return {from:'',to:'',error:''};
 if(filters.period==='yesterday'){const date=daysBefore(today,1);return {from:date,to:date,error:''};}
 const from=filters.period==='7days'?daysBefore(today,6):filters.period==='30days'?daysBefore(today,29):filters.period==='month'?today.slice(0,8)+'01':today;
 return {from,to:today,error:''};
}
export function filterSalesOrders(orders:readonly Order[],filters:SalesFilters,query='',now=new Date()):Order[]{
 const range=salesDateRange(filters,now);if(range.error)return [];
 const terms=query.trim().toLocaleLowerCase('th').split(/\s+/).filter(Boolean);
 return orders.filter(order=>{
  if(!['paid','refunded'].includes(order.status))return false;
  const date=bangkokDate(order.paidAt||order.createdAt);if(!date||(range.from&&date<range.from)||(range.to&&date>range.to))return false;
  if(filters.type!=='all'&&order.type!==filters.type)return false;
  if(filters.method!=='all'&&order.payment?.method!==filters.method)return false;
  if(filters.status!=='all'&&order.status!==filters.status)return false;
  const reference=`${order.number} #${order.number} ${order.receipt||''}`.toLocaleLowerCase('th');return terms.every(term=>reference.includes(term));
 });
}

export function salesTimestamp(value:string):string{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date):'—';}
