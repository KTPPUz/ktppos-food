import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const result=spawnSync('npm',['run','build'],{stdio:'inherit',env:{...process.env,VITE_API_BASE_URL:'',VITE_BASE_PATH:'/',VITE_DEPLOY_TARGET:''}});
if(result.status!==0)process.exit(result.status||1);
fs.rmSync('backend/public/assets',{recursive:true,force:true});
fs.cpSync('dist/assets','backend/public/assets',{recursive:true});
fs.copyFileSync('dist/index.html','backend/public/index.html');
console.log('Hostinger frontend ready in backend/public (PHP serves /api).');
