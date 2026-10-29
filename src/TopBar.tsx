import {useEffect,useState} from 'react';
import {Menu as MenuIcon,RefreshCw,Store,CalendarDays,Clock} from 'lucide-react';
import type {State} from './types';
import ThemeToggle from './ThemeToggle';
import './topbar.css';
const zone='Asia/Bangkok';
type Props={title:string;state:State;branch:string;busy:boolean;syncedAt:number;onMenu:()=>void;onBranch:(id:string)=>void;onRefresh:()=>void};
export default function TopBar({title,state,branch,busy,syncedAt,onMenu,onBranch,onRefresh}:Props){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(timer);},[]);
 const shift=state.shifts.find(s=>s.branchId===branch),single=state.branches.length<2;
 const name=(id:string)=>'สาขา'+(state.branches.find(b=>b.id===id)?.name||'');
 return <header className="topbar">
  <div className="topbar-title"><button className="icon-btn mobile-toggle" aria-label="เมนูหลัก" onClick={onMenu}><MenuIcon/></button><strong className="topbar-title-text">{title}</strong></div>
  <div className="top-actions">
   <span className="top-clock" title={now.toLocaleDateString('th-TH',{dateStyle:'full',timeZone:zone})}><CalendarDays size={15}/><span className="top-clock-date">{now.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:zone})}</span><b><Clock size={14}/>{now.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:zone})}</b></span>
   {shift&&<span className={'shift-chip '+(shift.open?'open':'closed')} role="status"><i/><span>{shift.open?'เปิดกะ':'ปิดกะ'}</span></span>}
   <div className="branch-select"><Store size={16}/>{single?<strong className="branch-name">{name(branch||state.user.branchId)}</strong>:<select aria-label="สาขา" value={branch} onChange={e=>onBranch(e.target.value)}>{state.branches.map(b=><option key={b.id} value={b.id}>{name(b.id)}</option>)}</select>}</div>
   {state.user.role==='Owner'&&<span className="plan-chip" title="แพ็กเกจที่ใช้งาน">{state.tenant.plan}</span>}
   <ThemeToggle/>
   <button className={'icon-btn refresh'+(busy?' spinning':'')} aria-label="รีเฟรชข้อมูล" title={'อัปเดตล่าสุด '+new Date(syncedAt).toLocaleTimeString('th-TH',{timeZone:zone})} onClick={onRefresh}><RefreshCw size={18}/></button>
  </div>
 </header>;
}
