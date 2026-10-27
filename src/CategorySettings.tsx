import {useState} from 'react';
import {AlertCircle,ArrowDown,ArrowLeft,ArrowUp,Check,Coffee,Grid2X2,IceCreamBowl,Pencil,Pizza,Plus,Salad,Soup,Trash2,Utensils} from 'lucide-react';
import type {State} from './types';
import DataTable from './DataTable';
import SearchableSelect from './SearchableSelect';
import {api} from './api';
import './category-settings.css';
type Category=State['categories'][number];
const icons:Record<string,typeof Utensils>={Grid2X2,Utensils,Soup,Pizza,Salad,Coffee,IceCreamBowl};
const iconLabels:Record<string,string>={Grid2X2:'ทั่วไป',Utensils:'จานหลัก',Soup:'เส้นและซุป',Pizza:'ทานเล่น',Salad:'สลัด',Coffee:'เครื่องดื่ม',IceCreamBowl:'ของหวาน'};
export default function CategorySettings({state,refresh,notify}:{state:State;refresh:()=>Promise<unknown>;notify:(text:string)=>void}){
 const categories=state.categories.filter(category=>category.id!=='all');
 const rows=categories.map((category,index)=>({...category,order:index+1,count:state.menu.filter(menu=>menu.category===category.id).length}));
 const [mode,setMode]=useState<'edit'|'delete'|null>(null),[selected,setSelected]=useState<Category|null>(null),[form,setForm]=useState({name:'',icon:'Utensils',order:'1'}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function open(category:Category|null,action:'edit'|'delete'='edit'){setSelected(category);setMode(action);setError('');setForm({name:category?.name||'',icon:category?.icon||'Utensils',order:String(category?categories.findIndex(item=>item.id===category.id)+1:categories.length+1)});window.scrollTo({top:0,behavior:'auto'});}
 function close(){if(busy)return;setMode(null);setError('');}
 async function save(){if(busy)return;setBusy(true);setError('');try{
  await api(selected?`/categories/${selected.id}`:'/categories',mode==='delete'?'DELETE':selected?'PATCH':'POST',mode==='delete'?undefined:{...form,order:Number(form.order)});await refresh();setMode(null);notify(mode==='delete'?'ลบประเภทอาหารแล้ว':'บันทึกประเภทอาหารแล้ว');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function move(category:Category,order:number){if(busy)return;setBusy(true);setError('');try{await api(`/categories/${category.id}`,'PATCH',{order});await refresh();notify('จัดลำดับประเภทอาหารแล้ว');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const Icon=icons[form.icon]||Utensils;
 return <section role="tabpanel" id="category-settings-panel" aria-labelledby="category-settings-tab">
  {error&&<div className="error category-error" role="alert"><AlertCircle size={17}/>{error}</div>}
  <div hidden={mode!==null}><section className="panel"><div className="panel-heading"><div><h3>ประเภทอาหาร</h3><p>ใช้ร่วมกันทุกสาขาของร้าน · {categories.length} ประเภท</p></div><button className="primary" disabled={busy} onClick={()=>open(null)}><Plus size={17}/> เพิ่มประเภทอาหาร</button></div>
   <DataTable label="ตารางประเภทอาหาร" rows={rows} rowKey={category=>category.id} searchLabel="ค้นหาประเภทอาหาร" searchPlaceholder="ค้นหาประเภทอาหาร…" searchText={category=>category.name} columns={[
    {key:'order',label:'ลำดับ',value:category=>category.order,render:category=>category.order},
    {key:'name',label:'ประเภทอาหาร',value:category=>category.name,render:category=>{const CategoryIcon=icons[category.icon]||Utensils;return <span className="category-name"><CategoryIcon size={20}/><strong>{category.name}</strong></span>;}},
    {key:'count',label:'เมนูที่ใช้งาน',value:category=>category.count,render:category=>`${category.count} เมนู`},
    {key:'actions',label:'จัดการ',className:'data-table-actions',render:category=><div className="staff-actions"><button className="outline category-move" disabled={busy||category.order===1} aria-label={`เลื่อนขึ้น ${category.name}`} onClick={()=>void move(category,category.order-1)}><ArrowUp size={15}/></button><button className="outline category-move" disabled={busy||category.order===categories.length} aria-label={`เลื่อนลง ${category.name}`} onClick={()=>void move(category,category.order+1)}><ArrowDown size={15}/></button><button className="outline" disabled={busy} aria-label={`แก้ไขประเภท ${category.name}`} onClick={()=>open(category)}><Pencil size={15}/> แก้ไข</button><button className="danger-button" disabled={busy||category.count>0||categories.length===1} title={category.count?'ย้ายเมนูไปประเภทอื่นก่อนลบ':undefined} aria-label={`ลบประเภท ${category.name}`} onClick={()=>open(category,'delete')}><Trash2 size={15}/> ลบ</button></div>},
   ]}/></section><div className="info-banner"><Utensils size={21}/><div><strong>ประเภทอาหารจะแสดงในหน้าขาย เมนูอาหาร และหน้าลูกค้า QR</strong><p>แก้ไขชื่อและไอคอนได้โดยเมนูเดิมยังอยู่ในประเภทเดิม ต้องย้ายเมนูไปประเภทอื่นก่อนลบประเภทที่มีการใช้งาน</p></div></div></div>
  {mode&&<section className="category-editor" role="region" aria-label={mode==='delete'?'ลบประเภทอาหาร':selected?'แก้ไขประเภทอาหาร':'เพิ่มประเภทอาหาร'}><button className="text-button category-back" disabled={busy} onClick={close}><ArrowLeft size={17}/> กลับรายการประเภทอาหาร</button><section className="panel"><div className="panel-heading"><div><h2>{mode==='delete'?'ลบประเภทอาหาร':selected?'แก้ไขประเภทอาหาร':'เพิ่มประเภทอาหาร'}</h2><p>ใช้กับเมนูอาหารทุกสาขาในร้าน</p></div><Icon size={24}/></div>
   {mode==='delete'?<div className="form-body"><p>ต้องการลบประเภท <strong>{selected?.name}</strong> ใช่หรือไม่?</p><div className="staff-modal-actions"><button className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="danger-button" disabled={busy} onClick={()=>void save()}>ยืนยันลบประเภทอาหาร</button></div></div>:<form className="form-body" onSubmit={event=>{event.preventDefault();void save();}}><fieldset className="category-fields" disabled={busy}><label>ชื่อประเภทอาหาร<input autoFocus required maxLength={80} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><div><span className="category-field-label">ไอคอน</span><SearchableSelect label="ไอคอนประเภทอาหาร" variant="field" clearable={false} disabled={busy} value={form.icon} onChange={icon=>setForm({...form,icon})} options={Object.entries(iconLabels).map(([value,label])=>({value,label}))}/></div><label>ลำดับการแสดง<input required type="number" min="1" max={categories.length+(selected?0:1)} step="1" value={form.order} onChange={event=>setForm({...form,order:event.target.value})}/></label></fieldset><div className="staff-modal-actions"><button type="button" className="outline" disabled={busy} onClick={close}>ยกเลิก</button><button className="primary" disabled={busy}><Check size={17}/> {busy?'กำลังบันทึก…':'บันทึกประเภทอาหาร'}</button></div></form>}
  </section></section>}
 </section>;
}
