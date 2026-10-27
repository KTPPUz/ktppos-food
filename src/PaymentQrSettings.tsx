import {useRef,useState} from 'react';
import {AlertCircle,Check,QrCode,Trash2} from 'lucide-react';
import type {PaymentQr,State} from './types';
import {api} from './api';
import MenuImagePicker from './MenuImagePicker';
import SearchableSelect from './SearchableSelect';
import './payment-qr.css';
export function ManualQrPayment({config,verified,onChange}:{config?:PaymentQr;verified:boolean;onChange:(value:boolean)=>void}){
 if(!config?.enabled||!config.image)return <div className="info-banner"><AlertCircle size={22}/><p>สาขานี้ยังไม่ได้ตั้งค่า QR รับชำระเงิน กรุณาติดต่อเจ้าของร้านหรือเลือกเงินสด</p></div>;
 return <div className="manual-payment"><img src={config.image} alt="QR รับชำระเงินของร้าน"/><strong>{config.accountName}</strong><small>{config.bankName} · {config.accountNumber}</small><p>{config.instructions}</p><p>ให้ลูกค้ากรอกยอดตามบิล แล้วตรวจสอบเงินเข้าบัญชีร้านก่อนยืนยัน</p><label className="qr-checkbox"><input type="checkbox" checked={verified} onChange={e=>onChange(e.target.checked)}/><span><b>ตรวจสอบเงินเข้าบัญชีแล้ว ยอดตรงกับบิล</b><small>ยืนยันหลังตรวจสอบยอดในบัญชีร้านเรียบร้อยแล้ว</small></span></label></div>;
}
export default function PaymentQrSettings({state,branch,onBranchChange,refresh,notify}:{state:State;branch:string;onBranchChange:(branch:string)=>void;refresh:()=>Promise<unknown>;notify:(text:string)=>void}){
 const selected=state.branches.find(item=>item.id===branch),qr=selected?.paymentQr;
 const [form,setForm]=useState({bankName:qr?.bankName||'',accountName:qr?.accountName||'',accountNumber:qr?.accountNumber||'',instructions:qr?.instructions||'',enabled:qr?.enabled||false});
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const owner=state.user.role==='Owner';
 function chooseBranch(next:string){
  if(lock.current||next===branch||!state.branches.some(item=>item.id===next))return;
  const original={bankName:qr?.bankName||'',accountName:qr?.accountName||'',accountNumber:qr?.accountNumber||'',instructions:qr?.instructions||'',enabled:qr?.enabled||false};
  if((file||JSON.stringify(form)!==JSON.stringify(original))&&!confirm('มีข้อมูล QR ที่ยังไม่ได้บันทึก ต้องการเปลี่ยนสาขาและละทิ้งการแก้ไขหรือไม่?'))return;
  onBranchChange(next);
 }
 async function save(remove=false){if(lock.current)return;if(remove&&!confirm('ลบ QR รับชำระเงินของสาขานี้?'))return;lock.current=true;setBusy(true);setError('');try{
  if(remove){await api(`/branches/${branch}/payment-qr`,'DELETE');setForm({bankName:'',accountName:'',accountNumber:'',instructions:'',enabled:false});}
  else if(file){const data=new FormData();data.append('_method','PATCH');data.append('payload',JSON.stringify(form));data.append('image',file);await api(`/branches/${branch}/payment-qr`,'POST',data);}
  else await api(`/branches/${branch}/payment-qr`,'PATCH',form);
  await refresh();setFile(null);notify(remove?'ลบ QR รับชำระเงินแล้ว':'บันทึก QR รับชำระเงินแล้ว');
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 return <><section className="panel payment-qr-branch" aria-label="เลือกสาขาสำหรับ QR รับชำระเงิน"><div className="payment-qr-branch-label"><strong>สาขาที่ต้องการจัดการ QR รับชำระเงิน</strong><small>รูป QR และข้อมูลบัญชีแยกตามสาขา</small></div><SearchableSelect variant="field" label="สาขาสำหรับ QR รับชำระเงิน" value={branch} clearable={false} disabled={busy} onChange={chooseBranch} options={state.branches.map(item=>({value:item.id,label:`สาขา${item.name}`}))}/></section><section className="panel payment-qr-panel"><div className="panel-heading"><div><h3>QR รับชำระเงิน · สาขา{selected?.name}</h3><p>รับโอนผ่าน QR ของร้าน โดยพนักงานตรวจสอบยอดเงินเอง</p></div><QrCode size={23}/></div><form className="form-body" onSubmit={e=>{e.preventDefault();void save();}}>
  {error&&<div className="error" role="alert"><AlertCircle size={17}/>{error}</div>}
  <fieldset className="qr-fields" disabled={!owner||busy}><MenuImagePicker image={qr?.image||''} file={file} disabled={!owner||busy} onChange={setFile} label="รูป QR รับชำระเงิน" uploadLabel="แนบรูป QR" description="ใช้รูป QR จากแอปธนาคารหรือพร้อมเพย์ของร้าน กรุณาทดลองสแกนและตรวจชื่อบัญชีก่อนเปิดใช้งาน"/>
   <label>ธนาคาร / พร้อมเพย์<input maxLength={100} value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})}/></label>
   <label>ชื่อบัญชี<input required={form.enabled} maxLength={100} value={form.accountName} onChange={e=>setForm({...form,accountName:e.target.value})}/></label>
   <label>เลขบัญชี / หมายเลขพร้อมเพย์<input maxLength={50} value={form.accountNumber} onChange={e=>setForm({...form,accountNumber:e.target.value})}/></label>
   <label>ข้อความแจ้งลูกค้า<textarea maxLength={300} rows={2} value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})}/></label>
   <label className="qr-checkbox"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/><span>เปิดใช้ QR รับชำระเงินที่สาขานี้</span></label>
  </fieldset>
  <div className="info-banner"><AlertCircle size={21}/><div><strong>พนักงานต้องตรวจสอบเงินเข้าบัญชีก่อนยืนยันรับชำระ</strong><p>QR นี้ไม่ตรวจสอบสลิปหรือยอดโอนอัตโนมัติ ลูกค้าต้องกรอกยอดให้ตรงกับบิล และระบบจะบันทึกผู้ยืนยันพร้อมเวลา</p></div></div>
  {owner&&<div className="button-row"><button className="primary" disabled={busy}><Check size={17}/> บันทึก QR รับชำระเงิน</button>{qr&&<button type="button" className="danger-button" disabled={busy} onClick={()=>void save(true)}><Trash2 size={17}/> ลบ QR</button>}</div>}
 </form></section></>;
}
