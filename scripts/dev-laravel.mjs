import {spawn} from 'node:child_process';
import {createServer} from 'vite';
import path from 'node:path';
const apiPort=process.env.PHP_API_PORT||'8050';
const php=spawn(process.env.PHP_BINARY||'php',['artisan','serve','--host=127.0.0.1',`--port=${apiPort}`,'--no-reload'],{cwd:path.resolve('backend'),stdio:'inherit',env:process.env});
let vite,stopping=false;
async function stop(code=0){if(stopping)return;stopping=true;php.kill('SIGTERM');await vite?.close();process.exit(code);}
php.on('error',error=>{console.error(error.message);stop(1);});
php.on('exit',code=>{if(!stopping)stop(code||1);});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop());
vite=await createServer({server:{host:process.env.HOST||'0.0.0.0',port:Number(process.env.PORT||5173),strictPort:true}});
try{await vite.listen();vite.printUrls();console.log('Backend → Laravel / MariaDB (backend/.env)');}catch(error){console.error(error.message);await stop(1);}
