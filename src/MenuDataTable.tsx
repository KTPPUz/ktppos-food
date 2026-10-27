import {ArrowUpRight,Plus,Trash2} from 'lucide-react';
import DataTable from './DataTable';
import SearchableSelect from './SearchableSelect';
import MenuPrice from './MenuPrice';
import {menuPrice,menuDiscountLabel} from '../shared/pricing.mjs';
import type {MenuItem,State} from './types';
const baht=(value:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:2,minimumFractionDigits:0}).format(value);
export default function MenuDataTable({state,branch,search,onSearch,category,onCategory,busy,onAdd,onEdit,onDelete,onToggle}:{state:State;branch:string;search:string;onSearch:(value:string)=>void;category:string;onCategory:(value:string)=>void;busy:boolean;onAdd:()=>void;onEdit:(menu:MenuItem)=>void;onDelete:(menu:MenuItem)=>void;onToggle:(menu:MenuItem)=>void}){
 const categoryName=(menu:MenuItem)=>state.categories.find(item=>item.id===menu.category)?.name||menu.category;
 return <><p className="muted" style={{marginBottom:16}}>ป้ายขายดี: 5 อันดับจากจำนวนขายในบิลชำระแล้วของร้านช่วง 30 วันล่าสุด ไม่นับบิลคืนเงิน</p><section className="panel"><div className="panel-heading menu-table-heading"><h3>รายการเมนูอาหาร</h3><div className="menu-table-filters"><SearchableSelect label="หมวดเมนู" variant="field" clearable={false} value={category} onChange={onCategory} options={state.categories.map(item=>({value:item.id,label:item.name}))}/><button className="primary" onClick={onAdd}><Plus size={17}/> เพิ่มเมนูอาหาร</button></div></div>
 <DataTable label="ตารางเมนูอาหาร" rows={state.menu.filter(menu=>category==='all'||menu.category===category)} totalCount={state.menu.length} rowKey={menu=>menu.id} searchValue={search} onSearchChange={onSearch} searchLabel="ค้นหาเมนูเพื่อแก้ไข" searchPlaceholder="ค้นหาเมนูอาหาร…" resetKey={`${branch}:${category}`} searchText={menu=>`${menu.name} ${menu.en} ${categoryName(menu)} ${menu.price} ${menu.overrides[branch]??menu.price} ${menu.available?'พร้อมขาย':'หมด'}`} columns={[
  {key:'name',label:'เมนูอาหาร',value:menu=>menu.name,render:menu=><div className="table-product"><img src={menu.image} alt=""/><div><strong>{menu.name}</strong><small>{menu.en}</small></div></div>},
  {key:'category',label:'หมวดหมู่',value:categoryName,render:categoryName},
  {key:'price',label:'ราคากลาง',value:menu=>menu.price,render:menu=>baht(menu.price)},
  {key:'branchPrice',label:'ราคาสาขา',value:menu=>menu.overrides[branch]??menu.price,render:menu=>baht(menu.overrides[branch]??menu.price)},
  {key:'discountPrice',label:'ราคาหลังส่วนลด',value:menu=>menuPrice(menu,branch).price,render:menu=><><MenuPrice menu={menu} branch={branch}/><small className="menu-discount-description">{menuDiscountLabel(menu.discount)||'ไม่มีส่วนลด'}</small></>},
  {key:'available',label:'สถานะ',value:menu=>menu.available,render:menu=><><button className={'toggle '+(menu.available?'on':'')} aria-label={'สถานะพร้อมขาย '+menu.name} aria-pressed={menu.available} disabled={busy} onClick={()=>onToggle(menu)}><i/></button> {menu.available?'พร้อมขาย':'หมด'}</>},
  {key:'actions',label:'จัดการ',className:'data-table-actions',render:menu=><div className="staff-actions"><button className="text-button" onClick={()=>onEdit(menu)}>แก้ไข <ArrowUpRight size={14}/></button><button className="danger-button" aria-label={`ลบเมนู ${menu.name}`} onClick={()=>onDelete(menu)}><Trash2 size={14}/> ลบ</button></div>},
 ]}/></section></>;
}
