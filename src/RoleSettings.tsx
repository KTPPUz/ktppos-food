import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, LockKeyhole, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { RoleDefinition, State } from './types';
import { api } from './api';
import './role-settings.css';

type Form = { name: string; menus: string[]; scope: 'branch' | 'tenant'; refund: boolean };
const empty: Form = { name: '', menus: [], scope: 'branch', refund: false };
export default function RoleSettings({ state, refresh, notify }: { state: State; refresh: () => Promise<unknown>; notify: (text: string) => void }) {
  const [editing, setEditing] = useState<RoleDefinition | null>(null), [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [form, setForm] = useState<Form>(empty), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), returnFocus = useRef('role-add-button'), heading = useRef<HTMLHeadingElement>(null);
  const menus = state.roleMenus || [];
  useEffect(() => { if (mode === 'edit') { window.scrollTo({ top: 0, behavior: 'auto' }); heading.current?.focus(); } else if (mode === null) { (document.getElementById(returnFocus.current) || document.getElementById('role-add-button'))?.focus(); } }, [mode]);
  function close() { if (lock.current) return; setMode(null); setError(''); }
  function open(role: RoleDefinition | null, action: 'edit' | 'delete' = 'edit') {
    returnFocus.current = role ? `role-edit-${role.id}` : 'role-add-button'; setEditing(role); setError(''); setMode(action);
    setForm(role ? { name: role.name, menus: [...role.menus], scope: role.scope, refund: role.permissions.includes('refund') } : empty);
  }
  async function save() {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      await api(editing ? `/roles/${editing.id}` : '/roles', mode === 'delete' ? 'DELETE' : editing ? 'PATCH' : 'POST', mode === 'delete' ? undefined : form);
      await refresh(); setMode(null); notify(mode === 'delete' ? 'ลบบทบาทแล้ว' : 'บันทึกบทบาทและสิทธิ์แล้ว');
    } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  if (mode === 'edit') return <section role="tabpanel" id="role-settings-panel" aria-labelledby="role-settings-tab"><section className="role-editor-page" role="region" aria-labelledby="role-editor-title">
    <button type="button" className="text-button role-back" disabled={busy} onClick={close}><ArrowLeft size={17} /> กลับรายการบทบาท</button>
    <div className="role-page-heading"><div><h2 id="role-editor-title" ref={heading} tabIndex={-1}>{editing ? 'แก้ไขบทบาท' : 'เพิ่มบทบาท'}</h2><p>กำหนดเมนูที่ทีมงานเข้าถึงได้และขอบเขตข้อมูลของบทบาทนี้</p></div><LockKeyhole size={24} /></div>
    <div className="panel role-page-panel">{error && <div className="error" role="alert"><AlertCircle size={17} />{error}</div>}
      <form className="role-page-form" onSubmit={e => { e.preventDefault(); void save(); }}><fieldset className="role-fields" disabled={busy}>
        <label>ชื่อบทบาท<input autoFocus required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>ขอบเขตข้อมูล<select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as Form['scope'] })}><option value="branch">เฉพาะสาขาที่ได้รับมอบหมาย</option><option value="tenant">ทุกสาขาในร้าน</option></select></label>
        <div><strong>เมนูที่มองเห็นและใช้งานได้</strong><p className="muted">การเปิดเมนูจะให้สิทธิ์ทำรายการในเมนูนั้นด้วย</p><div className="role-menu-options">{menus.map(menu => <label key={menu.id}><input type="checkbox" checked={form.menus.includes(menu.id)} onChange={e => setForm({ ...form, menus: e.target.checked ? [...form.menus, menu.id] : form.menus.filter(id => id !== menu.id) })} /><span>{menu.label}{menu.plan && <small> {menu.plan} ขึ้นไป</small>}</span></label>)}</div></div>
        <label className="role-extra"><input type="checkbox" checked={form.refund} onChange={e => setForm({ ...form, refund: e.target.checked })} /><span>ให้ส่วนลด ยกเลิกรายการ และคืนเงิน</span></label>
        <p className="muted">การจัดการสาขา ทีมงาน และบทบาทยังจำกัดเฉพาะเจ้าของร้าน บทบาทอื่นที่ได้รับสิทธิ์เมนูสาขาหรือทีมงานใช้ดูข้อมูลได้<br />ภาพรวมร้านและรายงานการขายใช้สิทธิ์ข้อมูลเดียวกัน เช่นเดียวกับจัดการโต๊ะและ QR สั่งอาหาร</p>
      </fieldset><div className="staff-modal-actions"><button type="button" className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="primary" disabled={busy}><Check size={17} />{busy ? 'กำลังบันทึก…' : 'บันทึกบทบาท'}</button></div></form>
    </div>
  </section></section>;
  return <section role="tabpanel" id="role-settings-panel" aria-labelledby="role-settings-tab">
    <div className="panel"><div className="panel-heading"><div><h3>บทบาทและสิทธิ์</h3><p>เลือกเมนูและสิทธิ์ใช้งานสำหรับทีมงานแต่ละบทบาท</p></div><button id="role-add-button" className="primary" onClick={() => open(null)}><Plus size={17} /> เพิ่มบทบาท</button></div>
      <div className="table-scroll"><table><thead><tr><th>บทบาท</th><th>เมนูที่เข้าถึงได้</th><th>ขอบเขต</th><th>ทีมงาน</th><th>จัดการ</th></tr></thead><tbody>{state.roles?.map(role => <tr key={role.id}>
        <td><strong>{role.name}</strong>{role.protected && <small className="block"><LockKeyhole size={12} /> บทบาทหลักของร้าน</small>}</td>
        <td><div className="role-tags">{role.menus.length ? role.menus.map(id => <span key={id}>{menus.find(m => m.id === id)?.label || id}</span>) : <small>ยังไม่มีสิทธิ์เข้าถึงเมนู</small>}</div></td>
        <td>{role.scope === 'tenant' ? 'ทุกสาขาในร้าน' : 'สาขาที่ได้รับมอบหมาย'}</td><td>{role.members} คน</td>
        <td>{!role.protected && <div className="staff-actions"><button id={`role-edit-${role.id}`} className="outline" aria-label={`แก้ไขบทบาท ${role.name}`} onClick={() => open(role)}><Pencil size={15} /> แก้ไข</button><button className="danger-button" disabled={role.members > 0} title={role.members ? 'เปลี่ยนบทบาททีมงานก่อนลบ' : undefined} aria-label={`ลบบทบาท ${role.name}`} onClick={() => open(role, 'delete')}><Trash2 size={15} /> ลบ</button></div>}</td>
      </tr>)}</tbody></table></div>
    </div>
    <div className="info-banner"><LockKeyhole size={21} /><div><strong>กำหนดบทบาทให้ทีมงานได้ที่แท็บ “ทีมงาน”</strong><p>เฉพาะเจ้าของร้านจัดการบทบาทได้ · ต้องย้ายทีมงานออกก่อนลบบทบาท · สิทธิ์เจ้าของร้านคงไว้เสมอ</p></div></div>
    {mode === 'delete' && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }} onKeyDown={e => { if (e.key === 'Escape') close(); }}><section className="modal" role="dialog" aria-modal="true" aria-label="ลบบทบาท"><header><h2>ลบบทบาท</h2><button className="icon-btn" aria-label="ปิด" disabled={busy} onClick={close}><X size={20} /></button></header><div className="modal-body">
      {error && <div className="error" role="alert"><AlertCircle size={17} />{error}</div>}
      <p>ต้องการลบบทบาท <strong>{editing?.name}</strong> ใช่หรือไม่?</p><div className="staff-modal-actions"><button autoFocus className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="danger-button" disabled={busy} onClick={save}>ยืนยันลบบทบาท</button></div>
    </div></section></div>}

  </section>;
}
