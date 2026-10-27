import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {Check,ChevronDown,Search,X} from 'lucide-react';
import './searchable-select.css';
export type SelectOption={value:string;label:string};
export default function SearchableSelect({options,value,onChange,disabled=false,label,placeholder='เลือก / ค้นหา',clearable=true,variant='inline'}:{options:SelectOption[];value:string;onChange:(value:string)=>void;disabled?:boolean;label:string;placeholder?:string;clearable?:boolean;variant?:'inline'|'field'}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[highlight,setHighlight]=useState(0);
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),listId=useId();
 const selected=options.find(option=>option.value===value);
 const filtered=options.filter(option=>option.label.toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')));
 const active=Math.min(highlight,filtered.length-1),expanded=open&&!disabled;
 function close(){setOpen(false);setQuery('');}
 function show(){if(disabled)return;setQuery('');setHighlight(0);setOpen(true);}
 function choose(option:SelectOption){onChange(option.value);close();}
 useEffect(()=>{if(!expanded)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[expanded]);
 useEffect(()=>{if(expanded&&active>=0)document.getElementById(`${listId}-${active}`)?.scrollIntoView({block:'nearest'});},[active,expanded,listId,query]);
 function keys(event:KeyboardEvent<HTMLInputElement>){
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!expanded){show();return;}setHighlight(index=>Math.max(0,Math.min(filtered.length-1,index+(event.key==='ArrowDown'?1:-1))));}
  else if(event.key==='Enter'){event.preventDefault();if(!expanded)show();else if(filtered[active])choose(filtered[active]);}
  else if(event.key==='Escape'){if(expanded){event.preventDefault();event.stopPropagation();close();}}
  else if(event.key==='Tab')close();
 }
 return <div className={`searchable-select searchable-select-${variant}${disabled?' is-disabled':''}`} ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))close();}}>
  <div className="searchable-select-control">
   {expanded&&<Search size={14} aria-hidden="true"/>}
   <input className="searchable-select-input" ref={input} role="combobox" aria-label={label} aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={expanded&&active>=0?`${listId}-${active}`:undefined} disabled={disabled} autoComplete="off" spellCheck={false} value={expanded?query:selected?.label||''} placeholder={expanded?'พิมพ์เพื่อค้นหา…':placeholder} onFocus={show} onClick={()=>{if(!expanded)show();}} onChange={event=>{setQuery(event.target.value);setHighlight(0);setOpen(true);}} onKeyDown={keys}/>
   {clearable&&value&&!disabled&&<button type="button" className="searchable-select-clear" aria-label={`ล้าง${label}`} onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange('');close();}}><X size={13}/></button>}
   <button type="button" className="searchable-select-arrow" aria-label={`เปิดรายการ${label}`} disabled={disabled} tabIndex={-1} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(expanded)close();else{input.current?.focus();show();}}}><ChevronDown size={15}/></button>
  </div>
  {expanded&&<div className="searchable-select-dropdown"><div id={listId} className="searchable-select-options" role="listbox" aria-label={label}>{filtered.map((option,index)=><div id={`${listId}-${index}`} role="option" aria-selected={option.value===value} className={`searchable-select-option${index===active?' is-highlighted':''}`} key={option.value} onMouseDown={event=>event.preventDefault()} onPointerMove={()=>setHighlight(index)} onClick={()=>choose(option)}><span>{option.label}</span>{option.value===value&&<Check size={14} aria-hidden="true"/>}</div>)}</div>{!filtered.length&&<div className="searchable-select-empty" role="status">ไม่พบรายการที่ค้นหา</div>}</div>}
 </div>;
}
