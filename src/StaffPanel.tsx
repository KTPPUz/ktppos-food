import {useEffect,useRef,useState} from 'react';
import {AlertCircle,Check,LockKeyhole,Pencil,Plus,Trash2,X} from 'lucide-react';
import type {Role,State,User} from './types';
import {api} from './api';
import {roleLabel,staffRoles} from './roles';
import './staff.css';

type Form={name:string;email:string;role:Role;branchId:string;pin:string};
export default function StaffPanel({state,branch,refresh,notify}:{state:State;branch:string;refresh:()=>Promise<unknown>;notify:(message:string)=>void}){
  const [mode,setMode]=useState<'add'|'edit'|'delete'|null>(null);
  const [selected,setSelected]=useState<User|null>(null);
  const [form,setForm]=useState<Form>({name:'',email:'',role:'Waiter',branchId:branch,pin:''});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false),opener=useRef<HTMLElement|null>(null);
  const canManage=state.user.role==='Owner';
  function close(){if(lock.current)return;setMode(null);setError('');opener.current?.focus();}
  useEffect(()=>{
    if(!mode)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!lock.current){setMode(null);setError('');opener.current?.focus();}};
    document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
  },[mode]);
  function open(next:'add'|'edit'|'delete',employee?:User){
    opener.current=document.activeElement as HTMLElement;
    setSelected(employee||null);setError('');
    setForm(employee?{name:employee.name,email:employee.email,role:employee.role,branchId:employee.branchId,pin:''}:{name:'',email:'',role:'Waiter',branchId:branch,pin:''});
    setMode(next);
  }
  async function submit(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      if(mode==='delete')await api(`/users/${selected!.id}`,'DELETE');
      else{
        const {pin,...fields}=form;
        await api(mode==='add'?'/users':`/users/${selected!.id}`,mode==='add'?'POST':'PATCH',{...fields,...(pin?{pin}:{} )});
      }
      await refresh();setMode(null);opener.current?.focus();
      notify(mode==='add'?'เพิ่มทีมงานแล้ว':mode==='edit'?'บันทึกข้อมูลทีมงานแล้ว':'ลบทีมงานแล้ว');
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  const title=mode==='add'?'เพิ่มทีมงาน':mode==='edit'?'แก้ไขทีมงาน':'ลบทีมงาน';
  return <>
    <section className="panel staff-panel">
      <div className="panel-heading"><div><h3>ทีมงาน {state.users.length} คน</h3><p>รายชื่อทีมงานและสิทธิ์การใช้งานในร้าน</p></div>{canManage&&<button className="primary" onClick={()=>open('add')}><Plus size={17}/> เพิ่มทีมงาน</button>}</div>
      <div className="table-scroll"><table><thead><tr><th>พนักงาน</th><th>อีเมล</th><th>บทบาท</th><th>สาขา</th>{canManage&&<th>จัดการ</th>}</tr></thead><tbody>{state.users.map(employee=><tr key={employee.id}>
        <td><div className="staff-name"><div className="avatar">{employee.name.slice(0,1)}</div><strong>{employee.name} {employee.id===state.user.id&&<small>(คุณ)</small>}</strong></div></td>
        <td>{employee.email}</td><td><span className="badge role">{roleLabel(employee.role)}</span></td><td>{state.branches.find(b=>b.id===employee.branchId)?.name||employee.branchId}</td>
        {canManage&&<td>{employee.id===state.user.id?<small className="muted">บัญชีที่กำลังใช้งาน</small>:<div className="staff-actions"><button className="outline" aria-label={`แก้ไข ${employee.name}`} onClick={()=>open('edit',employee)}><Pencil size={15}/> แก้ไข</button><button className="danger-button" aria-label={`ลบ ${employee.name}`} onClick={()=>open('delete',employee)}><Trash2 size={15}/> ลบ</button></div>}</td>}
      </tr>)}</tbody></table></div>
    </section>
    <div className="info-banner"><LockKeyhole size={21}/><div><strong>{canManage?'เจ้าของร้านจัดการทีมงานได้ทุกสาขาในร้าน':'เจ้าของร้านเป็นผู้จัดการข้อมูลทีมงาน'}</strong><p>เพิ่มชื่อ อีเมล บทบาท สาขา และ PIN เข้าสู่ระบบ · เมื่อเปลี่ยน PIN บทบาท หรือสาขา ทีมงานต้องเข้าสู่ระบบใหม่</p></div></div>
    {mode&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{mode==='delete'?'ตรวจสอบรายชื่อก่อนยืนยัน':'กำหนดข้อมูลและสิทธิ์เข้าถึงระบบของทีมงาน'}</p></div><button className="icon-btn" aria-label="ปิด" disabled={busy} onClick={close}><X size={21}/></button></header><div className="modal-body">
      {error&&<div className="error" role="alert"><AlertCircle size={17}/>{error}</div>}
      {mode==='delete'?<><p>ต้องการลบ <strong>{selected?.name}</strong> ({selected?.email}) ออกจากทีมงานใช่หรือไม่?</p><p className="muted">บัญชีนี้จะเข้าสู่ระบบไม่ได้ ประวัติการขายและการทำรายการเดิมยังคงอยู่</p><div className="staff-modal-actions"><button autoFocus className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="danger-button" disabled={busy} onClick={submit}><Trash2 size={17}/>{busy?'กำลังลบ…':'ยืนยันลบทีมงาน'}</button></div></>:<form onSubmit={e=>{e.preventDefault();void submit();}}>
        <fieldset className="staff-fields" disabled={busy}>
          <label>ชื่อทีมงาน<input autoFocus required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} autoComplete="name"/></label>
          <label>อีเมล<input type="email" required maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} autoComplete="off"/></label>
          <div className="staff-form-grid"><label>บทบาท<select value={form.role} onChange={e=>setForm({...form,role:e.target.value as Role})}>{staffRoles.map(role=><option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <label>สาขา<select value={form.branchId} onChange={e=>setForm({...form,branchId:e.target.value})}>{state.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
          <label>{mode==='add'?'PIN เข้าสู่ระบบ':'PIN ใหม่ (เว้นว่างเพื่อใช้ PIN เดิม)'}<input type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required={mode==='add'} value={form.pin} onChange={e=>setForm({...form,pin:e.target.value})} autoComplete="new-password" placeholder="ตัวเลข 4–8 หลัก"/></label>
        </fieldset>
        <div className="staff-modal-actions"><button type="button" className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="primary" disabled={busy}><Check size={17}/>{busy?'กำลังบันทึก…':mode==='add'?'เพิ่มทีมงาน':'บันทึกการแก้ไข'}</button></div>
      </form>}
    </div></section></div>}
  </>;
}
