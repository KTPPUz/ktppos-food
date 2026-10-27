import {isCooking} from '../shared/order-flow.mjs';
import {useState} from 'react';
import {ArrowRight,CheckCircle2,Clock,ReceiptText,Search,Wallet,X} from 'lucide-react';
import type {Order} from './types';
import './unpaid-bills.css';

const baht=(value:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:2}).format(value);
const types:Record<string,string>={dinein:'ทานที่ร้าน',takeaway:'ซื้อกลับ',delivery:'เดลิเวอรี'};
function elapsed(createdAt:string){
 const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(createdAt))/60000));
 return minutes>=1440?`${Math.floor(minutes/1440)} วัน`:minutes>=60?`${Math.floor(minutes/60)} ชม. ${minutes%60} นาที`:`${minutes} นาที`;
}
type Props={orders:Order[];tableName:(id:string|null)=>string;amount:(order:Order)=>number;statusName:Record<string,string>;canPay:boolean;busy:boolean;onOpen:(order:Order)=>void;onPay:(order:Order)=>void};
export default function UnpaidBills({orders,tableName,amount,statusName,canPay,busy,onOpen,onPay}:Props){
 const [filter,setFilter]=useState<'all'|'served'>('all'),[search,setSearch]=useState('');
 const sorted=[...orders].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.number-b.number);
 const served=sorted.filter(order=>order.status==='served');
 const needle=search.trim().toLocaleLowerCase();
 const filtered=(filter==='served'?served:sorted).filter(order=>!needle||String(order.number).includes(needle.replace(/^#/,''))||(order.tableId?tableName(order.tableId):types[order.type]||order.type).toLocaleLowerCase().includes(needle));
 return <section className="unpaid-bills" aria-label="บิลที่ยังไม่ชำระ">
  <div className="unpaid-heading"><div><ReceiptText size={18}/><h2>บิลที่ยังไม่ชำระ</h2><span className="unpaid-count">{orders.length}</span></div><span>ยอดค้างชำระ <strong>{baht(orders.reduce((sum,order)=>sum+amount(order),0))}</strong></span></div>
  <div className="unpaid-search search-box"><Search size={17}/><input aria-label="ค้นหาบิลหรือโต๊ะ" placeholder="ค้นหาเลขบิล หรือโต๊ะ…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="ล้างคำค้นบิล" onClick={()=>setSearch('')}><X size={15}/></button>}</div>
  <div className="unpaid-filters" role="group" aria-label="กรองบิลที่ยังไม่ชำระ"><button aria-pressed={filter==='all'} onClick={()=>{setFilter('all');}}>ทั้งหมด ({orders.length})</button><button aria-pressed={filter==='served'} onClick={()=>{setFilter('served');}}><CheckCircle2 size={13}/> เสิร์ฟครบแล้ว ({served.length})</button></div>
  {filtered.length?<ul className="unpaid-list">{filtered.map(order=><li key={order.id} className="unpaid-bill" data-order-id={order.id}>
   <div className="unpaid-identity"><button disabled={busy} className="unpaid-open" aria-label={`เปิดบิล #${order.number}`} onClick={()=>onOpen(order)}>#{order.number}<ArrowRight size={13}/></button><span>{order.tableId?`โต๊ะ ${tableName(order.tableId)}`:types[order.type]||order.type}</span><small title={new Date(order.createdAt).toLocaleString('th-TH')}><Clock size={11}/> เปิด {new Date(order.createdAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} · {elapsed(order.createdAt)}</small></div>
   <span className={'badge '+order.status}>{statusName[order.status]||order.status}</span><strong className="unpaid-amount">{baht(amount(order))}</strong>
   {canPay&&isCooking(order)?<span className="muted unpaid-payment-wait">รอครัวทำอาหารเสร็จ</span>:<button disabled={busy} className="outline unpaid-pay" aria-label={`${canPay?'รับชำระเงิน':'ดูรายละเอียด'} บิล #${order.number}`} onClick={()=>canPay?onPay(order):onOpen(order)}>{canPay?<Wallet size={14}/>:<ReceiptText size={14}/>} {canPay?'รับชำระเงิน':'ดูรายละเอียด'}</button>}
  </li>)}</ul>:<p className="unpaid-empty">{needle?'ไม่พบบิลที่ตรงกับคำค้น':filter==='served'?'ยังไม่มีบิลที่เสิร์ฟครบแล้ว':'ไม่มีบิลค้างชำระในสาขานี้'}</p>}
 </section>;
}
