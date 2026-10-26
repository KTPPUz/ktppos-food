import {test,expect} from '@playwright/test';
test('owner adds, edits and deletes a team member',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Medium',exact:false}).click();await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();
 await page.locator('nav').getByRole('button',{name:'ทีมงาน & สิทธิ์',exact:true}).click();
 await page.getByRole('button',{name:'เพิ่มทีมงาน',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'เพิ่มทีมงาน',exact:true});
 await dialog.getByLabel('ชื่อทีมงาน').fill('ทีมงานทดสอบ');await dialog.getByLabel('อีเมล').fill('staff-browser@example.com');await dialog.getByLabel('PIN เข้าสู่ระบบ').fill('5678');
 await dialog.getByRole('button',{name:'เพิ่มทีมงาน',exact:true}).click();await expect(dialog).toHaveCount(0);
 let row=page.getByRole('row').filter({hasText:'staff-browser@example.com'});await expect(row).toContainText('ทีมงานทดสอบ');
 await row.getByRole('button',{name:'แก้ไข ทีมงานทดสอบ',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'แก้ไขทีมงาน',exact:true});
 await dialog.getByLabel('ชื่อทีมงาน').fill('ทีมงานแก้ไข');await dialog.getByRole('combobox',{name:'บทบาท',exact:true}).selectOption('Cashier');
 await dialog.getByRole('button',{name:'บันทึกการแก้ไข'}).click();await expect(dialog).toHaveCount(0);
 row=page.getByRole('row').filter({hasText:'staff-browser@example.com'});await expect(row).toContainText('ทีมงานแก้ไข');await expect(row).toContainText('แคชเชียร์');
 await row.getByRole('button',{name:'ลบ ทีมงานแก้ไข',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'ลบทีมงาน',exact:true});await dialog.getByRole('button',{name:'ยกเลิก'}).click();await expect(row).toHaveCount(1);
 await row.getByRole('button',{name:'ลบ ทีมงานแก้ไข',exact:true}).click();await page.getByRole('button',{name:'ยืนยันลบทีมงาน'}).click();await expect(row).toHaveCount(0);
 await expect(page.getByRole('button',{name:/ลบ .*พิมพ์ชนก/})).toHaveCount(0);
});
