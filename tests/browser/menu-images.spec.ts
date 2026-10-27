import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';
const image=new PNG({width:64,height:48});image.data.fill(255);
const photo={name:'food-photo.png',mimeType:'image/png',buffer:PNG.sync.write(image)};
async function editFirstMenu(page:any){
 await page.locator('nav').getByRole('button',{name:'เมนูอาหาร',exact:true}).click();
 await page.getByRole('row').filter({has:page.locator('.table-product')}).first().getByRole('button',{name:'แก้ไข',exact:false}).click();
 return page.getByRole('dialog',{name:'แก้ไขเมนูอาหาร',exact:true});
}
async function login(page:any){
 await page.goto('/');await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();
}
test('preview waits for save and uploaded photo appears in menu, POS and public QR menu',async({page})=>{
 await login(page);const token=await page.evaluate(()=>sessionStorage.getItem('bt-token'));
 const catalog=async()=>{const r=await page.request.get('/api/menu-items',{headers:{Authorization:`Bearer ${token}`}});return r.json();};
 const original=(await catalog())[0].image;
 let dialog=await editFirstMenu(page);await dialog.getByLabel('แนบรูปอาหาร',{exact:true}).setInputFiles(photo);
 await expect(dialog.getByAltText('ตัวอย่างรูปอาหาร')).toHaveAttribute('src',/^blob:/);
 expect((await catalog())[0].image).toBe(original);
 await dialog.getByRole('button',{name:'ปิด',exact:true}).click();expect((await catalog())[0].image).toBe(original);
 dialog=await editFirstMenu(page);await dialog.getByLabel('แนบรูปอาหาร',{exact:true}).setInputFiles(photo);
 await dialog.getByRole('button',{name:'บันทึกเมนู',exact:true}).click();await expect(dialog).toHaveCount(0);
 const saved=(await catalog())[0].image;expect(saved).toMatch(/\/media\/menu-images\/[a-f0-9-]+\.webp$/);
 const row=page.getByRole('row').filter({has:page.locator('.table-product')}).first();await expect(row.locator('img')).toHaveAttribute('src',saved);
 const file=await page.request.get(saved);expect(file.status()).toBe(200);expect(file.headers()['content-type']).toContain('image/webp');
 await page.reload();await expect(page.locator('.product-card').first().locator('img')).toHaveAttribute('src',saved);
 const session=await page.request.post('/api/tables/r1-t15/session',{headers:{Authorization:`Bearer ${token}`}});const {token:guestToken}=await session.json();
 const guest=await page.context().newPage();await guest.goto(`/#/order/${guestToken}`);
 const guestImage=guest.locator('.guest-menu-card').first().locator('img');await expect(guestImage).toHaveAttribute('src',saved);
 await expect.poll(()=>guestImage.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);await guest.close();
});
test('menu image picker rejects unsupported and oversized files before upload',async({page})=>{
 await login(page);const dialog=await editFirstMenu(page);const input=dialog.getByLabel('แนบรูปอาหาร',{exact:true});
 await input.setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await expect(dialog.getByRole('alert')).toContainText('JPG, PNG หรือ WebP');
 await input.setInputFiles({name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});
 await expect(dialog.getByRole('alert')).toContainText('ไม่เกิน 5 MB');
 await input.setInputFiles(photo);await expect(dialog.getByRole('alert')).toHaveCount(0);
 await dialog.getByRole('button',{name:'ยกเลิกรูปที่เลือก'}).click();await expect(dialog.getByAltText('ตัวอย่างรูปอาหาร')).not.toHaveAttribute('src',/^blob:/);
});
