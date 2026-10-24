import {useState} from 'react';
import {FlaskConical,RotateCcw} from 'lucide-react';
import './demo.css';

export default function DemoBanner(){
 const [error,setError]=useState('');
 async function reset(){
  if(!confirm('รีเซ็ตข้อมูลจำลองทั้งหมดในเบราว์เซอร์นี้ และกลับไปหน้าเข้าสู่ระบบ?'))return;
  try{const {resetDemo}=await import('./demo/transport.mjs');resetDemo();}catch{setError('รีเซ็ตไม่ได้ กรุณาอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์');}
 }
 return <aside className="demo-banner" aria-label="โหมดทดลอง"><div><FlaskConical size={17}/><strong>โหมด Demo</strong><span>ข้อมูลจำลองในเบราว์เซอร์นี้ · ไม่เชื่อมออเดอร์ข้ามเครื่อง</span></div><button type="button" onClick={reset}><RotateCcw size={14}/>รีเซ็ตข้อมูล</button>{error&&<span role="alert">{error}</span>}</aside>;
}
