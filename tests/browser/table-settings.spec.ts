import {test,expect} from '@playwright/test';
async function login(page:any,plan='Medium'){
 await page.goto('/');await page.getByRole('button',{name:plan,exact:false}).click();await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();
 const menu=page.getByRole('button',{name:'เมนูหลัก',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('nav').getByRole('button',{name:'ตั้งค่าร้าน',exact:true}).click();
}
test('owner edits table data in settings and existing QR sees the new label',async({page})=>{
 await login(page);
 await expect(page.getByRole('tabpanel',{name:'ภาษีและกะขาย'})).toBeVisible();
 await page.getByRole('tab',{name:'จัดการโต๊ะ',exact:true}).click();
 const panel=page.getByRole('tabpanel',{name:'จัดการโต๊ะ',exact:true});
 const token=await page.evaluate(()=>sessionStorage.getItem('bt-token'));
 const qrResponse=await page.request.post('/api/tables/r1-t15/session',{headers:{Authorization:`Bearer ${token}`}});expect(qrResponse.ok()).toBeTruthy();const qr=await qrResponse.json();
 await panel.getByRole('button',{name:'แก้ไขโต๊ะ T15',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'แก้ไขข้อมูลโต๊ะ'});
 await dialog.getByLabel('ชื่อโต๊ะ').fill('ริมหน้าต่าง 15');await dialog.getByLabel('จำนวนที่นั่ง').fill('6');
 await dialog.getByRole('button',{name:'บันทึกข้อมูลโต๊ะ'}).click();await expect(dialog).toHaveCount(0);
 await expect(panel.getByRole('row').filter({hasText:'ริมหน้าต่าง 15'})).toContainText('6 ที่นั่ง');
 const guest=await page.request.get(`/api/guest/${qr.token}`);expect((await guest.json()).restaurant.table).toBe('ริมหน้าต่าง 15');
 await page.reload();await page.locator('nav').getByRole('button',{name:'ตั้งค่าร้าน',exact:true}).click();await page.getByRole('tab',{name:'จัดการโต๊ะ',exact:true}).click();
 await expect(panel.getByRole('row').filter({hasText:'ริมหน้าต่าง 15'})).toContainText('6 ที่นั่ง');
 await panel.getByRole('button',{name:'แก้ไขโต๊ะ ริมหน้าต่าง 15',exact:true}).click();await dialog.getByLabel('ชื่อโต๊ะ').fill('T01');await dialog.getByRole('button',{name:'บันทึกข้อมูลโต๊ะ'}).click();
 await expect(dialog.getByRole('alert')).toContainText('ชื่อโต๊ะนี้มีในสาขาแล้ว');await dialog.getByRole('button',{name:'ยกเลิก'}).click();
 await page.locator('nav').getByRole('button',{name:'จัดการโต๊ะ',exact:true}).click();await expect(page.locator('.table-card').filter({hasText:'ริมหน้าต่าง 15'})).toContainText('6 ที่นั่ง');
});
test('table settings follow branch selection and remain hidden for Small',async({page})=>{
 await login(page,'Enterprise');await page.getByRole('tab',{name:'จัดการโต๊ะ',exact:true}).click();
 await page.getByRole('combobox',{name:'สาขา',exact:true}).selectOption('b2');
 const panel=page.getByRole('tabpanel',{name:'จัดการโต๊ะ',exact:true});await expect(panel).toContainText('สาขาอารีย์');
 await panel.getByRole('button',{name:'แก้ไขโต๊ะ T01',exact:true}).click();const dialog=page.getByRole('dialog',{name:'แก้ไขข้อมูลโต๊ะ'});
 await dialog.getByLabel('ชื่อโต๊ะ').fill('โซนสวน');await dialog.getByRole('button',{name:'บันทึกข้อมูลโต๊ะ'}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('combobox',{name:'สาขา',exact:true}).selectOption('b1');await expect(panel.getByRole('button',{name:'แก้ไขโต๊ะ T01',exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'แก้ไขโต๊ะ โซนสวน',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.evaluate(()=>sessionStorage.removeItem('bt-token'));await login(page,'Small');await expect(page.getByRole('tab',{name:'จัดการโต๊ะ',exact:true})).toHaveCount(0);
});
