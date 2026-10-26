import crypto from 'node:crypto';

// The domain still consumes arrays. Rows are stored separately so existing API
// behavior can be migrated without keeping a second, stale process-local state.
const specs = [
  ['tenants','tenant','id',[]],
  ['branches','branch','id',['tenantId']],
  ['users','employee','id',['tenantId']],
  ['menu','menuItem','id',[]],
  ['tables','diningTable','id',['branchId']],
  ['ingredients','ingredient','id',['branchId','stock']],
  ['recipes','recipe','menuId',[]],
  ['shifts','shift','id',['branchId']],
  ['settings','tenantSettings','tenantId',[]],
  ['orders','order','id',['number','tenantId','branchId','tableId','status']],
  ['tableSessions','tableSession','id',['branchId','tableId','token','status','expiresAt']],
  ['movements','stockMovement','id',['tenantId','branchId']],
  ['transfers','stockTransfer','id',['tenantId','branchId']],
  ['audit','auditEntry','id',['tenantId','branchId']],
];
const models=[...specs.map(s=>s[1]),'menuOverride','orderItem','kitchenBatch','guestSubmission'];
const keyOf=(model,row)=>model==='menuOverride'?`${row.tenantId}/${row.menuId}`:
  ['orderItem','kitchenBatch'].includes(model)?`${row.orderId}/${row.id}`:
  model==='guestSubmission'?`${row.sessionId}/${row.key}`:row.id??row.menuId??row.tenantId;
function where(model,row){
  if(model==='menuOverride')return {tenantId_menuId:{tenantId:row.tenantId,menuId:row.menuId}};
  if(['orderItem','kitchenBatch'].includes(model))return {orderId_id:{orderId:row.orderId,id:row.id}};
  if(model==='guestSubmission')return {sessionId_key:{sessionId:row.sessionId,key:row.key}};
  return row.id!==undefined?{id:row.id}:row.menuId!==undefined?{menuId:row.menuId}:{tenantId:row.tenantId};
}
const json=value=>JSON.parse(JSON.stringify(value));
export function encodeState(data){
  const rows=Object.fromEntries(models.map(m=>[m,[]]));
  for(const [collection,model,key,fields] of specs){
    for(const [position,record] of (data[collection]||[]).entries()){
      const payload=json(record);
      const row={[key]:record[key],position,payload};
      for(const field of fields)row[field]=field==='expiresAt'?new Date(record[field]):record[field]??null;
      if(model==='order'){
        row.hasBatches=Array.isArray(record.kitchenBatches);
        delete payload.items;delete payload.kitchenBatches;
        rows.orderItem.push(...record.items.map((item,position)=>({orderId:record.id,id:item.id,position,qty:item.qty,unitPrice:item.unitPrice,payload:json(item)})));
        rows.kitchenBatch.push(...(record.kitchenBatches||[]).map((batch,position)=>({orderId:record.id,id:batch.id,position,status:batch.status,payload:json(batch)})));
      }
      if(model==='tableSession'){
        delete payload.submissions;
        rows.guestSubmission.push(...(record.submissions||[]).map((submission,position)=>({sessionId:record.id,key:submission.key,position,payload:json(submission)})));
      }
      rows[model].push(row);
    }
  }
  for(const [tenantId,overrides] of Object.entries(data.menuCustom||{}))for(const [menuId,payload] of Object.entries(overrides))rows.menuOverride.push({tenantId,menuId,payload:json(payload)});
  return rows;
}
export function decodeState(rows,nextOrder){
  const data={nextOrder,menuCustom:{}};
  for(const [collection,model] of specs)data[collection]=rows[model].sort((a,b)=>a.position-b.position).map(row=>json(row.payload));
  const grouped=(model,field)=>{
    const groups=new Map();
    for(const row of rows[model].sort((a,b)=>a.position-b.position)){
      if(!groups.has(row[field]))groups.set(row[field],[]);
      groups.get(row[field]).push(json(row.payload));
    }
    return groups;
  };
  const items=grouped('orderItem','orderId'),batches=grouped('kitchenBatch','orderId'),submissions=grouped('guestSubmission','sessionId');
  const batchOrders=new Set(rows.order.filter(row=>row.hasBatches).map(row=>row.id));
  for(const order of data.orders){order.items=items.get(order.id)||[];if(batchOrders.has(order.id))order.kitchenBatches=batches.get(order.id)||[];}
  for(const session of data.tableSessions)session.submissions=submissions.get(session.id)||[];
  for(const row of rows.menuOverride){data.menuCustom[row.tenantId]??={};data.menuCustom[row.tenantId][row.menuId]=json(row.payload);}
  return data;
}
const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
export class DatabaseSessions {
  constructor(rows=[]){this.rows=new Map(rows.map(row=>[row.tokenHash,row]));this.dirty=false;}
  get(token){return typeof token==='string'?this.rows.get(digest(token))?.userId:undefined;}
  set(token,userId){this.rows.set(digest(token),{tokenHash:digest(token),userId,expiresAt:new Date(Date.now()+12*60*60*1000)});this.dirty=true;}
  delete(token){if(typeof token==='string'){this.rows.delete(digest(token));this.dirty=true;}}
  revokeUser(userId){for(const [hash,row] of this.rows)if(row.userId===userId){this.rows.delete(hash);this.dirty=true;}}
}
export function createPostgresRepository(prisma){
  async function lock(tx){
    // One transaction lock shared by every app process and import command.
    // Read committed ensures the snapshot is loaded AFTER the preceding commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728451903)`;
  }
  async function load(tx){
    const rows={};
    for(const model of models)rows[model]=await tx[model].findMany();
    const counter=await tx.counter.findUnique({where:{id:'nextOrder'}});
    if(!counter)throw new Error('Database is empty. Run npm run db:seed or npm run db:import first.');
    return decodeState(rows,counter.value);
  }
  async function save(tx,before,after){
    const previous=before?encodeState(before):Object.fromEntries(models.map(model=>[model,[]]));
    const next=encodeState(after);
    // Children are removed first; parents are inserted first.
    for(const model of [...models].reverse()){
      const keys=new Set(next[model].map(row=>keyOf(model,row)));
      for(const row of previous[model])if(!keys.has(keyOf(model,row)))await tx[model].delete({where:where(model,row)});
    }
    for(const model of models){
      const old=new Map(previous[model].map(row=>[keyOf(model,row),row]));
      const added=next[model].filter(row=>!old.has(keyOf(model,row)));
      // Bound bind parameters for large JSON imports.
      for(let start=0;start<added.length;start+=500)await tx[model].createMany({data:added.slice(start,start+500)});
      for(const row of next[model]){
        const prior=old.get(keyOf(model,row));
        if(prior&&JSON.stringify(prior)!==JSON.stringify(row))await tx[model].update({where:where(model,row),data:row});
      }
    }
    await tx.counter.upsert({where:{id:'nextOrder'},create:{id:'nextOrder',value:after.nextOrder},update:{value:after.nextOrder}});
  }
  async function transaction(work){
    return prisma.$transaction(async tx=>{await lock(tx);return work(tx);},{maxWait:15000,timeout:60000,isolationLevel:'ReadCommitted'});
  }
  return {
    async check(){await load(prisma);},
    async initialize(data){return transaction(async tx=>{
      // Never overwrite a populated database, even on repeated/concurrent imports.
      if(await tx.counter.count()||await tx.tenant.count())throw new Error('Database already contains data; import/seed refused.');
      await save(tx,null,data);
    });},
    async run(work){return transaction(async tx=>{
      const before=await load(tx),data=structuredClone(before);
      const sessions=new DatabaseSessions(await tx.authSession.findMany({where:{expiresAt:{gt:new Date()}}}));
      const result=await work(data,sessions);
      if(result.status<400){
        if(result.dirty)await save(tx,before,data);
        if(sessions.dirty){
          await tx.authSession.deleteMany({where:{tokenHash:{notIn:[...sessions.rows.keys()]}}});
          for(const row of sessions.rows.values())await tx.authSession.upsert({where:{tokenHash:row.tokenHash},create:row,update:row});
        }
      }
      return result;
    });},
    close:()=>prisma.$disconnect(),
  };
}
