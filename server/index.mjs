import {createApp} from './app.mjs';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import os from 'node:os';
const dir=process.env.DATA_DIR||path.resolve('.data');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'demo.json');
const {app}=createApp({data:fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined,save:data=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);}});
app.use('/api',(_,res)=>res.status(404).json({error:'ไม่พบ API'}));
if(process.argv.includes('--production')){app.use(express.static('dist'));app.get('/{*path}',(_,res)=>res.sendFile(path.resolve('dist/index.html')));}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true,hmr:{port:Number(process.env.PORT||5173)+10000}},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT||5173),host=process.env.HOST||'0.0.0.0';
const lan=Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${port}`);
app.locals.customerBaseUrls=[...new Set([...(process.env.CUSTOMER_BASE_URL?[process.env.CUSTOMER_BASE_URL.replace(/\/$/,'')]:[]),...(host==='127.0.0.1'?[]:lan),`http://localhost:${port}`])];
app.listen(port,host,()=>{console.log(`KTP Table POS → http://localhost:${port}`);if(host==='0.0.0.0')for(const url of lan)console.log(`Customer QR (same Wi-Fi) → ${url}`);});
