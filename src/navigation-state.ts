import type {State} from './types';
export type NavigationState={page:string;branch:string;settingsTab:'general'|'tables'|'categories';staffTab:'team'|'roles'};
export type NavigationItem={id:string;perm:string;medium?:boolean;enterprise?:boolean;hiddenWith?:string};
export function allowedPages(state:State,items:readonly NavigationItem[]):string[]{
 return items.filter(item=>state.permissions.includes(item.perm)&&!(item.hiddenWith&&state.permissions.includes(item.hiddenWith))&&(!state.visibleMenus||state.visibleMenus.includes(item.id))&&(!item.medium||state.tenant.plan!=='Small')&&(!item.enterprise||state.tenant.plan==='Enterprise')).map(item=>item.id);
}
export function navigationKey(tenantId:string,userId:string):string{return `ktp-navigation-v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;}
export function readNavigation(storage:Pick<Storage,'getItem'>,key:string):Partial<NavigationState>{
 try{const value:unknown=JSON.parse(storage.getItem(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value as Partial<NavigationState>:{};}catch{return {};}
}
export function resolveNavigation(saved:Partial<NavigationState>,state:State,items:readonly NavigationItem[]):NavigationState{
 const available=allowedPages(state,items);
 const page=typeof saved.page==='string'&&available.includes(saved.page)?saved.page:available.includes('pos')?'pos':available[0]||'none';
 const branch=typeof saved.branch==='string'&&state.branches.some(item=>item.id===saved.branch)?saved.branch:state.branches.some(item=>item.id===state.user.branchId)?state.user.branchId:state.branches[0]?.id||'';
 return {page,branch,settingsTab:saved.settingsTab==='categories'?'categories':saved.settingsTab==='tables'&&state.tenant.plan!=='Small'?'tables':'general',staffTab:saved.staffTab==='roles'&&state.user.role==='Owner'&&!!state.roles?'roles':'team'};
}
export function writeNavigation(storage:Pick<Storage,'setItem'>,key:string,value:NavigationState):void{try{storage.setItem(key,JSON.stringify(value));}catch{/* Navigation still works if browser storage is unavailable. */}}
