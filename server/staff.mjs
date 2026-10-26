import {assert} from './domain.mjs';

const roles=['Owner','Manager','Cashier','Waiter','Kitchen','HQ Admin'];
const safe=({pin,...user})=>user;
export function registerStaff({app,data,sessions,uid,audit,persist}){
  const owner=user=>assert(user.role==='Owner','เฉพาะเจ้าของร้านเท่านั้นที่จัดการทีมงานได้',403);
  function target(user,id){
    const employee=data.users.find(x=>x.id===id&&x.tenantId===user.tenantId);
    assert(employee,'ไม่พบพนักงาน',404);
    assert(employee.id!==user.id,'ไม่สามารถแก้ไขหรือลบบัญชีที่กำลังใช้งานได้',409);
    return employee;
  }
  function validate(user,body,current){
    assert(body&&typeof body==='object'&&!Array.isArray(body),'ข้อมูลทีมงานไม่ถูกต้อง');
    const result={};
    for(const field of ['name','email','role','branchId','pin']){
      if(current&&body[field]===undefined)continue;
      assert(typeof body[field]==='string',`กรุณาระบุ ${field}`);
      const value=body[field].trim();
      if(field==='name')assert(value.length>0&&value.length<=100,'กรุณาระบุชื่อทีมงานไม่เกิน 100 ตัวอักษร');
      if(field==='email'){
        assert(value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),'รูปแบบอีเมลไม่ถูกต้อง');
        assert(!data.users.some(x=>x.tenantId===user.tenantId&&x.id!==current?.id&&x.email.toLowerCase()===value.toLowerCase()),'อีเมลนี้มีในทีมงานแล้ว',409);
      }
      if(field==='role')assert(roles.includes(value),'บทบาทไม่ถูกต้อง');
      if(field==='branchId')assert(data.branches.some(b=>b.id===value&&b.tenantId===user.tenantId),'ไม่พบสาขาในร้านนี้',403);
      if(field==='pin')assert(/^\d{4,8}$/.test(value),'PIN ต้องเป็นตัวเลข 4–8 หลัก');
      result[field]=field==='email'?value.toLowerCase():value;
    }
    assert(Object.keys(result).length,'กรุณาระบุข้อมูลที่ต้องการแก้ไข');
    return result;
  }
  function revoke(userId){
    if(sessions.revokeUser)sessions.revokeUser(userId);
    else for(const [token,id] of sessions)if(id===userId)sessions.delete(token);
  }
  app.post('/api/users',(req,res)=>{
    owner(req.user);
    const fields=validate(req.user,req.body);
    const employee={...fields,id:uid(),tenantId:req.user.tenantId};
    data.users.push(employee);
    audit(req.user,'เพิ่มทีมงาน',employee.name,employee.branchId);persist();
    res.status(201).json(safe(employee));
  });
  app.patch('/api/users/:id',(req,res)=>{
    owner(req.user);const employee=target(req.user,req.params.id);
    const updates=validate(req.user,req.body,employee);
    const accessChanged=['pin','role','branchId'].some(field=>updates[field]!==undefined&&updates[field]!==employee[field]);
    Object.assign(employee,updates);
    if(accessChanged)revoke(employee.id);
    audit(req.user,'แก้ไขทีมงาน',employee.name,employee.branchId);persist();
    res.json(safe(employee));
  });
  app.delete('/api/users/:id',(req,res)=>{
    owner(req.user);const employee=target(req.user,req.params.id);
    revoke(employee.id);data.users=data.users.filter(x=>x.id!==employee.id);
    audit(req.user,'ลบทีมงาน',employee.name,employee.branchId);persist();
    res.json({ok:true});
  });
}
