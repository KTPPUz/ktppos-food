import fs from 'node:fs';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {createPostgresRepository} from '../server/postgres-repository.mjs';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/export-postgres.mjs .data/migration.json');
const target=path.resolve(file);
if(target.includes(path.sep+'public'+path.sep)||target.includes(path.sep+'dist'+path.sep))throw new Error('Export must be outside public web directories.');
const repo=createPostgresRepository(new PrismaClient());
try{
 const result=await repo.run(async data=>({status:200,body:data}));
 fs.writeFileSync(target,JSON.stringify(result.body),{flag:'wx',mode:0o600});
 console.log(`Exported ${result.body.orders.length} orders. Employee sessions must log in again after migration.`);
}finally{await repo.close();}
