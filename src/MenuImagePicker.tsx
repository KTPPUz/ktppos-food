import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ImagePlus,X} from 'lucide-react';
import {mockupMode} from './runtime';
import './menu-image.css';

type Props={image:string;file:File|null;disabled:boolean;onChange:(file:File|null)=>void;label?:string;uploadLabel?:string;description?:string};
export default function MenuImagePicker({image,file,disabled,onChange,label='รูปอาหาร',uploadLabel='แนบรูปอาหาร',description='รูปจะเปลี่ยนเมื่อบันทึกเมนู และใช้กับทุกสาขาของร้าน'}:Props){
 const [preview,setPreview]=useState(''),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  if(!file){setPreview('');return;}
  const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);
 },[file]);
 function choose(selected:File|undefined){
  setError('');
  if(!selected)return;
  if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>5*1024*1024){
   setError('กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB');onChange(null);if(input.current)input.current.value='';return;
  }
  onChange(selected);
 }
 return <fieldset className="menu-image-editor" disabled={disabled||mockupMode}><legend>{label}</legend>
  <div className="menu-image-content">{preview||image?<img className="menu-image-preview" src={preview||image} alt={`ตัวอย่าง${label}`}/>:<div className="menu-image-preview" aria-label="ยังไม่มีรูป"><ImagePlus size={32}/></div>}<div className="menu-image-controls"><label className="menu-image-upload"><ImagePlus size={18}/><span>{file?'เลือกรูปใหม่':uploadLabel}</span><input ref={input} aria-label={uploadLabel} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>choose(event.target.files?.[0])}/></label><small>JPG, PNG หรือ WebP · ไม่เกิน 5 MB</small>{file&&<><span className="menu-image-filename">{file.name}</span><button type="button" className="text-button" onClick={()=>{onChange(null);setError('');if(input.current)input.current.value='';}}><X size={14}/> ยกเลิกรูปที่เลือก</button></>}</div></div>
  {error&&<div className="error" role="alert"><AlertCircle size={16}/>{error}</div>}
  <p>{mockupMode?'โหมดทดลองในเบราว์เซอร์ยังไม่รองรับการแนบรูป':description}</p>
 </fieldset>;
}
