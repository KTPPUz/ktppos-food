import {test,expect} from '@playwright/test';
async function login(page:any,role='2'){
 await page.goto('/');await page.locator('#account').selectOption(`restaurant-u${role}`);await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();
}
test('cashier filters served bills and receives payment for served or unfinished food',async({page})=>{
 const auth=await page.request.post('/api/auth/login',{data:{userId:'restaurant-u0',pin:'1234'}});const {token}=await auth.json();
 const headers={Authorization:`Bearer ${token}`};
 const create=async(menuId:string)=>{const r=await page.request.post('/api/orders',{headers,data:{branchId:'r1',type:'takeaway',items:[{menuId,qty:1}]}});expect(r.status()).toBe(201);return r.json();};
 const draft=await create('m1'),served=await create('m2'),cancelled=await create('m3');
 for(const status of ['pending','cooking','ready','served'])expect((await page.request.patch(`/api/orders/${served.id}/status`,{headers,data:{status}})).ok()).toBeTruthy();
 expect((await page.request.patch(`/api/orders/${cancelled.id}/status`,{headers,data:{status:'cancelled',reason:'ยกเลิกทดสอบ'}})).ok()).toBeTruthy();
 await login(page);
 await expect(page.getByRole('region',{name:'บิลที่ยังไม่ชำระ',exact:true})).toHaveCount(0);
 await expect(page.locator('.product-card')).toHaveCount(30);
 await page.getByRole('button',{name:/บิลที่ยังไม่ชำระ/}).click();
 await expect(page.getByRole('heading',{name:'รับชำระเงิน.',exact:true})).toBeVisible();
 const nav=page.locator('nav').getByRole('button',{name:/^รับชำระเงิน/});
 const initialCount=Number(await nav.locator('b').innerText());
 const panel=page.getByRole('region',{name:'บิลที่ยังไม่ชำระ',exact:true});
 const expand=panel.getByRole('button',{name:/ดูทั้งหมด/});if(await expand.count())await expand.click();
 await expect(panel.locator(`[data-order-id="${draft.id}"]`)).toContainText('ซื้อกลับ');
 await expect(panel.locator(`[data-order-id="${draft.id}"]`)).toContainText('138.03');
 await expect(panel.locator(`[data-order-id="${cancelled.id}"]`)).toHaveCount(0);
 await panel.getByRole('textbox',{name:'ค้นหาบิลหรือโต๊ะ'}).fill(`#${draft.number}`);
 await expect(panel.locator('.unpaid-bill')).toHaveCount(1);
 await panel.getByRole('button',{name:'ล้างคำค้นบิล'}).click();
 await panel.getByRole('textbox',{name:'ค้นหาบิลหรือโต๊ะ'}).fill('T01');
 await expect(panel.locator('.unpaid-bill')).toHaveCount(1);
 await expect(panel.locator('.unpaid-bill')).toContainText('T01');
 await panel.getByRole('button',{name:'ล้างคำค้นบิล'}).click();
 await panel.getByRole('button',{name:/เสิร์ฟครบแล้ว/}).click();
 await expect(panel.locator(`[data-order-id="${draft.id}"]`)).toHaveCount(0);
 const servedRow=panel.locator(`[data-order-id="${served.id}"]`);await expect(servedRow).toContainText('เสิร์ฟแล้ว');await expect(servedRow).toContainText('เปิด');
 async function pay(number:number){
  await panel.getByRole('button',{name:`รับชำระเงิน บิล #${number}`,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'ชำระเงินจำลอง',exact:true});await expect(dialog).toContainText(`#${number}`);
  await dialog.getByRole('button',{name:'QR จำลอง',exact:true}).click();await dialog.getByRole('button',{name:'ยืนยันชำระเงินจำลอง'}).click();
  await expect(page.getByRole('dialog',{name:'ใบเสร็จรับเงิน'})).toBeVisible();await page.getByRole('button',{name:'เสร็จสิ้น'}).click();
  await expect(page.getByRole('heading',{name:'รับชำระเงิน.',exact:true})).toBeVisible();
 }
 await pay(served.number);await expect(servedRow).toHaveCount(0);
 await panel.getByRole('button',{name:/ทั้งหมด \(/,exact:false}).first().click();
 if(await expand.count())await expand.click();
 await pay(draft.number);await expect(panel.locator(`[data-order-id="${draft.id}"]`)).toHaveCount(0);
 await expect(nav.locator('b')).toHaveText(String(initialCount-2));
 await panel.getByRole('textbox',{name:'ค้นหาบิลหรือโต๊ะ'}).fill('no-matching-bill');
 await expect(panel).toContainText('ไม่พบบิลที่ตรงกับคำค้น');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('opening payment preserves an unsaved cart when the cashier cancels the prompt',async({page})=>{
 await login(page);
 await page.locator('.product-card').first().click();await page.getByRole('button',{name:'เพิ่มในออเดอร์'}).click();
 await expect(page.locator('.cart-item')).toHaveCount(1);
 await page.locator('nav').getByRole('button',{name:/^รับชำระเงิน/}).click();
 const confirmation=page.waitForEvent('dialog');
 await page.getByRole('region',{name:'บิลที่ยังไม่ชำระ'}).getByRole('button',{name:/รับชำระเงิน บิล/}).first().click();
 await (await confirmation).dismiss();
 await expect(page.getByRole('dialog',{name:'ชำระเงินจำลอง',exact:true})).toHaveCount(0);
 await page.locator('nav').getByRole('button',{name:'ขายหน้าร้าน',exact:true}).click();
 await expect(page.locator('.cart-item')).toHaveCount(1);
});
test('waiter has no payment menu and can still view open bills',async({page})=>{
 await login(page,'3');
 await expect(page.locator('nav').getByRole('button',{name:/^รับชำระเงิน/})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'บิลที่ยังไม่ชำระ'})).toHaveCount(0);
 await page.getByRole('button',{name:/บิลที่ยังไม่ชำระ/}).click();
 await expect(page.getByRole('dialog',{name:'บิลที่ยังไม่ชำระ',exact:true})).toBeVisible();
});
test('payment page switches bills and resets search when changing branch',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Enterprise',exact:false}).click();await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();
 const token=await page.evaluate(()=>sessionStorage.getItem('bt-token'));
 const state=await (await page.request.get('/api/state',{headers:{Authorization:`Bearer ${token}`}})).json();
 const closed=['paid','refunded','cancelled','merged','split'];
 const expected=(branch:string)=>state.orders.filter((order:any)=>order.branchId===branch&&!closed.includes(order.status));
 await page.locator('nav').getByRole('button',{name:/^รับชำระเงิน/}).click();
 const panel=page.getByRole('region',{name:'บิลที่ยังไม่ชำระ'});
 await expect(panel.locator('.unpaid-bill')).toHaveCount(expected('b1').length);
 await panel.getByRole('textbox',{name:'ค้นหาบิลหรือโต๊ะ'}).fill('not-found');
 await page.getByRole('combobox',{name:'สาขา',exact:true}).selectOption('b2');
 await expect(panel.getByRole('textbox',{name:'ค้นหาบิลหรือโต๊ะ'})).toHaveValue('');
 await expect(panel.locator('.unpaid-bill')).toHaveCount(expected('b2').length);
 for(const order of expected('b1'))await expect(panel.locator(`[data-order-id="${order.id}"]`)).toHaveCount(0);
 for(const order of expected('b2'))await expect(panel.locator(`[data-order-id="${order.id}"]`)).toHaveCount(1);
});
