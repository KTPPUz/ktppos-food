import {useRef,useState} from 'react';
import {AlertCircle,Building2,Check,Pencil,Plus,Trash2,X} from 'lucide-react';
import type {Branch,State} from './types';
import {api} from './api';
import './branch-settings.css';

type Form={name:string;address:string;phone:string;target:string;tableCount:string};
export default function BranchSettings({state,refresh,notify}:{state:State;refresh:()=>Promise<unknown>;notify:(text:string)=>void}){
 const [mode,setMode]=useState<'add'|'edit'|'delete'|null>(null),[selected,setSelected]=useState<Branch|null>(null);
 const [form,setForm]=useState<Form>({name:'',address:'',phone:'',target:'0',tableCount:'15'});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),opener=useRef<HTMLElement|null>(null);
 const owner=state.user.role==='Owner';
 function close(){if(lock.current)return;setMode(null);setError('');opener.current?.focus();}
 function open(next:'add'|'edit'|'delete',branch?:Branch){
  opener.current=document.activeElement as HTMLElement;setSelected(branch||null);setError('');setMode(next);
  setForm({name:branch?.name||'',address:branch?.address||'',phone:branch?.phone||'',target:String(branch?.target||0),tableCount:state.tenant.plan==='Small'?'0':'15'});
 }
 async function save(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const {tableCount,...fields}=form;
   await api(mode==='add'?'/branches':`/branches/${selected!.id}`,mode==='delete'?'DELETE':mode==='add'?'POST':'PATCH',mode==='delete'?undefined:{...fields,target:Number(form.target),...(mode==='add'?{tableCount:Number(tableCount)}:{})});
   await refresh();setMode(null);opener.current?.focus();notify(mode==='add'?'เพิ่มสาขาแล้ว':mode==='edit'?'บันทึกข้อมูลสาขาแล้ว':'ลบสาขาแล้ว');
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 const title=mode==='add'?'เพิ่มสาขา':mode==='edit'?'แก้ไขสาขา':'ลบสาขา';
 return <>
  <section className="panel"><div className="panel-heading"><div><h3>สาขาทั้งหมด {state.branches.length} สาขา</h3><p>ข้อมูลสาขาและเป้าหมายยอดขายรายวัน</p></div>{owner&&<button className="primary" onClick={()=>open('add')}><Plus size={17}/> เพิ่มสาขา</button>}</div>
   <div className="table-scroll"><table><thead><tr><th>สาขา</th><th>ข้อมูลติดต่อ</th><th>เป้าหมายต่อวัน</th>{owner&&<th>จัดการ</th>}</tr></thead><tbody>{state.branches.map(branch=><tr key={branch.id}>
    <td><strong className="branch-name"><Building2 size={17}/>{branch.name}</strong>{branch.id===state.user.branchId&&<small className="block muted">สาขาประจำของคุณ</small>}</td>
    <td><span className="branch-address">{branch.address||'ยังไม่ได้ระบุที่อยู่'}</span><small className="block">{branch.phone||'ยังไม่ได้ระบุเบอร์โทร'}</small></td>
    <td>฿{branch.target.toLocaleString('th-TH',{maximumFractionDigits:2})}</td>
    {owner&&<td><div className="staff-actions"><button className="outline" aria-label={`แก้ไขสาขา ${branch.name}`} onClick={()=>open('edit',branch)}><Pencil size={15}/> แก้ไข</button><button className="danger-button" disabled={state.branches.length===1} title={state.branches.length===1?'ไม่สามารถลบสาขาสุดท้ายได้':undefined} aria-label={`ลบสาขา ${branch.name}`} onClick={()=>open('delete',branch)}><Trash2 size={15}/> ลบ</button></div></td>}
   </tr>)}</tbody></table></div>
  </section>
  <div className="info-banner"><Building2 size={21}/><div><strong>เพิ่มสาขาใหม่และกำหนดทีมงานแยกตามสาขา</strong><p>เฉพาะเจ้าของร้านจัดการข้อมูลสาขาได้ ลบได้เฉพาะสาขาที่ยังไม่มีทีมงาน สต๊อก หรือประวัติใช้งาน</p></div></div>
  {mode&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={e=>{if(e.key==='Escape')close();}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-btn" aria-label="ปิด" disabled={busy} onClick={close}><X size={20}/></button></header><div className="modal-body">
   {error&&<div role="alert" className="error"><AlertCircle size={17}/>{error}</div>}
   {mode==='delete'?<><p>ต้องการลบสาขา <strong>{selected?.name}</strong> ใช่หรือไม่?</p><p className="muted branch-help">ระบบจะตรวจสอบข้อมูลใช้งานก่อนลบ โต๊ะและรายการวัตถุดิบตั้งต้นที่ยังไม่ใช้งานจะถูกลบพร้อมสาขา</p><div className="staff-modal-actions"><button autoFocus className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="danger-button" disabled={busy} onClick={save}>ยืนยันลบสาขา</button></div></>:<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="branch-fields" disabled={busy}>
    <label>ชื่อสาขา<input autoFocus required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>ที่อยู่<textarea rows={3} maxLength={500} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
    <label>เบอร์โทร<input type="tel" maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label>เป้าหมายยอดขายต่อวัน (บาท)<input type="number" min="0" max="100000000" step="0.01" required value={form.target} onChange={e=>setForm({...form,target:e.target.value})}/></label>
    {mode==='add'&&<>{state.tenant.plan!=='Small'&&<label>จำนวนโต๊ะตั้งต้น<input type="number" min="0" max="100" step="1" required value={form.tableCount} onChange={e=>setForm({...form,tableCount:e.target.value})}/></label>}<p className="muted branch-help">{state.tenant.plan!=='Small'&&<>โต๊ะเริ่มต้นมี 4 ที่นั่ง แก้ไขชื่อและที่นั่งได้ที่ตั้งค่าร้าน → จัดการโต๊ะ<br/></>}สาขาใหม่เริ่มด้วยกะปิด กรุณาเปิดกะก่อนขาย{state.tenant.plan==='Enterprise'&&<> และรับเข้าวัตถุดิบเนื่องจากสต๊อกเริ่มต้นเป็น 0</>}</p></>}
   </fieldset><div className="staff-modal-actions"><button type="button" className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="primary" disabled={busy}><Check size={17}/>{busy?'กำลังบันทึก…':'บันทึกสาขา'}</button></div></form>}
  </div></section></div>}
 </>;
}
