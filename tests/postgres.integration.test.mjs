import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {seed} from '../server/seed.mjs';
import {createDatabaseApp} from '../server/database-app.mjs';
import {createPostgresRepository} from '../server/postgres-repository.mjs';

// Each run gets its own schema. Never truncate the configured database.
test('PostgreSQL import, transactions, concurrent QR, rollback, durable sessions and restart',
  {skip:!process.env.TEST_DATABASE_URL,timeout:120000},async()=>{
  const {PrismaClient}=await import('@prisma/client');
  const schema=`test_${crypto.randomBytes(8).toString('hex')}`;
  const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('schema',schema);
  const prisma=new PrismaClient({datasourceUrl:url.href});
  const repository=createPostgresRepository(prisma);
  const servers=[];
  async function start(repo=repository){
    const {app}=createDatabaseApp({repository:repo});
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});servers.push(server);
    const base=`http://127.0.0.1:${server.address().port}/api`;
    return async(route,method='GET',body,token)=>{
      const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return {status:r.status,body:await r.json()};
    };
  }
  try{
    execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url.href},stdio:'pipe'});
    const source=seed();
    await repository.initialize(source);
    await assert.rejects(repository.initialize(seed()),/already contains data/);
    const roundtrip=await repository.run(async data=>({status:200,body:data}));
    assert.deepEqual(roundtrip.body,{...source,menuCustom:{},tableSessions:[]});
    const call=await start();
    const login=await call('/auth/login','POST',{userId:'restaurant-u0',pin:'1234'});
    assert.equal(login.status,200);const token=login.body.token;
    assert.equal((await prisma.authSession.findFirst()).tokenHash,crypto.createHash('sha256').update(token).digest('hex'));
    const opened=await call('/tables/r1-t15/session','POST',{},token);assert.equal(opened.status,200);
    const session=opened.body;
    const path=`/guest/${session.token}/orders`;
    const request={requestId:'database-test-request-0001',items:[{menuId:'m1',qty:1}]};
    // Separate app instances and DB clients simulate separate processes.
    const secondPrisma=new PrismaClient({datasourceUrl:url.href});
    const secondRepo=createPostgresRepository(secondPrisma);
    try{
      const call2=await start(secondRepo);
      const concurrent=await Promise.all([call(path,'POST',request),call2(path,'POST',request)]);
      assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,201]);
      assert.equal(concurrent.filter(r=>r.body.duplicate).length,1);
      const orderId=concurrent[0].body.orderId;
      assert.equal(await prisma.guestSubmission.count(),1);
      assert.equal(await prisma.orderItem.count({where:{orderId}}),1);
      const extras=await Promise.all(Array.from({length:4},(_,i)=>(i%2?call:call2)(path,'POST',{...request,requestId:`database-unique-request-${i}`})));
      assert.ok(extras.every(r=>r.status===201));
      assert.equal(await prisma.orderItem.count({where:{orderId}}),5);
      assert.equal(await prisma.kitchenBatch.count({where:{orderId}}),5);
      assert.equal((await call(path,'POST',{...request,items:[{menuId:'m2',qty:1}]})).status,409);
      // Simulate process restart: durable employee token and QR retry still work.
      await repository.close();
      assert.equal((await call2('/state','GET',undefined,token)).status,200);
      const retry=await call2(path,'POST',request);assert.equal(retry.body.duplicate,true);
      // A real SQL failure after writing must roll back both writes and response.
      const before=await secondPrisma.counter.findUnique({where:{id:'nextOrder'}});
      await assert.rejects(secondPrisma.$transaction(async tx=>{
        await tx.counter.update({where:{id:'nextOrder'},data:{value:999999}});
        await tx.guestSubmission.create({data:{sessionId:session.id,key:request.requestId,position:999,payload:{}}});
      }));
      assert.deepEqual(await secondPrisma.counter.findUnique({where:{id:'nextOrder'}}),before);
      const failingRepository={run:async work=>{await work(structuredClone(roundtrip.body),new Map());throw new Error('simulated commit failure');}};
      const failCall=await start(failingRepository);
      const failed=await failCall('/auth/login','POST',{userId:'restaurant-u0',pin:'1234'});assert.equal(failed.status,503);assert.equal(failed.body.token,undefined);
      const paid=await call2(`/orders/${orderId}/payments`,'POST',{method:'qr'},token);assert.equal(paid.status,200);
      assert.equal((await call2(path,'POST',{...request,requestId:'database-after-payment-001'})).status,410);
      const employee=await call2('/users','POST',{name:'Database staff',email:'db-staff@example.com',role:'Waiter',branchId:'r1',pin:'5678'},token);
      assert.equal(employee.status,201);assert.equal(employee.body.pin,undefined);
      const staffLogin=await call2('/auth/login','POST',{userId:employee.body.id,pin:'5678'});
      assert.equal(staffLogin.status,200);
      const edited=await call2(`/users/${employee.body.id}`,'PATCH',{name:'Updated staff',role:'Cashier',pin:'9012'},token);
      assert.equal(edited.status,200);
      assert.equal((await secondPrisma.employee.findUnique({where:{id:employee.body.id}})).payload.name,'Updated staff');
      assert.equal((await call2('/state','GET',undefined,staffLogin.body.token)).status,401);
      assert.equal(await secondPrisma.authSession.count({where:{userId:employee.body.id}}),0);
      const staffRelogin=await call2('/auth/login','POST',{userId:employee.body.id,pin:'9012'});
      const staffOrder=await call2('/orders','POST',{branchId:'r1',type:'takeaway',items:[{menuId:'m1',qty:1}]},staffRelogin.body.token);
      assert.equal(staffOrder.status,201);
      assert.equal((await call2(`/users/${employee.body.id}`,'DELETE',undefined,token)).status,200);
      assert.equal(await secondPrisma.employee.findUnique({where:{id:employee.body.id}}),null);
      assert.equal(await secondPrisma.authSession.count({where:{userId:employee.body.id}}),0);
      assert.equal((await call2('/state','GET',undefined,staffRelogin.body.token)).status,401);
      assert.ok(await secondPrisma.order.findUnique({where:{id:staffOrder.body.id}}));
      await call2('/auth/logout','POST',{},token);
      assert.equal((await call2('/state','GET',undefined,token)).status,401);
    }finally{await secondRepo.close();}
  }finally{
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
    // schema is generated above, never taken from external input.
    const cleanup=new PrismaClient({datasourceUrl:url.href});
    await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.$disconnect();await repository.close();
  }
});
