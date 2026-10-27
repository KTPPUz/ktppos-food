import {Plus} from 'lucide-react';
import DataTable from './DataTable';
import type {Ingredient} from './types';
export default function InventoryDataTable({rows,branch,search,onSearch,onAdjust}:{rows:Ingredient[];branch:string;search:string;onSearch:(value:string)=>void;onAdjust:(ingredient:Ingredient)=>void}){
 return <section className="panel"><div className="panel-heading"><h3>วัตถุดิบในคลัง</h3></div><DataTable label="ตารางวัตถุดิบ" rows={rows} rowKey={row=>row.id} resetKey={branch} searchValue={search} onSearchChange={onSearch} searchLabel="ค้นหาวัตถุดิบ" searchPlaceholder="ค้นหาวัตถุดิบ…" searchText={row=>`${row.name} ${row.unit} ${row.stock} ${row.minimum} ${row.stock<=row.minimum?'ใกล้หมด':'เพียงพอ'}`} columns={[
  {key:'name',label:'วัตถุดิบ',value:row=>row.name,render:row=><strong>{row.name}</strong>},
  {key:'stock',label:'คงเหลือ',value:row=>row.stock,render:row=><><b>{row.stock}</b> {row.unit}</>},
  {key:'minimum',label:'ขั้นต่ำ',value:row=>row.minimum,render:row=><>{row.minimum} {row.unit}</>},
  {key:'status',label:'สถานะ',value:row=>row.stock<=row.minimum?0:1,render:row=><span className={'badge '+(row.stock<=row.minimum?'pending':'ready')}>{row.stock<=row.minimum?'ใกล้หมด':'เพียงพอ'}</span>},
  {key:'actions',label:'จัดการ',className:'data-table-actions',render:row=><button className="text-button" onClick={()=>onAdjust(row)}><Plus size={15}/> รับเข้า / ปรับยอด</button>},
 ]}/></section>;
}
