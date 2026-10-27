export type TableSort={key:string;direction:'asc'|'desc'};
export type SortValue=string|number|boolean|null|undefined;
const collator=new Intl.Collator('th',{numeric:true,sensitivity:'base'});
export function prepareRows<T>(rows:readonly T[],query:string,searchText:(row:T)=>string,sort:TableSort|null,value:(row:T,key:string)=>SortValue):T[]{
 const terms=query.normalize('NFC').trim().toLocaleLowerCase('th').split(/\s+/).filter(Boolean);
 const filtered=rows.filter(row=>{const text=searchText(row).normalize('NFC').toLocaleLowerCase('th');return terms.every(term=>text.includes(term));});
 if(!sort)return filtered;
 return filtered.map((row,index)=>({row,index})).sort((a,b)=>{
  const left=value(a.row,sort.key),right=value(b.row,sort.key);
  const comparison=typeof left==='number'&&typeof right==='number'?left-right:typeof left==='boolean'&&typeof right==='boolean'?Number(left)-Number(right):collator.compare(String(left??''),String(right??''));
  return (sort.direction==='asc'?comparison:-comparison)||a.index-b.index;
 }).map(({row})=>row);
}
export function tablePage<T>(rows:readonly T[],page:number,size:number){
 const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.max(1,Math.min(page,pages)),offset=(current-1)*size;
 return {rows:rows.slice(offset,offset+size),page:current,pages,start:rows.length?offset+1:0,end:Math.min(offset+size,rows.length),count:rows.length};
}
