import {test,expect} from '@playwright/test';
async function login(page:any,plan:string){
 await page.goto('/');await page.getByRole('button',{name:plan,exact:false}).click();await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();
 const toggle=page.getByRole('button',{name:'เมนูหลัก',exact:true});if(await toggle.isVisible())await toggle.click();
 await page.locator('nav').getByRole('button',{name:'จัดการสาขา',exact:true}).click();
}
test('owner manages branch details and new branch appears throughout the workspace',async({page})=>{
 await login(page,'Enterprise');
 await expect(page.locator('.sidebar-group').filter({hasText:'จัดการร้าน'}).getByRole('button',{name:'จัดการสาขา',exact:true})).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'เพิ่มสาขา',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'เพิ่มสาขา',exact:true});
 await dialog.getByLabel('ชื่อสาขา',{exact:true}).fill('สาขาทดสอบใหม่');await dialog.getByLabel('ที่อยู่',{exact:true}).fill('ถนนทดสอบ 99');await dialog.getByLabel('เบอร์โทร',{exact:true}).fill('0812345678');
 await dialog.getByLabel('เป้าหมายยอดขายต่อวัน (บาท)',{exact:true}).fill('15000');await dialog.getByLabel('จำนวนโต๊ะตั้งต้น',{exact:true}).fill('2');
 await dialog.getByRole('button',{name:'บันทึกสาขา'}).click();await expect(dialog).toHaveCount(0);
 let row=page.getByRole('row').filter({hasText:'สาขาทดสอบใหม่'});await expect(row).toContainText('ถนนทดสอบ 99');await expect(row).toContainText('15,000');
 const branchSelect=page.getByRole('combobox',{name:'สาขา',exact:true});
 const branchId=await branchSelect.locator('option').filter({hasText:'สาขาทดสอบใหม่'}).getAttribute('value');expect(branchId).toBeTruthy();
 await branchSelect.selectOption(branchId!);
 await page.locator('nav').getByRole('button',{name:'ตั้งค่าร้าน',exact:true}).click();await expect(page.getByText('ปิดกะแล้ว',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'จัดการโต๊ะ',exact:true}).click();const tables=page.getByRole('tabpanel',{name:'จัดการโต๊ะ',exact:true});await expect(tables.getByRole('button',{name:'แก้ไขโต๊ะ T01',exact:true})).toBeVisible();await expect(tables.getByRole('button',{name:'แก้ไขโต๊ะ T02',exact:true})).toBeVisible();
 await page.locator('nav').getByRole('button',{name:'จัดการสาขา',exact:true}).click();
 await row.getByRole('button',{name:'แก้ไขสาขา สาขาทดสอบใหม่',exact:true}).click();dialog=page.getByRole('dialog',{name:'แก้ไขสาขา',exact:true});
 await dialog.getByLabel('ชื่อสาขา',{exact:true}).fill('สาขาทดสอบแก้ไข');await dialog.getByRole('button',{name:'บันทึกสาขา'}).click();await expect(dialog).toHaveCount(0);
 row=page.getByRole('row').filter({hasText:'สาขาทดสอบแก้ไข'});await expect(row).toContainText('0812345678');await expect(branchSelect.locator('option:checked')).toContainText('สาขาทดสอบแก้ไข');
 await page.reload();await page.locator('nav').getByRole('button',{name:'จัดการสาขา',exact:true}).click();await expect(row).toContainText('ถนนทดสอบ 99');
 await branchSelect.selectOption(branchId!);await row.getByRole('button',{name:'ลบสาขา สาขาทดสอบแก้ไข',exact:true}).click();await page.getByRole('button',{name:'ยืนยันลบสาขา',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(row).toHaveCount(0);await expect(branchSelect).toHaveValue('b1');
 await page.getByRole('button',{name:'ลบสาขา สุขุมวิท',exact:true}).click();await page.getByRole('button',{name:'ยืนยันลบสาขา',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ไม่สามารถลบได้');await page.getByRole('dialog').getByRole('button',{name:'ยกเลิก',exact:true}).click();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('Medium owners can add branches using the visible add button',async({page})=>{
 await login(page,'Medium');await expect(page.getByRole('button',{name:'เพิ่มสาขา',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'ลบสาขา สุขุมวิท',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'แก้ไขสาขา สุขุมวิท',exact:true}).click();const dialog=page.getByRole('dialog',{name:'แก้ไขสาขา',exact:true});await dialog.getByLabel('ที่อยู่',{exact:true}).fill('สุขุมวิท 99');await dialog.getByRole('button',{name:'บันทึกสาขา'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'สุขุมวิท'})).toContainText('สุขุมวิท 99');
 await page.getByRole('button',{name:'เพิ่มสาขา',exact:true}).click();const add=page.getByRole('dialog',{name:'เพิ่มสาขา',exact:true});await add.getByLabel('ชื่อสาขา',{exact:true}).fill('สาขา Medium ใหม่');await add.getByRole('button',{name:'บันทึกสาขา'}).click();await expect(add).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'สาขา Medium ใหม่'})).toBeVisible();
});

test('Small owners can add branches without hidden table setup',async({page})=>{
 await login(page,'Small');await page.getByRole('button',{name:'เพิ่มสาขา',exact:true}).click();const dialog=page.getByRole('dialog',{name:'เพิ่มสาขา',exact:true});await expect(dialog.getByLabel('จำนวนโต๊ะตั้งต้น',{exact:true})).toHaveCount(0);await dialog.getByLabel('ชื่อสาขา',{exact:true}).fill('คาเฟ่สาขาใหม่');await dialog.getByRole('button',{name:'บันทึกสาขา'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'คาเฟ่สาขาใหม่'})).toBeVisible();
});
