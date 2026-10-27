import {useId,useState} from 'react';
import {AlertCircle,ChevronDown,ChevronUp,RotateCcw,SlidersHorizontal} from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import {salesDateRange,type SalesFilters} from './sales-filters';
import './sales-report-filters.css';
export default function SalesReportFilters({value,onChange,onReset,count}:{value:SalesFilters;onChange:(value:SalesFilters)=>void;onReset:()=>void;count:number}){
 const id=useId(),range=salesDateRange(value),[expanded,setExpanded]=useState(true);
 return <section className={`panel report-filters${expanded?'':' is-collapsed'}`} aria-label="ตัวกรองรายงานการขาย"><div className="report-filters-heading"><button type="button" className="report-filter-toggle" aria-expanded={expanded} aria-controls={`${id}-content`} aria-label={expanded?'ซ่อนตัวกรองรายงาน':'แสดงตัวกรองรายงาน'} title={expanded?'ซ่อนตัวกรองรายงาน':'แสดงตัวกรองรายงาน'} onClick={()=>setExpanded(current=>!current)}><SlidersHorizontal size={17}/><strong>ตัวกรองรายงาน</strong><span role="status">{count.toLocaleString('th-TH')} บิล</span>{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button><button type="button" className="text-button" onClick={onReset}><RotateCcw size={14}/> ล้างตัวกรอง</button></div>
 <div id={`${id}-content`} hidden={!expanded}>
 <div className="report-filters-grid">
  <div className="report-filter-field"><span>ช่วงเวลา</span><SearchableSelect variant="field" label="ช่วงเวลารายงาน" clearable={false} value={value.period} onChange={period=>onChange({...value,period:period as SalesFilters['period']})} options={[{value:'today',label:'วันนี้'},{value:'yesterday',label:'เมื่อวาน'},{value:'7days',label:'7 วันล่าสุด'},{value:'30days',label:'30 วันล่าสุด'},{value:'month',label:'เดือนนี้'},{value:'custom',label:'กำหนดช่วงวันที่'},{value:'all',label:'ทั้งหมด'}]}/></div>
  <div className="report-filter-field"><span>ประเภทออเดอร์</span><SearchableSelect variant="field" label="ประเภทออเดอร์ในรายงาน" clearable={false} value={value.type} onChange={type=>onChange({...value,type:type as SalesFilters['type']})} options={[{value:'all',label:'ทุกประเภท'},{value:'dinein',label:'ทานที่ร้าน'},{value:'takeaway',label:'กลับบ้าน'},{value:'delivery',label:'เดลิเวอรี'}]}/></div>
  <div className="report-filter-field"><span>วิธีชำระเงิน</span><SearchableSelect variant="field" label="วิธีชำระเงินในรายงาน" clearable={false} value={value.method} onChange={method=>onChange({...value,method:method as SalesFilters['method']})} options={[{value:'all',label:'ทุกวิธี'},{value:'cash',label:'เงินสด'},{value:'qr',label:'QR โอนเงิน'},{value:'card',label:'บัตร'}]}/></div>
  <div className="report-filter-field"><span>สถานะบิล</span><SearchableSelect variant="field" label="สถานะบิลในรายงาน" clearable={false} value={value.status} onChange={status=>onChange({...value,status:status as SalesFilters['status']})} options={[{value:'all',label:'ทุกสถานะ'},{value:'paid',label:'ชำระแล้ว'},{value:'refunded',label:'คืนเงินแล้ว'}]}/></div>
 </div>
 {value.period==='custom'&&<div className="report-date-range"><label htmlFor={`${id}-from`}>วันที่เริ่มต้น<input id={`${id}-from`} type="date" value={value.from} max={value.to||undefined} onChange={event=>onChange({...value,from:event.target.value})}/></label><label htmlFor={`${id}-to`}>วันที่สิ้นสุด<input id={`${id}-to`} type="date" value={value.to} min={value.from||undefined} onChange={event=>onChange({...value,to:event.target.value})}/></label></div>}
 {range.error?<p className="report-filter-error" role="alert"><AlertCircle size={15}/>{range.error}</p>:<p className="report-filter-note">กรองตามวันที่ชำระบิล เวลาไทย · รวมวันเริ่มต้นและวันสิ้นสุด · บิลคืนเงินอ้างอิงวันที่ชำระเดิม</p>}
 </div>
 {!expanded&&(range.error?<p className="report-filter-error" role="alert"><AlertCircle size={15}/>{range.error}</p>:<p className="report-filter-note">ตัวกรองที่เลือกยังมีผลกับรายงาน · คลิกเพื่อแสดงตัวกรองอีกครั้ง</p>)}
 </section>;
}
