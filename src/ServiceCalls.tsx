import {useEffect,useRef} from 'react';
import {BellRing,ReceiptText,Check} from 'lucide-react';
import type {State} from './types';
import {api} from './api';
const kind={staff:{label:'เรียกพนักงาน',Icon:BellRing},bill:{label:'ขอเช็คบิล',Icon:ReceiptText}};
function beep(){try{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=880;gain.gain.value=.08;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.25);osc.onended=()=>ctx.close();}catch{/* autoplay may be blocked */}}
export default function ServiceCalls({state,tableName,refresh,notify}:{state:State;tableName:(id:string)=>string;refresh:()=>Promise<unknown>;notify:(message:string)=>void}){
 const calls=(state.tableSessions||[]).flatMap(s=>(s.calls||[]).map(c=>({...c,session:s}))).sort((a,b)=>a.at.localeCompare(b.at));
 const seen=useRef<Set<string>|null>(null);
 useEffect(()=>{
  const ids=new Set(calls.map(c=>c.id));
  if(seen.current){const fresh=calls.filter(c=>!seen.current!.has(c.id));if(fresh.length){notify(fresh.map(c=>`โต๊ะ ${tableName(c.session.tableId)} ${kind[c.type].label}`).join(' · '));beep();}}
  seen.current=ids;
 },[calls.map(c=>c.id).join(',')]);
 useEffect(()=>{const base=document.title.replace(/^\(\d+\) /,'');document.title=calls.length?`(${calls.length}) ${base}`:base;return()=>{document.title=base;};},[calls.length]);
 async function resolve(sessionId:string,callId:string){try{await api(`/table-sessions/${sessionId}/calls/${callId}/resolve`,'POST');await refresh();}catch(e){notify((e as Error).message);}}
 if(!calls.length)return null;
 const multi=state.branches.length>1;
 return <aside className="service-calls" aria-live="polite" aria-label="การเรียกจากโต๊ะ">{calls.map(c=>{const {label,Icon}=kind[c.type];return <div key={c.id} className={'service-call '+c.type}><Icon size={20}/><div><strong>โต๊ะ {tableName(c.session.tableId)}</strong><span>{label}{multi&&` · ${state.branches.find(b=>b.id===c.session.branchId)?.name||''}`} · {new Date(c.at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.</span></div><button className="soft-button" onClick={()=>resolve(c.session.id,c.id)}><Check size={15}/> รับทราบ</button></div>;})}</aside>;
}
