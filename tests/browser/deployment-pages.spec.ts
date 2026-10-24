import {test,expect} from '@playwright/test';
import express from 'express';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let staticServer:any,output:string;
const frontend='http://127.0.0.1:5190/ktppos-food/';
test.beforeAll(async()=>{
 output=fs.mkdtempSync(path.join(os.tmpdir(),'ktp-pages-'));
 execFileSync(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'build','--outDir',output],{env:{...process.env,VITE_BASE_PATH:'/ktppos-food/',VITE_API_BASE_URL:'http://127.0.0.1:5188/api'},stdio:'pipe'});
 const app=express();app.use('/ktppos-food',express.static(output));app.use((_,res)=>res.sendStatus(404));
 staticServer=app.listen(5190,'127.0.0.1');await new Promise<void>((resolve,reject)=>{staticServer.once('listening',resolve);staticServer.once('error',reject);});
});
test.afterAll(async()=>{if(staticServer)await new Promise<void>(resolve=>staticServer.close(()=>resolve()));if(output)fs.rmSync(output,{recursive:true,force:true});});

test('built Pages frontend logs in across origins and QR hash route survives reload on static hosting',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const document=await page.goto(frontend);expect(document?.status()).toBe(200);
 await page.getByRole('button',{name:'Enterprise',exact:false}).click();await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();
 await page.locator('nav').getByRole('button',{name:'QR สั่งอาหาร',exact:true}).click();await page.locator('.qr-table-card').filter({hasText:'โต๊ะ T15'}).getByRole('button').click();await expect(page.locator('#qr-base-url')).toHaveValue(frontend);
 const url=await page.locator('#customer-qr-link').inputValue();expect(url).toMatch(/^http:\/\/127\.0\.0\.1:5190\/ktppos-food\/#\/order\/[a-f0-9]{48}$/);
 const guestContext=await browser.newContext({viewport:{width:390,height:844}});const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));
 const guestDocument=await guest.goto(url);expect(guestDocument?.status()).toBe(200);await expect(guest.locator('.guest-menu-card')).toHaveCount(30);
 const refreshed=await guest.reload();expect(refreshed?.status()).toBe(200);await expect(guest.locator('.guest-menu-card')).toHaveCount(30);
 await guest.locator('.guest-menu-card').first().click();await guest.getByRole('button',{name:'เพิ่มในตะกร้า'}).click();await guest.locator('.guest-cart-bar button').click();await guest.getByRole('button',{name:'ยืนยันส่งเข้าครัว'}).click();await expect(guest.locator('.guest-round')).toHaveCount(1);
 await page.getByRole('button',{name:'ปิด',exact:true}).click();await page.getByRole('button',{name:'รีเฟรชข้อมูล'}).click();await page.locator('nav').getByRole('button',{name:'หน้าจอครัว'}).click();const ticket=page.locator('.kitchen-ticket').filter({hasText:'T15'});await expect(ticket).toContainText('ลูกค้าสั่งผ่าน QR');
 for(const name of ['เริ่มทำอาหาร','พร้อมเสิร์ฟ','เสิร์ฟเรียบร้อย'])await ticket.getByRole('button',{name,exact:true}).click();
 await page.locator('nav').getByRole('button',{name:'จัดการโต๊ะ',exact:true}).click();await page.locator('.table-card').filter({hasText:'T15'}).click();await page.getByRole('button',{name:'เปิดบิล / รับชำระเงิน'}).click();await page.getByRole('button',{name:'ชำระเงินจำลอง',exact:true}).click();await page.getByRole('button',{name:'QR จำลอง',exact:true}).click();await page.getByRole('button',{name:'ยืนยันชำระเงินจำลอง'}).click();await expect(page.getByRole('dialog',{name:'ใบเสร็จรับเงิน'})).toBeVisible();
 await guest.reload();await expect(guest.getByText('รอบบริการสิ้นสุดแล้ว',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'เสร็จสิ้น'}).click();await page.locator('nav').getByRole('button',{name:'QR สั่งอาหาร',exact:true}).click();await page.locator('.qr-table-card').filter({hasText:'โต๊ะ T15'}).getByRole('button').click();const nextUrl=await page.locator('#customer-qr-link').inputValue();expect(nextUrl).not.toBe(url);
 await guest.evaluate(hash=>{window.location.hash=hash;},new URL(nextUrl).hash);await expect(guest.locator('.guest-menu-card')).toHaveCount(30);await expect(guest.getByText('รอบบริการสิ้นสุดแล้ว',{exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);await guestContext.close();
});
