import fs from 'node:fs';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {seed} from '../server/seed.mjs';
import {createPostgresRepository} from '../server/postgres-repository.mjs';

if(fs.existsSync('.env'))process.loadEnvFile('.env');
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before running database commands.');
const mode=process.argv[2];
if(!['seed','import'].includes(mode))throw new Error('Usage: node scripts/database.mjs seed|import [path/to/demo.json]');
const data=mode==='seed'?seed():JSON.parse(fs.readFileSync(process.argv[3]||path.join(process.env.DATA_DIR||'.data','demo.json'),'utf8'));
for(const field of ['tenants','branches','users','menu','tables','ingredients','recipes','shifts','settings','orders','movements','transfers','audit']){
  if(!Array.isArray(data[field]))throw new Error(`Invalid source data: ${field} must be an array.`);
}
if(!Number.isSafeInteger(data.nextOrder)||data.nextOrder<=Math.max(0,...data.orders.map(order=>order.number)))throw new Error('Invalid source data: nextOrder must exceed all existing order numbers.');
const repository=createPostgresRepository(new PrismaClient());
try{
  await repository.initialize(data);
  console.log(`Database ${mode} complete: ${data.tenants.length} tenants, ${data.orders.length} orders. Source file unchanged.`);
}finally{await repository.close();}
