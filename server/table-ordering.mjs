import crypto from 'node:crypto';
import {menuPrice} from '../shared/pricing.mjs';
import {assert,totals,scope,requireOpen} from './domain.mjs';
const terminal = new Set(['paid','refunded','cancelled','merged','split']);
const tokenPattern = /^[a-f0-9]{48}$/;

// A QR is a capability for one service round, never a staff login.
export function createTableOrdering({data,catalog,parseItems,allowed,feature,audit,persist,now,uid,getOrder}) {
  data.tableSessions ??= [];
  const isActive = s => s.status === 'active' && Date.parse(s.expiresAt) > Date.now();
  const orderSessions = order => data.tableSessions.filter(s => s.orderIds.includes(order.id));
  function closeSession(s,reason) {
    s.closedOrders=Date.parse(s.expiresAt)>Date.now()?JSON.parse(JSON.stringify(serializeOrders(s))):[];
    s.status='closed';s.acceptingOrders=false;s.closedAt=now();s.closeReason=reason;
  }
  function sessionForTable(tableId) {
    return data.tableSessions.find(s=>s.tableId===tableId&&isActive(s));
  }
  function sessionSummary(s) {
    return {id:s.id,tableId:s.tableId,branchId:s.branchId,orderIds:s.orderIds,active:isActive(s),acceptingOrders:isActive(s)&&s.acceptingOrders,expiresAt:s.expiresAt};
  }
  function syncBatches(o) {
    if(terminal.has(o.status)||!o.kitchenBatches?.length)return;
    const live=o.kitchenBatches.filter(b=>b.status!=='cancelled');
    if(!live.length)return;
    o.status=['pending','cooking','ready','served'].find(status=>live.some(b=>b.status===status))||'pending';
  }
  function ensureBatches(o) {
    o.kitchenBatches ??= [];
    if(!o.kitchenBatches.length&&o.items.length) {
      const b={id:uid(),round:1,source:o.source||'staff',status:o.status==='draft'?'pending':o.status,createdAt:o.createdAt,itemIds:o.items.map(i=>i.id)};
      o.kitchenBatches.push(b);
      for(const i of o.items){i.batchId=b.id;i.status=b.status;}
    }
  }
  function addBatch(o,items,source) {
    ensureBatches(o);
    const b={id:uid(),round:o.kitchenBatches.length+1,source,status:'pending',createdAt:now(),itemIds:items.map(i=>i.id)};
    for(const i of items){i.batchId=b.id;i.status='pending';}
    o.items.push(...items);o.kitchenBatches.push(b);syncBatches(o);return b;
  }
  function attachStaffOrder(o) {
    const s=sessionForTable(o.tableId);
    if(s){assert(s.acceptingOrders,'โต๊ะนี้กำลังแยกหรือชำระบิล กรุณาปิดรอบเดิมก่อน',409);s.orderIds.push(o.id);o.serviceSessionId=s.id;}
  }
  function onOrderClosed(o) {
    for(const s of orderSessions(o)) {
      if(s.status!=='active')continue;
      s.acceptingOrders=false;
      if(s.orderIds.every(id=>terminal.has(data.orders.find(x=>x.id===id)?.status)))closeSession(s,'รอบบริการนี้สิ้นสุดแล้ว กรุณาขอ QR ใหม่จากพนักงาน');
    }
  }
  function onSplit(o,child) {
    for(const s of orderSessions(o)){if(s.status==='active'){s.orderIds.push(child.id);s.acceptingOrders=false;child.serviceSessionId=s.id;}}
  }
  function revokeForOrder(o,reason) {
    for(const s of orderSessions(o))if(s.status==='active')closeSession(s,reason);
  }
  function cancelItem(o,item) {
    if(!o.kitchenBatches)return;
    const batch=o.kitchenBatches.find(b=>b.id===item.batchId);
    if(batch&&!o.items.some(i=>i.batchId===batch.id))batch.status='cancelled';
    syncBatches(o);
  }
  function getGuest(token) {
    assert(tokenPattern.test(token||''),'ไม่พบ QR สำหรับโต๊ะนี้',404);
    const s=data.tableSessions.find(s=>s.token===token);
    assert(s,'ไม่พบ QR สำหรับโต๊ะนี้',404);
    const tenant=data.tenants.find(t=>t.id===s.tenantId);
    assert(tenant?.plan!=='Small','ร้านนี้ยังไม่เปิดรับออเดอร์ผ่าน QR',403);
    return s;
  }
  function serializeOrders(s) {return s.orderIds.map(id=>data.orders.find(o=>o.id===id)).filter(Boolean).map(o=>({id:o.id,number:o.number,status:o.status,items:o.items.map(i=>({id:i.id,menuId:i.menuId,name:i.name,qty:i.qty,unitPrice:i.unitPrice,originalUnitPrice:i.originalUnitPrice,menuDiscount:i.menuDiscount,modifiers:i.modifiers,note:i.note,status:o.kitchenBatches?.length?(i.status||o.status):o.status})),totals:o.totals||totals(o),createdAt:o.createdAt,roundingAdjustment:o.roundingAdjustment||0,kitchenBatches:(o.kitchenBatches||[]).map(b=>({id:b.id,round:b.round,source:b.source,status:b.status,createdAt:b.createdAt,itemIds:b.itemIds}))}));}
  function guestState(s) {
    const tenant=data.tenants.find(t=>t.id===s.tenantId),branch=data.branches.find(b=>b.id===s.branchId),table=data.tables.find(t=>t.id===s.tableId);
    const active=isActive(s),shift=data.shifts.find(x=>x.branchId===s.branchId);
    const settings=data.settings.find(x=>x.tenantId===s.tenantId);
    return {
      session:{...sessionSummary(s),acceptingOrders:active&&s.acceptingOrders&&!!shift?.open,reason:!active?(s.closeReason||'QR หมดอายุ กรุณาขอ QR ใหม่จากพนักงาน'):!s.acceptingOrders?'โต๊ะนี้กำลังแยกหรือชำระบิล กรุณาติดต่อพนักงาน':!shift?.open?'ร้านพักรับออเดอร์ชั่วคราว':''},
      restaurant:{name:tenant.name,branch:branch.name,table:table.name,seats:table.seats},
      categories:[],acceptedRequests:s.submissions?.map(x=>x.key)||[],settings:{taxRate:(s.orderIds.map(id=>data.orders.find(o=>o.id===id)).find(o=>o&&!terminal.has(o.status))||settings).taxRate,serviceRate:(s.orderIds.map(id=>data.orders.find(o=>o.id===id)).find(o=>o&&!terminal.has(o.status))||settings).serviceRate},
      menu:active?catalog({tenantId:s.tenantId}).map(m=>({id:m.id,name:m.name,en:m.en,category:m.category,image:m.image,popular:m.popular,available:m.available,...menuPrice(m,s.branchId),discount:m.discount,modifiers:m.modifiers})):[],
      orders:active?serializeOrders(s):(s.closedOrders||[])
    };
  }
  function registerPublic(app,categories) {
    // Categories are presentation data; never include staff or internal branch records.
    app.get('/api/guest/:token',(req,res)=>{res.set('Cache-Control','no-store');const result=guestState(getGuest(req.params.token));result.categories=result.session.active?categories:[];res.json(result);});
    app.post('/api/guest/:token/orders',(req,res)=>{
      res.set('Cache-Control','no-store');const s=getGuest(req.params.token);
      assert(isActive(s),'QR หมดอายุหรือรอบบริการสิ้นสุดแล้ว กรุณาติดต่อพนักงาน',410);
      assert(s.acceptingOrders,'โต๊ะนี้กำลังแยกหรือชำระบิล กรุณาติดต่อพนักงาน',409);
      assert(data.shifts.find(x=>x.branchId===s.branchId)?.open,'ร้านพักรับออเดอร์ชั่วคราว',409);
      assert(req.body&&typeof req.body==='object'&&!Array.isArray(req.body),'กรุณาส่งรายการเป็น JSON');
      const key=req.body.requestId;
      assert(typeof key==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(key),'กรุณาระบุรหัสคำขอสั่งอาหาร');
      assert(Array.isArray(req.body.items)&&req.body.items.length>0&&req.body.items.length<=30,'เลือกอาหาร 1–30 รายการต่อรอบ');
      // Hash the actual requested selection: price, tenant, branch and table are always server-owned.
      assert(req.body.items.every(i=>i&&typeof i==='object'&&!Array.isArray(i)&&(i.modifiers===undefined||Array.isArray(i.modifiers))&&(i.modifiers||[]).every(m=>m&&typeof m==='object')),'ข้อมูลรายการอาหารไม่ถูกต้อง');
      const normalized=req.body.items.map(i=>({menuId:i?.menuId,qty:i?.qty,note:String(i?.note||'').slice(0,300),modifiers:(Array.isArray(i?.modifiers)?i.modifiers:[]).map(m=>({group:m.group,name:m.name}))}));
      assert(normalized.every(i=>Number.isInteger(i.qty)&&i.qty>0&&i.qty<=20)&&normalized.reduce((s,i)=>s+i.qty,0)<=50,'สั่งได้ไม่เกิน 20 ต่อรายการ และ 50 จานต่อรอบ');
      const hash=crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      s.submissions??=[];const existing=s.submissions.find(x=>x.key===key);
      if(existing){assert(existing.hash===hash,'รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว',409);return res.json({orderId:existing.orderId,batchId:existing.batchId,duplicate:true,...guestState(s),categories});}
      assert(s.submissions.length<100,'โต๊ะนี้สั่งครบจำนวนรอบที่รองรับแล้ว กรุณาติดต่อพนักงาน',429);
      // Validate every item before changing any state.
      const items=parseItems({tenantId:s.tenantId},s.branchId,normalized);
      let o=s.orderIds.map(id=>data.orders.find(o=>o.id===id)).find(o=>o?.tableId===s.tableId&&!terminal.has(o.status));
      if(!o){const settings=data.settings.find(x=>x.tenantId===s.tenantId);o={id:uid(),number:data.nextOrder++,tenantId:s.tenantId,branchId:s.branchId,tableId:s.tableId,type:'dinein',items:[],discount:0,taxRate:settings.taxRate,serviceRate:settings.serviceRate,status:'pending',source:'customer_qr',serviceSessionId:s.id,createdAt:now(),createdBy:`guest:${s.id}`};data.orders.push(o);s.orderIds.push(o.id);}
      const batch=addBatch(o,items,'customer_qr');
      s.submissions.push({key,hash,orderId:o.id,batchId:batch.id,at:now()});
      audit({tenantId:s.tenantId,branchId:s.branchId,name:`ลูกค้าโต๊ะ ${data.tables.find(t=>t.id===s.tableId).name}`,role:'Customer'},'ลูกค้าสั่งผ่าน QR',`#${o.number} · รอบ ${batch.round} · ${items.reduce((s,i)=>s+i.qty,0)} รายการ`,s.branchId);
      persist();res.status(201).json({orderId:o.id,batchId:batch.id,duplicate:false,...guestState(s),categories});
    });
    // Unknown public guest paths must not fall through to employee APIs or the SPA.
    app.use('/api/guest',(_,res)=>res.status(404).json({error:'ไม่พบช่องทางสั่งอาหาร'}));
  }
  function registerStaff(app) {
    app.post('/api/tables/:id/session',(req,res)=>{
      const u=req.user;allowed(u,'tables');feature(u,'medium');
      const t=data.tables.find(t=>t.id===req.params.id&&scope(u,t));assert(t,'ไม่พบโต๊ะ',404);
      assert(data.shifts.find(x=>x.branchId===t.branchId)?.open,'กรุณาเปิดกะก่อนเปิด QR',409);
      let s=sessionForTable(t.id);
      if(!s){
        const orders=data.orders.filter(o=>o.tableId===t.id&&!terminal.has(o.status));
        // A partially settled split round cannot be reopened using a new QR.
        const unsettled=data.tableSessions.find(s=>s.tableId===t.id&&s.status==='active'&&!s.acceptingOrders&&s.orderIds.some(id=>{const o=data.orders.find(o=>o.id===id);return o&&!terminal.has(o.status);}));
        assert(!unsettled,'กรุณาปิดบิลที่แยกไว้ให้ครบก่อนเปิด QR ใหม่',409);
        for(const old of data.tableSessions.filter(s=>s.tableId===t.id&&s.status==='active'))closeSession(old,'QR เดิมหมดอายุและถูกแทนที่แล้ว');
        s={id:uid(),token:crypto.randomBytes(24).toString('hex'),tenantId:u.tenantId,branchId:t.branchId,tableId:t.id,status:'active',acceptingOrders:true,orderIds:orders.map(o=>o.id),submissions:[],createdAt:now(),createdBy:u.id,expiresAt:new Date(Date.now()+12*3600000).toISOString()};
        for(const o of orders)o.serviceSessionId=s.id;
        data.tableSessions.push(s);audit(u,'เปิด QR สั่งอาหาร',`${t.name} · รอบ ${s.id}`,t.branchId);persist();
      }
      res.json({...sessionSummary(s),token:s.token});
    });
    app.post('/api/table-sessions/:id/close',(req,res)=>{
      const u=req.user;allowed(u,'tables');feature(u,'medium');
      const s=data.tableSessions.find(s=>s.id===req.params.id&&scope(u,s));assert(s,'ไม่พบรอบโต๊ะ',404);
      assert(s.orderIds.every(id=>terminal.has(data.orders.find(o=>o.id===id)?.status)),'ยังมีบิลค้าง กรุณาชำระหรือยกเลิกบิลก่อนปิดรอบ',409);
      closeSession(s,'พนักงานปิดรอบบริการแล้ว กรุณาขอ QR ใหม่');audit(u,'ปิด QR สั่งอาหาร',s.tableId,s.branchId);persist();res.json({ok:true});
    });
    app.patch('/api/orders/:id/kitchen-batches/:batchId/status',(req,res)=>{
      const u=req.user;feature(u,'medium');const o=getOrder(u,req.params.id);requireOpen(o);
      const b=o.kitchenBatches?.find(b=>b.id===req.params.batchId);assert(b,'ไม่พบรอบครัว',404);
      const next={pending:'cooking',cooking:'ready',ready:'served'}[b.status];assert(next===req.body.status,'สถานะรอบครัวไม่ถูกต้อง',409);
      allowed(u,next==='served'?'tables':'kitchen');b.status=next;
      for(const item of o.items.filter(i=>b.itemIds.includes(i.id)))item.status=next;
      syncBatches(o);audit(u,'สถานะรอบครัว',`#${o.number} · รอบ ${b.round} → ${next}`,o.branchId);persist();res.json(o);
    });
  }
  return {registerPublic,registerStaff,sessionSummary,isActive,sessionForTable,attachStaffOrder,addBatch,ensureBatches,syncBatches,onOrderClosed,onSplit,revokeForOrder,cancelItem};
}
