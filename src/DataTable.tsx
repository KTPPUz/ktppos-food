import {useEffect,useId,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown,ChevronLeft,ChevronRight,ChevronsLeft,ChevronsRight,Search,X} from 'lucide-react';
import {prepareRows,tablePage,type SortValue,type TableSort} from './data-table';
import './data-table.css';
export type DataColumn<T>={key:string;label:string;value?:(row:T)=>SortValue;render:(row:T)=>ReactNode;className?:string};
type Props<T>={rows:readonly T[];columns:DataColumn<T>[];rowKey:(row:T)=>string;label:string;searchText:(row:T)=>string;searchLabel?:string;searchPlaceholder?:string;searchValue?:string;onSearchChange?:(value:string)=>void;resetKey?:string;initialSort?:TableSort;totalCount?:number;emptyText?:string};
export default function DataTable<T>({rows,columns,rowKey,label,searchText,searchLabel='ค้นหาในตาราง',searchPlaceholder='ค้นหา…',searchValue,onSearchChange,resetKey='',initialSort,totalCount,emptyText='ไม่พบข้อมูลที่ค้นหา'}:Props<T>){
 const [internalQuery,setInternalQuery]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(10),[sort,setSort]=useState<TableSort|null>(initialSort||null);const id=useId();
 const query=searchValue??internalQuery;
 const filtered=prepareRows(rows,query,searchText,sort,(row,key)=>columns.find(column=>column.key===key)?.value?.(row));
 const view=tablePage(filtered,page,size),total=Math.max(totalCount??rows.length,rows.length);
 useEffect(()=>setPage(1),[query,size,resetKey]);
 useEffect(()=>{setPage(current=>Math.min(current,view.pages));},[view.pages]);
 function search(value:string){setPage(1);if(onSearchChange)onSearchChange(value);else setInternalQuery(value);}
 function order(key:string){setSort(current=>({key,direction:current?.key===key&&current.direction==='asc'?'desc':'asc'}));setPage(1);}
 const pages=Array.from(new Set([1,...Array.from({length:5},(_,index)=>view.page-2+index).filter(number=>number>1&&number<view.pages),view.pages])).sort((a,b)=>a-b);
 return <div className="data-table" role="region" aria-label={label}>
  <div className="data-table-toolbar"><label className="data-table-size" htmlFor={`${id}-size`}>แสดง <select id={`${id}-size`} aria-label="จำนวนรายการต่อหน้า" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(number=><option key={number} value={number}>{number}</option>)}</select> รายการ</label>
   <div className="search-box data-table-search"><Search size={16}/><input aria-label={searchLabel} placeholder={searchPlaceholder} value={query} onChange={e=>search(e.target.value)}/>{query&&<button type="button" aria-label="ล้างคำค้นในตาราง" onClick={()=>search('')}><X size={15}/></button>}</div>
  </div>
  <div className="table-scroll"><table aria-label={label}><thead><tr>{columns.map(column=><th key={column.key} className={column.className} scope="col" aria-sort={column.value?(sort?.key===column.key?(sort.direction==='asc'?'ascending':'descending'):'none'):undefined}>{column.value?<button className="data-table-sort" aria-label={`เรียงตาม ${column.label}`} onClick={()=>order(column.key)}><span>{column.label}</span>{sort?.key===column.key?(sort.direction==='asc'?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>}</button>:column.label}</th>)}</tr></thead><tbody>{view.rows.length?view.rows.map(row=><tr key={rowKey(row)}>{columns.map(column=><td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>):<tr><td colSpan={columns.length} className="data-table-empty">{emptyText}</td></tr>}</tbody></table></div>
  <div className="data-table-footer"><span className="data-table-summary" role="status">แสดง {view.start.toLocaleString('th-TH')}–{view.end.toLocaleString('th-TH')} จาก {view.count.toLocaleString('th-TH')} รายการ{view.count<total&&<> (กรองจาก {total.toLocaleString('th-TH')} รายการ)</>}</span>
   <nav className="data-table-pagination" aria-label={`แบ่งหน้า ${label}`}><button type="button" disabled={view.page===1} aria-label="หน้าแรก" onClick={()=>setPage(1)}><ChevronsLeft size={15}/></button><button type="button" disabled={view.page===1} aria-label="หน้าก่อนหน้า" onClick={()=>setPage(view.page-1)}><ChevronLeft size={15}/></button>{pages.map((number,index)=><span key={number}>{index>0&&number>pages[index-1]+1&&<span className="data-table-ellipsis">…</span>}<button type="button" aria-label={`หน้า ${number}`} aria-current={number===view.page?'page':undefined} onClick={()=>setPage(number)}>{number}</button></span>)}<button type="button" disabled={view.page===view.pages} aria-label="หน้าถัดไป" onClick={()=>setPage(view.page+1)}><ChevronRight size={15}/></button><button type="button" disabled={view.page===view.pages} aria-label="หน้าสุดท้าย" onClick={()=>setPage(view.pages)}><ChevronsRight size={15}/></button></nav>
  </div>
 </div>;
}
