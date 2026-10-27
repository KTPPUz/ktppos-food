import {useEffect,useRef,useState} from 'react';
import {AlertCircle,Check,Pencil,Plus,Trash2,X} from 'lucide-react';
import type {State,Table} from './types';
import {api} from './api';
import './table-settings.css';

type Props={state:State;branch:string;refresh:()=>Promise<unknown>;notify:(message:string)=>void};
export default function TableSettings({state,branch,refresh,notify}:Props){
 const [selected,setSelected]=useState<Table|null>(null),[mode,setMode]=useState<'add'|'edit'|'delete'|null>(null),[name,setName]=useState(''),[seats,setSeats]=useState('4');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),opener=useRef<HTMLElement|null>(null);
 const tables=state.tables.filter(table=>table.branchId===branch),branchName=state.branches.find(b=>b.id===branch)?.name||branch;
 function close(){if(lock.current)return;setMode(null);setError('');opener.current?.focus();}
 useEffect(()=>{if(!mode)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[mode]);
 function open(next:'add'|'edit'|'delete',table?:Table){opener.current=document.activeElement as HTMLElement;setSelected(table||null);setName(table?.name||'');setSeats(String(table?.seats||4));setError('');setMode(next);}
 async function save(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  await api(mode==='add'?'/tables':`/tables/${selected!.id}`,mode==='delete'?'DELETE':mode==='add'?'POST':'PATCH',mode==='delete'?undefined:{name:name.trim(),seats:Number(seats),...(mode==='add'?{branchId:branch}:{})});
  await refresh();setMode(null);opener.current?.focus();notify(mode==='delete'?'ลบโต๊ะแล้ว':mode==='add'?'เพิ่มโต๊ะแล้ว':'บันทึกข้อมูลโต๊ะแล้ว');
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const title=mode==='add'?'เพิ่มโต๊ะ':mode==='delete'?'ลบโต๊ะ':'แก้ไขข้อมูลโต๊ะ';
 return <section className="panel table-settings" role="tabpanel" id="table-settings-panel" aria-labelledby="table-settings-tab">
  <div className="panel-heading"><div><h3>จัดการโต๊ะ · สาขา{branchName}</h3><p>ทั้งหมด {tables.length} โต๊ะ · {tables.reduce((sum,table)=>sum+table.seats,0)} ที่นั่ง</p></div><button className="primary" onClick={()=>open('add')}><Plus size={17}/> เพิ่มโต๊ะ</button></div>
  <div className="table-scroll"><table><thead><tr><th>ชื่อโต๊ะ</th><th>จำนวนที่นั่ง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{tables.map(table=>{
   const occupied=state.orders.some(order=>order.tableId===table.id&&!['paid','refunded','cancelled','merged','split'].includes(order.status)),qr=state.tableSessions.some(session=>session.tableId===table.id&&session.active);
   return <tr key={table.id}><td><strong>{table.name}</strong></td><td>{table.seats} ที่นั่ง</td><td><span className={'badge '+(occupied?'pending':qr?'ready':table.reservation?'role':'served')}>{occupied?'กำลังใช้บริการ':qr?'เปิด QR รอสั่ง':table.reservation?'จองแล้ว':'ว่าง'}</span></td><td><div className="staff-actions"><button className="outline table-edit" disabled={busy} aria-label={`แก้ไขโต๊ะ ${table.name}`} onClick={()=>open('edit',table)}><Pencil size={14}/> แก้ไข</button><button className="danger-button table-edit" aria-label={`ลบโต๊ะ ${table.name}`} onClick={()=>open('delete',table)}><Trash2 size={14}/> ลบ</button></div></td></tr>;
  })}</tbody></table></div>
  {!tables.length&&<p className="table-settings-empty">ยังไม่มีข้อมูลโต๊ะในสาขานี้</p>}
  <div className="table-settings-note">ลบได้เมื่อไม่มีบิลค้าง การจอง หรือ QR ที่เปิดอยู่ ประวัติบิลเดิมยังคงอยู่</div>
  {mode&&<div className="overlay" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>สาขา{branchName}</p></div><button className="icon-btn" aria-label="ปิด" disabled={busy} onClick={close}><X size={21}/></button></header><form className="modal-body" onSubmit={event=>{event.preventDefault();void save();}}>
   {error&&<div className="error" role="alert"><AlertCircle size={17}/>{error}</div>}
   {mode==='delete'?<p>ต้องการลบโต๊ะ <strong>{selected?.name}</strong> ใช่หรือไม่? ประวัติบิลเดิมจะไม่ถูกลบ</p>:<><label>ชื่อโต๊ะ<input autoFocus required maxLength={50} value={name} disabled={busy} onChange={event=>setName(event.target.value)} placeholder="เช่น T01 หรือ ริมหน้าต่าง 1"/></label><label>จำนวนที่นั่ง<input required type="number" inputMode="numeric" min={1} max={50} step={1} value={seats} disabled={busy} onChange={event=>setSeats(event.target.value)}/></label></>}
   <div className="table-settings-actions"><button type="button" className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className={mode==='delete'?'danger-button':'primary'} disabled={busy}><Check size={17}/>{busy?'กำลังบันทึก…':mode==='delete'?'ยืนยันลบโต๊ะ':mode==='add'?'บันทึกโต๊ะใหม่':'บันทึกข้อมูลโต๊ะ'}</button></div>
  </form></section></div>}
 </section>;
}
