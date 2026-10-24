import {ArrowUpRight,CheckCircle2,Server,UtensilsCrossed} from 'lucide-react';
import './backend-setup.css';

export default function BackendSetup(){
  return <main className="backend-setup"><section className="backend-setup-card">
    <div className="backend-setup-brand"><div className="brand-mark"><UtensilsCrossed size={25}/></div><strong>KTP Table</strong></div>
    <span className="backend-setup-status"><CheckCircle2 size={15}/> เผยแพร่หน้าเว็บแล้ว</span>
    <h1>หน้าเว็บพร้อมแล้ว<span>.</span></h1>
    <p className="backend-setup-intro">เหลือเชื่อมต่อ Backend เพื่อเปิดรับออเดอร์และใช้งาน POS</p>
    <div className="backend-setup-notice"><Server size={24}/><div><strong>ยังไม่ได้เชื่อมต่อ Backend</strong><p>ตอนนี้เปิดหน้าเว็บผ่าน GitHub Pages ได้แล้ว การเข้าสู่ระบบ สั่งอาหาร และส่งเข้าครัวจะเริ่มใช้งานได้เมื่อเชื่อมต่อบริการสำเร็จ</p></div></div>
    <h2>ขั้นตอนสำหรับผู้ดูแลระบบ</h2>
    <ol>
      <li><strong>เปิด Backend บน Render</strong><p>เชื่อม repository นี้ผ่าน Blueprint โดยใช้ไฟล์ <code>render.yaml</code> แล้วรอให้บริการขึ้น Live</p></li>
      <li><strong>ตั้ง URL API ใน GitHub</strong><p>ไปที่ Settings → Secrets and variables → Actions → Variables แล้วเพิ่ม <code>VITE_API_BASE_URL</code> เป็น URL จริง เช่น <code>https://ชื่อบริการ.onrender.com/api</code></p></li>
      <li><strong>Deploy หน้าเว็บอีกครั้ง</strong><p>ไปที่ Actions → Deploy frontend to GitHub Pages → Run workflow เมื่อสำเร็จ URL เดิมจะแสดงหน้าเข้าสู่ระบบ</p></li>
    </ol>
    <div className="backend-setup-actions"><a className="primary" href="https://github.com/KTPPUz/ktppos-food/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noreferrer">เปิดคู่มือตั้งค่า <ArrowUpRight size={17}/></a><a className="outline" href="https://dashboard.render.com/" target="_blank" rel="noreferrer">เปิด Render <ArrowUpRight size={17}/></a></div>
    <small>บริการ Render ที่ใช้ persistent disk ตามไฟล์นี้มีค่าใช้จ่าย โปรดตรวจรายละเอียดก่อนสร้างบริการ</small>
  </section></main>;
}
