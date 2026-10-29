export const management=['Owner','Manager','HQ Admin'];
export const permissions={
 pos:['Owner','Manager','Cashier','Waiter','HQ Admin'], pay:['Owner','Manager','Cashier','HQ Admin'], kitchen:['Owner','Manager','Kitchen','HQ Admin'], serve:['Owner','Manager','Cashier','Waiter','HQ Admin'], tables:['Owner','Manager','Cashier','Waiter','HQ Admin'], reports:['Owner','Manager','Cashier','HQ Admin'], inventory:['Owner','Manager','HQ Admin'], menu:['Owner','Manager','HQ Admin'], staff:['Owner','Manager','HQ Admin'], settings:['Owner','HQ Admin'], hq:['Owner','HQ Admin'], refund:['Owner','Manager','HQ Admin'], audit:['Owner','Manager','HQ Admin']
};
export function assert(condition,message='ข้อมูลไม่ถูกต้อง',status=400){if(!condition)throw Object.assign(new Error(message),{status});}
export function money(value){return Math.round((value+Number.EPSILON)*100)/100;}
export function totals(order){const subtotal=money(order.items.reduce((s,i)=>s+i.qty*i.unitPrice,0));const discount=money(order.discount||0);assert(discount>=0&&discount<=subtotal,'ส่วนลดต้องไม่เกินยอดสินค้า');const service=money((subtotal-discount)*(order.serviceRate||0)/100);const tax=money((subtotal-discount+service)*(order.taxRate||0)/100);return {subtotal,discount,service,tax,total:money(subtotal-discount+service+tax+(order.roundingAdjustment||0))};}
export function can(user,action){return permissions[action]?.includes(user.role)||false;}
export function scope(user,entity){return entity.tenantId===user.tenantId&&(management.includes(user.role)||entity.branchId===user.branchId);}
export function requireOpen(order){assert(!['paid','refunded','cancelled','merged','split'].includes(order.status),'บิลนี้ปิดแล้ว',409);}
export function splitItems(items, selected){assert(selected&&typeof selected==='object','เลือกรายการที่ต้องการแยก');const moved=[],remaining=[];for(const item of items){const qty=Number(selected[item.id]||0);assert(Number.isInteger(qty)&&qty>=0&&qty<=item.qty,'จำนวนแยกบิลไม่ถูกต้อง');if(qty)moved.push({...item,qty});if(item.qty>qty)remaining.push({...item,qty:item.qty-qty});}assert(moved.length&&remaining.length,'ต้องเหลือรายการทั้งสองบิล');return {moved,remaining};}
