export const categories = [
  { id: 'all', name: 'ทั้งหมด', icon: 'Grid2X2' }, { id: 'main', name: 'จานหลัก', icon: 'Utensils' }, { id: 'noodle', name: 'เส้น & ซุป', icon: 'Soup' }, { id: 'snack', name: 'ทานเล่น', icon: 'Pizza' }, { id: 'salad', name: 'สลัด & ยำ', icon: 'Salad' }, { id: 'drink', name: 'เครื่องดื่ม', icon: 'Coffee' }, { id: 'dessert', name: 'ของหวาน', icon: 'IceCreamBowl' }
];
const photos = {
 main: ['photo-1512058564366-18510be2db19','photo-1569718212165-3a8278d5f624','photo-1547592180-85f173990554','photo-1511690743698-d9d85f2fbf38','photo-1546069901-ba9599a7e63c'],
 noodle: ['photo-1569718212165-3a8278d5f624','photo-1569058242253-92a9c755a0ec','photo-1547592166-23ac45744acd','photo-1557872943-16a5ac26437e','photo-1547928576-b822bc410bdf'],
 snack: ['photo-1541592106381-b31e9677c0e5','photo-1562967914-608f82629710','photo-1565299624946-b28f40a0ae38','photo-1529042410759-befb1204b468','photo-1548340748-6d98e40f0199'],
 salad: ['photo-1512621776951-a57141f2eefd','photo-1540420773420-3366772f4999','photo-1511690743698-d9d85f2fbf38','photo-1546069901-ba9599a7e63c','photo-1512621776951-a57141f2eefd'],
 drink: ['photo-1513558161293-cdaf765edfd7','photo-1544145945-f90425340c7e','photo-1511920170033-f8396924c348','photo-1461023058943-07fcbe16d735','photo-1439404212301-3f7c5e1e444e'],
 dessert: ['photo-1488477181946-6428a0291777','photo-1563805042-7684c019e1cb','photo-1484723091739-30a097e8f929','photo-1565958011703-44f9829ba187','photo-1551024506-0bccd828d307']
};
const names = {
 main: [['ข้าวกะเพราเนื้อไข่ดาว',129,'Basil beef & fried egg'],['ข้าวผัดกุ้ง',119,'Shrimp fried rice'],['ข้าวไก่ย่างจิ้มแจ่ว',109,'Grilled chicken rice'],['ข้าวหมูทอดกระเทียม',99,'Garlic pork rice'],['ข้าวผัดสับปะรด',139,'Pineapple fried rice']],
 noodle: [['ผัดไทยกุ้งสด',139,'Signature pad thai'],['ต้มยำกุ้งน้ำข้น',189,'Creamy tom yum soup'],['ก๋วยเตี๋ยวเนื้อตุ๋น',119,'Braised beef noodles'],['สปาเก็ตตี้ขี้เมาทะเล',169,'Spicy seafood pasta'],['ต้มข่าไก่',159,'Coconut chicken soup']],
 snack: [['เฟรนช์ฟรายส์',79,'Golden french fries'],['ปีกไก่ทอดน้ำปลา',119,'Crispy chicken wings'],['พิซซ่าหน้ากะเพรา',189,'Thai basil pizza'],['ทอดมันกุ้ง',139,'Thai shrimp cakes'],['ปอเปี๊ยะผัก',89,'Vegetable spring rolls']],
 salad: [['สลัดอกไก่ย่าง',149,'Grilled chicken salad'],['ซีซาร์สลัด',139,'Classic caesar salad'],['ยำวุ้นเส้นทะเล',149,'Seafood glass noodle salad'],['ส้มตำไทย',79,'Thai papaya salad'],['ยำเห็ดรวม',119,'Spicy mushroom salad']],
 drink: [['ชาไทยเย็น',65,'Iced Thai milk tea'],['ยูซุโซดา',85,'Sparkling yuzu'],['อเมริกาโน่เย็น',75,'Iced americano'],['ลาเต้เย็น',85,'Iced cafe latte'],['น้ำแตงโมปั่น',79,'Watermelon smoothie']],
 dessert: [['ข้าวเหนียวมะม่วง',129,'Mango sticky rice'],['ไอศกรีมกะทิ',69,'Coconut ice cream'],['ฮันนี่โทสต์',159,'Honey butter toast'],['ชีสเค้กสตรอว์เบอร์รี',139,'Strawberry cheesecake'],['บราวนี่ช็อกโกแลต',89,'Chocolate brownie']]
};
export function seed() {
 const tenants = [{id:'cafe',name:'Little Day Café',plan:'Small'},{id:'restaurant',name:'KTP Table',plan:'Medium'},{id:'brand',name:'KTP Table Group',plan:'Enterprise'}];
 const branches = [{id:'c1',tenantId:'cafe',name:'อารีย์',target:10000},{id:'r1',tenantId:'restaurant',name:'สุขุมวิท',target:20000},{id:'b1',tenantId:'brand',name:'สุขุมวิท',target:22000},{id:'b2',tenantId:'brand',name:'อารีย์',target:18000},{id:'b3',tenantId:'brand',name:'สาทร',target:25000}];
 const menu=[]; let n=0;
 for(const [category,items] of Object.entries(names)) for(const [i,[name,price,en]] of items.entries()) menu.push({id:`m${++n}`,category,name,en,price,image:`https://images.unsplash.com/${photos[category][i]}?auto=format&fit=crop&w=600&q=80`,popular:[1,2,6,7,21,26].includes(n),available:true,overrides:{},modifiers: category==='drink'?[{id:'sweet',name:'ความหวาน',options:[{name:'หวานปกติ',price:0},{name:'หวานน้อย',price:0},{name:'ไม่หวาน',price:0}]}]:category==='dessert'?[]:[{id:'protein',name:'เพิ่มความอร่อย',options:[{name:'ปกติ',price:0},{name:'เพิ่มไข่ดาว',price:15},{name:'พิเศษ',price:25}]},{id:'spice',name:'ระดับความเผ็ด',options:[{name:'เผ็ดปกติ',price:0},{name:'เผ็ดน้อย',price:0},{name:'ไม่เผ็ด',price:0}]}]});
 const roles=['Owner','Manager','Cashier','Waiter','Kitchen','HQ Admin','Cashier','Waiter'];
 const staffNames=['พิมพ์ชนก','ธนกร','มินตรา','กานต์','เชฟต้น','อรทัย','ณัฐพล','แพรวา'];
 const users=tenants.flatMap(t=>roles.map((role,i)=>({id:`${t.id}-u${i}`,tenantId:t.id,branchId:branches.find(b=>b.tenantId===t.id).id,name:staffNames[i],role,email:`${role.toLowerCase().replace(' ','')}@${t.id}.demo`,pin:'1234'})));
 const ingredientsNames=['ข้าวหอมมะลิ','เนื้อวัว','เนื้อหมู','อกไก่','กุ้งสด','ไข่ไก่','ใบกะเพรา','กระเทียม','พริกสด','น้ำปลา','น้ำมันพืช','น้ำตาล','เส้นจันท์','กะทิ','นมสด','เมล็ดกาแฟ','ใบชาไทย','มะม่วง','มะนาว','ผักสลัด'];
 const ingredients=branches.flatMap(b=>ingredientsNames.map((name,i)=>({id:`${b.id}-i${i}`,tenantId:b.tenantId,branchId:b.id,name,unit:[0,1,2,3,4,6,7,8,11,12,15,16,17,18,19].includes(i)?'กก.':i===5?'ฟอง':'ลิตร',stock:[12,8,15,10,2,85,1,5,3,8,12,7,5,4,2,6,3,8,4,1][i],minimum:i===5?30:3})));
 const tables=branches.flatMap(b=>Array.from({length:15},(_,i)=>({id:`${b.id}-t${i+1}`,tenantId:b.tenantId,branchId:b.id,name:`T${String(i+1).padStart(2,'0')}`,seats:i<5?2:i<12?4:6,reservation:null})));
 const orders=[]; let orderNo=1000;
 const makeItems=(i,b)=>[{id:`seeditem-${i}`,menuId:menu[i%30].id,name:menu[i%30].name,unitPrice:menu[i%30].price,qty:1+i%3,note:'',modifiers:[],status:'pending'}];
 for(const b of branches) {
  for(let day=29;day>=0;day--) for(let j=0;j<5+(day%6);j++) {const d=new Date();d.setDate(d.getDate()-day);d.setHours(10+j,15,0,0);const items=makeItems(day+j,b);const sub=items.reduce((s,x)=>s+x.unitPrice*x.qty,0); orders.push({id:`o${++orderNo}`,number:orderNo,tenantId:b.tenantId,branchId:b.id,type:j%3===0?'takeaway':'dinein',tableId:null,items,status:'paid',discount:0,serviceRate:0,taxRate:7,totals:{subtotal:sub,discount:0,service:0,tax:Math.round(sub*.07*100)/100,total:Math.round(sub*1.07*100)/100},createdAt:d.toISOString(),paidAt:d.toISOString(),payment:{method:['cash','qr','card'][j%3],received:1000},createdBy:`${b.tenantId}-u2`,receipt:`BT-${orderNo}`,refund:null});}
  for(let j=0;j<3;j++){const items=makeItems(j+5,b);orders.push({id:`o${++orderNo}`,number:orderNo,tenantId:b.tenantId,branchId:b.id,type:'dinein',tableId:`${b.id}-t${j+1}`,items,status:['pending','cooking','ready'][j],discount:0,serviceRate:0,taxRate:7,createdAt:new Date(Date.now()-(j+1)*420000).toISOString(),createdBy:`${b.tenantId}-u3`});}
 }
 const refunded=orders.find(o=>o.status==='paid');refunded.status='refunded';refunded.refund={reason:'ลูกค้าสั่งซ้ำ (ข้อมูลตัวอย่าง)',userId:'cafe-u1',at:new Date().toISOString()};
 const recipes=menu.map((m,i)=>({menuId:m.id,parts:[{index:i%20,qty:i%20===5?1:0.1},{index:0,qty:0.15}]}));
 return {tenants,branches,menu,users,ingredients,tables,orders,recipes,transfers:[],movements:[],shifts:branches.map(b=>({id:`shift-${b.id}`,tenantId:b.tenantId,branchId:b.id,open:true,openingCash:2000,openedAt:new Date().toISOString()})),audit:[],settings:tenants.map(t=>({tenantId:t.id,taxRate:7,serviceRate:0})),nextOrder:orderNo+1};
}
