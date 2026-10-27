import {test,expect} from '@playwright/test';
test('table selector searches, selects with keyboard, clears and handles no matches',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();
 const combo=page.getByRole('combobox',{name:'เลือกโต๊ะ',exact:true});await expect(combo).toBeVisible();await combo.fill('T14');
 await expect(page.getByRole('option')).toHaveCount(1);await expect(page.getByRole('option',{name:/^T14/})).toContainText('ที่นั่ง');
 await combo.press('Enter');await expect(combo).toHaveValue(/T14/);await expect(combo).toHaveAttribute('aria-expanded','false');
 await combo.click();await combo.fill('ไม่มีโต๊ะชื่อนี้');await expect(page.getByRole('status')).toContainText('ไม่พบรายการที่ค้นหา');await combo.press('Escape');await expect(combo).toHaveValue(/T14/);
 await page.getByRole('button',{name:'ล้างเลือกโต๊ะ',exact:true}).click();await expect(combo).toHaveValue('ไม่ระบุโต๊ะ');
 await combo.click();await combo.fill('T13');await page.getByRole('option',{name:/^T13/}).click();await expect(combo).toHaveValue(/T13/);
 await combo.click();await page.getByRole('heading',{name:'รับออเดอร์',exact:false}).click();await expect(combo).toHaveAttribute('aria-expanded','false');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
