import {createEngine} from '../../server/engine.mjs';
import {seed} from '../../server/seed.mjs';

const dataKey='ktp-table-mockup-v1:'+import.meta.env.BASE_URL;
const sessionsKey='ktp-table-mockup-sessions-v1:'+import.meta.env.BASE_URL;

// Run the same POS rules locally. No HTTP server or external API is involved.
function router(){
 const layers=[];
 const app={locals:{customerBaseUrls:[new URL(import.meta.env.BASE_URL,location.origin).href.replace(/\/$/,'')]}};
 for(const method of ['get','post','patch','delete','use'])app[method]=(...args)=>{
  const path=typeof args[0]==='string'?args.shift():'/';
  for(const handler of args)layers.push({method,path,handler});
 };
 app.dispatch=(path,options)=>{
  const url=new URL('/api'+path,location.origin),headers=new Headers(options.headers);
  const req={method:options.method||'GET',path:url.pathname,params:{},query:Object.fromEntries(url.searchParams),body:options.body?JSON.parse(options.body):{},headers:Object.fromEntries(headers),protocol:location.protocol.slice(0,-1),get:name=>name.toLowerCase()==='host'?location.host:headers.get(name)};
  let status=200,result,done=false;
  const res={set:()=>res,status:code=>{status=code;return res;},json:value=>{result=value;done=true;return res;}};
  const run=(start,error)=>{
   for(let i=start;i<layers.length;i++){
    const layer=layers[i],isError=layer.handler.length===4;
    if(Boolean(error)!==isError)continue;
    if(layer.method!=='use'&&layer.method.toUpperCase()!==req.method)continue;
    const keys=[];
    const pattern=layer.path.split('/').map(part=>part.startsWith(':')?(keys.push(part.slice(1)),'([^/]+)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');
    const match=url.pathname.match(new RegExp('^'+pattern+(layer.method==='use'?(layer.path==='/'?'':'(?:/|$)'):'/?$')));
    if(!match)continue;
    req.params=Object.fromEntries(keys.map((key,index)=>[key,decodeURIComponent(match[index+1])]));
    const next=err=>run(i+1,err);
    try{if(error)layer.handler(error,req,res,next);else layer.handler(req,res,next);}catch(err){run(i+1,err);}
    return;
   }
   if(!done){status=error?.status||404;result={error:error?.message||'ไม่พบรายการจำลอง'};done=true;}
  };
  run(0);
  return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});
 };
 return app;
}

export async function demoFetch(path,options={}){
 let data,savedSessions;
 try{data=JSON.parse(localStorage.getItem(dataKey)||'null');savedSessions=JSON.parse(sessionStorage.getItem(sessionsKey)||'[]');}catch{return Response.json({error:'อ่านข้อมูลจำลองไม่ได้ กรุณากดรีเซ็ตข้อมูล'},{status:500});}
 data??=seed();
 try{
  // Read on every operation so tabs in this browser share the latest demo state.
  localStorage.setItem(dataKey,JSON.stringify(data));
  const app=router();
  const engine=createEngine({app,data,save:value=>localStorage.setItem(dataKey,JSON.stringify(value)),randomId:()=>crypto.randomUUID(),randomToken:()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join(''),
   // Exact payload comparison gives demo retries the same idempotency semantics.
   fingerprint:value=>value});
  for(const [token,id] of savedSessions)engine.sessions.set(token,id);
  const response=app.dispatch(path,options);
  sessionStorage.setItem(sessionsKey,JSON.stringify([...engine.sessions]));
  return response;
 }catch{return Response.json({error:'บันทึกข้อมูลจำลองไม่ได้ โปรดอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์หรือลองรีเซ็ตข้อมูล'},{status:500});}
}

export function resetDemo(){
 localStorage.removeItem(dataKey);
 sessionStorage.removeItem(sessionsKey);
 sessionStorage.removeItem('bt-token');
 location.assign(new URL(import.meta.env.BASE_URL,location.origin).href);
}
