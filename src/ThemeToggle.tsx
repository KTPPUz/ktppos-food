import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import './theme-toggle.css';

export type Theme='light'|'dark';
const storageKey='ktp-theme';
const systemTheme=():Theme=>window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
function savedTheme():Theme|null{try{const value=localStorage.getItem(storageKey);return value==='light'||value==='dark'?value:null;}catch{return null;}}
function applyTheme(theme:Theme){
 document.documentElement.dataset.theme=theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#1b1d1a':'#ee674c');
}

export default function ThemeToggle({className=''}:{className?:string}){
 const [theme,setTheme]=useState<Theme>(()=>savedTheme()||systemTheme());
 useEffect(()=>{applyTheme(theme);},[theme]);
 useEffect(()=>{
  // Follow the OS setting until the user picks a theme explicitly.
  const query=window.matchMedia?.('(prefers-color-scheme: dark)');
  const update=()=>{if(!savedTheme())setTheme(systemTheme());};
  query?.addEventListener('change',update);
  return()=>query?.removeEventListener('change',update);
 },[]);
 function toggle(){
  const next=theme==='dark'?'light':'dark';
  try{localStorage.setItem(storageKey,next);}catch{/* Theme still switches for this visit if storage is unavailable. */}
  setTheme(next);
 }
 const label=theme==='dark'?'เปลี่ยนเป็นโหมดสว่าง':'เปลี่ยนเป็นโหมดมืด';
 return <button type="button" className={'icon-btn theme-toggle '+className} aria-label={label} title={label} onClick={toggle}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>;
}
