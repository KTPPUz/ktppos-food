import {createApp} from './app.mjs';
import {serverOptions} from './http.mjs';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import os from 'node:os';

process.loadEnvFile && fs.existsSync('.env') && process.loadEnvFile('.env');
const production=process.argv.includes('--production');
const port=Number(process.env.PORT||5173);
const lan=Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${port}`);
const options=serverOptions({...process.env,...(production?{NODE_ENV:'production'}:{})},lan);
let app,repository;
const storage=process.env.STORAGE_DRIVER||(process.env.DATABASE_URL?'postgres':'json');
if(storage==='postgres'){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for PostgreSQL storage.');
  const [{PrismaClient},{createPostgresRepository},{createDatabaseApp}]=await Promise.all([
    import('@prisma/client'),import('./postgres-repository.mjs'),import('./database-app.mjs')]);
  repository=createPostgresRepository(new PrismaClient());
  await repository.check();
  ({app}=createDatabaseApp({repository,allowedOrigins:options.allowedOrigins,trustProxy:options.trustProxy}));
}else if(storage==='json'){
  const dir=process.env.DATA_DIR||path.resolve('.data');
  fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'demo.json');
  ({app}=createApp({
    data:fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined,
    save:data=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);},
    allowedOrigins:options.allowedOrigins,trustProxy:options.trustProxy,
  }));
}else throw new Error('STORAGE_DRIVER must be postgres or json.');
app.locals.customerBaseUrls=options.customerBaseUrls;
app.use('/api',(_,res)=>res.status(404).json({error:'ไม่พบ API'}));
let vite;
if(production) {
  const dist=path.resolve('dist');
  if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('Missing dist/index.html. Run npm run build before npm start.');
  app.use(express.static(dist));
  app.get('/{*path}',(_,res)=>res.set('Cache-Control','no-cache').sendFile(path.join(dist,'index.html')));
} else {
  const {createServer}=await import('vite');
  vite=await createServer({server:{middlewareMode:true,hmr:{port:port+10000}},appType:'spa'});
  app.use(vite.middlewares);
}
const server=app.listen(options.port,options.host,()=>{
  console.log(`KTP Table POS → http://localhost:${options.port}`);
  console.log(`Storage → ${storage}`);
  for(const url of options.customerBaseUrls)console.log(`Customer QR → ${url}`);
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  server.close(async()=>{await vite?.close();await repository?.close();process.exit(0);});
  setTimeout(()=>process.exit(1),10000).unref();
});
