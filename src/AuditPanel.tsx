import {useRef,useState} from 'react';
import {AlertCircle,ArrowLeft,Eye,FileClock} from 'lucide-react';
import type {AuditEntry,State} from './types';
import {api} from './api';
import {auditDetailLabel,roleLabel} from './roles';
import './audit-details.css';
import DataTable from './DataTable';
const date=(value:string)=>new Date(value).toLocaleString('th-TH',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const labels:Record<string,string>={categories:'ประเภทอาหาร',icon:'ไอคอน',name:'ชื่อ',qty:'จำนวน',unitPrice:'ราคาต่อหน่วย',originalUnitPrice:'ราคาก่อนลด',menuDiscount:'ส่วนลดเมนู',note:'หมายเหตุ',modifiers:'ตัวเลือกเสริม',group:'กลุ่ม',price:'ราคา',subtotal:'ยอดสินค้า',discount:'ส่วนลด',service:'ค่าบริการ',tax:'ภาษี',total:'ยอดสุทธิ',method:'วิธีชำระ',received:'ยอดรับ',change:'เงินทอน',verification:'การตรวจสอบ',verifiedBy:'ผู้ยืนยัน',verifiedAt:'เวลายืนยัน',account:'บัญชีรับเงิน',bankName:'ธนาคาร',accountName:'ชื่อบัญชี',accountNumber:'เลขบัญชี',instructions:'ข้อความแจ้งลูกค้า',enabled:'เปิดใช้งาน',image:'รูปภาพ',reservation:'การจอง',time:'เวลา',status:'สถานะ',round:'รอบ',source:'ช่องทาง',createdAt:'เวลาสร้าง',at:'เวลา',reason:'เหตุผล',type:'ประเภท',value:'มูลค่า',branch:'สาขา',fromBranchId:'สาขาต้นทาง',toBranchId:'สาขาปลายทาง',requestedBy:'ผู้ขอ',approvedBy:'ผู้อนุมัติ',approvedAt:'เวลาอนุมัติ'};
const statuses:Record<string,string>={pending:'รอทำ',draft:'บิลเปิด',cooking:'กำลังทำ',ready:'พร้อมเสิร์ฟ',served:'เสิร์ฟแล้ว',paid:'ชำระแล้ว',refunded:'คืนเงินแล้ว',cancelled:'ยกเลิก',merged:'รวมบิล',split:'แยกบิล',branch:'เฉพาะสาขา',tenant:'ทุกสาขา',cash:'เงินสด',qr:'QR รับโอน',card:'บัตร',manual:'ตรวจสอบเอง',dinein:'ทานที่ร้าน',takeaway:'กลับบ้าน',delivery:'เดลิเวอรี',percent:'เปอร์เซ็นต์',fixed:'จำนวนเงิน',none:'ไม่มี',active:'เปิดใช้งาน',closed:'ปิดแล้ว',customer_qr:'ลูกค้าสั่งผ่าน QR',pos:'หน้าร้าน'};
function ImageValue({src}:{src:string}){const [failed,setFailed]=useState(false);return failed?<span className="muted">รูปเดิมไม่พร้อมแสดง</span>:<img className="audit-image" src={src} alt="รูปที่บันทึกในรายการ" onError={()=>setFailed(true)}/>;}
function Value({value,field,state,depth=0}:{value:unknown;field:string;state:State;depth?:number}){
 if(value===null||value===undefined||value==='')return <span className="muted">—</span>;
 if(typeof value==='boolean')return <span>{value?'ใช่ / เปิด':'ไม่ใช่ / ปิด'}</span>;
 if(typeof value==='number')return <span>{value.toLocaleString('th-TH',{maximumFractionDigits:4})}</span>;
 if(typeof value==='string'){
  if(field==='image')return <ImageValue src={value}/>;
  if(/branchId$/i.test(field)||field==='branchId')return <span>{state.branches.find(b=>b.id===value)?.name||'สาขาเดิม'}</span>;
  if(field==='tableId')return <span>{[...state.tables,...(state.archivedTables||[])].find(t=>t.id===value)?.name||'โต๊ะเดิม'}</span>;
  if(field==='category')return <span>{state.categories.find(c=>c.id===value)?.name||value}</span>;
  if(/^\d{4}-\d\d-\d\dT/.test(value))return <span>{date(value)}</span>;
  if(field.endsWith('By')||field==='userId')return <span>{state.users.find(u=>u.id===value)?.name||'พนักงานที่บันทึกไว้'}</span>;
  return <span>{['status','scope','method','verification','type','source'].includes(field)?statuses[value]||value:value}</span>;
 }
 if(Array.isArray(value))return value.length?<div className="audit-value-list">{value.map((item,index)=><div key={index}><Value value={item} field={field} state={state} depth={depth+1}/></div>)}</div>:<span className="muted">ไม่มีรายการ</span>;
 if(typeof value==='object'){
  if(depth>5)return <span className="muted">ข้อมูลเพิ่มเติม</span>;
  const entries=Object.entries(value as Record<string,unknown>).filter(([key])=>!['id','tenantId','menuId','batchId','itemIds','token','tokenHash','pin','pinHash','version','group','orderId','serviceSessionId'].includes(key));
  return entries.length?<dl className="audit-value-object">{entries.map(([key,item])=><div key={key}><dt>{labels[key]||key}</dt><dd><Value value={item} field={key} state={state} depth={depth+1}/></dd></div>)}</dl>:<span className="muted">ไม่มีรายละเอียดเพิ่มเติม</span>;
 }
 return <span>—</span>;
}
export default function AuditPanel({state,branch}:{state:State;branch:string}){
 const [selected,setSelected]=useState<AuditEntry|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),returnId=useRef('');
 const entries=state.audit.filter(entry=>entry.branchId===branch);
 async function details(entry:AuditEntry){if(lock.current)return;lock.current=true;setBusy(true);setError('');returnId.current=entry.id;try{const detail=await api<AuditEntry>(`/audit/${encodeURIComponent(entry.id)}`);setSelected(detail);window.scrollTo({top:0,behavior:'auto'});}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 function back(){setSelected(null);requestAnimationFrame(()=>document.getElementById(`audit-detail-${returnId.current}`)?.focus());}
 const detail=selected?<section className="audit-detail-page" aria-label="รายละเอียดการทำรายการ" role="region"><button className="text-button audit-back" onClick={back}><ArrowLeft size={17}/> กลับประวัติการทำรายการ</button><section className="panel"><div className="panel-heading"><div><h2>{selected.action}</h2><p>{auditDetailLabel(selected.action,selected.detail)}</p></div><FileClock size={23}/></div><dl className="audit-metadata"><div><dt>ผู้ดำเนินการ</dt><dd>{selected.user} · {selected.roleName||roleLabel(selected.role)}</dd></div><div><dt>สาขา</dt><dd>{state.branches.find(b=>b.id===selected.branchId)?.name||selected.branchId}</dd></div><div><dt>เวลาทำรายการ</dt><dd>{date(selected.at)}</dd></div></dl></section>
  {selected.changes===undefined?<div className="info-banner"><AlertCircle size={21}/><div><strong>ประวัติเดิมไม่มีข้อมูลก่อน–หลังบันทึกไว้</strong><p>แสดงได้เฉพาะข้อมูลกิจกรรม ผู้ดำเนินการ และเวลาที่บันทึก รายการใหม่จะเก็บรายละเอียดการเปลี่ยนแปลงให้</p></div></div>:selected.changes.length===0?<div className="info-banner"><FileClock size={21}/><p>รายการนี้ไม่มีค่าข้อมูลที่เปลี่ยนแปลง</p></div>:selected.changes.map((change,index)=><section className="panel audit-change" key={`${change.entity}-${change.id}-${index}`}><div className="panel-heading"><div><h3>{change.entity} · {change.label}</h3><p>{change.type==='create'?'เพิ่มข้อมูล':change.type==='delete'?'ลบ / เลิกใช้งานข้อมูล':'แก้ไขข้อมูล'}</p></div></div><div className="table-scroll"><table className="audit-change-table"><thead><tr><th>ข้อมูล</th><th>ก่อนทำรายการ</th><th>หลังทำรายการ</th></tr></thead><tbody>{change.fields.map(field=><tr key={field.key}><th scope="row">{field.label}{field.redacted&&<small className="block muted">มีการเปลี่ยนค่า แต่ไม่แสดงข้อมูลลับ</small>}</th><td data-label="ก่อนทำรายการ"><Value value={field.before} field={field.key} state={state}/></td><td data-label="หลังทำรายการ"><Value value={field.after} field={field.key} state={state}/></td></tr>)}</tbody></table></div></section>)}
 </section>:null;
 const list=<section className="panel"><div className="panel-heading"><h3>บันทึกกิจกรรม</h3><span className="muted">ผู้ดำเนินการ · เวลา · เหตุผล</span></div>{error&&<div role="alert" className="error audit-error"><AlertCircle size={17}/>{error}</div>}
 <DataTable label="ตารางประวัติการทำรายการ" rows={entries} rowKey={entry=>entry.id} resetKey={branch} initialSort={{key:'at',direction:'desc'}} searchLabel="ค้นหาประวัติการทำรายการ" searchPlaceholder="ค้นหากิจกรรม รายละเอียด หรือผู้ดำเนินการ…" searchText={entry=>`${entry.action} ${auditDetailLabel(entry.action,entry.detail)} ${entry.user} ${entry.roleName||roleLabel(entry.role)} ${date(entry.at)}`} emptyText="ไม่พบประวัติการทำรายการ" columns={[
  {key:'at',label:'วันและเวลา',value:entry=>new Date(entry.at).getTime(),render:entry=><time>{date(entry.at)}</time>},
  {key:'action',label:'กิจกรรม',value:entry=>entry.action,render:entry=><strong>{entry.action}</strong>},
  {key:'detail',label:'รายละเอียด',value:entry=>auditDetailLabel(entry.action,entry.detail),render:entry=>auditDetailLabel(entry.action,entry.detail)},
  {key:'user',label:'ผู้ดำเนินการ',value:entry=>entry.user,render:entry=><>{entry.user}<small className="block muted">{entry.roleName||roleLabel(entry.role)}</small></>},
  {key:'actions',label:'จัดการ',className:'data-table-actions',render:entry=><button id={`audit-detail-${entry.id}`} className="outline" disabled={busy} aria-label={`ดูรายละเอียด ${entry.action}`} onClick={()=>void details(entry)}><Eye size={15}/> ดูรายละเอียด</button>},
 ]}/></section>;
 return <><div hidden={!!selected}>{list}</div>{detail}</>;
}
