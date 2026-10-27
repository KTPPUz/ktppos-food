import {test,expect} from '@playwright/test';
import express from 'express';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let staticServer:any,output:string,setupOutput:string;
const frontend='http://127.0.0.1:5190/ktppos-food/';
test.beforeAll(async()=>{
 output=fs.mkdtempSync(path.join(os.tmpdir(),'ktp-pages-'));
 execFileSync(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'build','--outDir',output],{env:{...process.env,VITE_BASE_PATH:'/ktppos-food/',VITE_DEPLOY_TARGET:'pages',VITE_API_BASE_URL:'http://127.0.0.1:5188/api'},stdio:'pipe'});
 setupOutput=fs.mkdtempSync(path.join(os.tmpdir(),'ktp-pages-setup-'));
 execFileSync(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'build','--outDir',setupOutput],{env:{...process.env,VITE_BASE_PATH:'/setup-demo/',VITE_DEPLOY_TARGET:'pages',VITE_API_BASE_URL:''},stdio:'pipe'});
 const app=express();app.use('/ktppos-food',express.static(output));app.use('/setup-demo',express.static(setupOutput));app.use((_,res)=>res.sendStatus(404));
 staticServer=app.listen(5190,'127.0.0.1');await new Promise<void>((resolve,reject)=>{staticServer.once('listening',resolve);staticServer.once('error',reject);});
});
test.afterAll(async()=>{if(staticServer)await new Promise<void>(resolve=>staticServer.close(()=>resolve()));if(output)fs.rmSync(output,{recursive:true,force:true});if(setupOutput)fs.rmSync(setupOutput,{recursive:true,force:true});});

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
 await page.locator('nav').getByRole('button',{name:'จัดการโต๊ะ',exact:true}).click();await page.locator('.table-card').filter({hasText:'T15'}).click();await page.getByRole('button',{name:'เปิดบิล / รับชำระเงิน'}).click();await page.getByRole('button',{name:'ชำระเงิน',exact:true}).click();await page.getByRole('button',{name:'บัตรจำลอง',exact:true}).click();await page.getByRole('button',{name:'ยืนยันชำระเงินจำลอง'}).click();await expect(page.getByRole('dialog',{name:'ใบเสร็จรับเงิน'})).toBeVisible();
 await guest.reload();await expect(guest.getByText('รอบบริการสิ้นสุดแล้ว',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'เสร็จสิ้น'}).click();await page.locator('nav').getByRole('button',{name:'QR สั่งอาหาร',exact:true}).click();await page.locator('.qr-table-card').filter({hasText:'โต๊ะ T15'}).getByRole('button').click();const nextUrl=await page.locator('#customer-qr-link').inputValue();expect(nextUrl).not.toBe(url);
 await guest.evaluate(hash=>{window.location.hash=hash;},new URL(nextUrl).hash);await expect(guest.locator('.guest-menu-card')).toHaveCount(30);await expect(guest.getByText('รอบบริการสิ้นสุดแล้ว',{exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);await guestContext.close();
});

test('Pages mockup runs POS and QR locally, persists, resets and makes no API requests',async({page,context,browser})=>{
 const apiRequests:string[]=[],errors:string[]=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 const frontend='http://127.0.0.1:5190/setup-demo/';
 expect((await page.goto(frontend))?.status()).toBe(200);
 await expect(page.getByRole('complementary',{name:'โหมดทดลอง'})).toContainText('ไม่เชื่อมออเดอร์ข้ามเครื่อง');
 await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();
 await page.getByRole('combobox',{name:'เลือกโต๊ะ',exact:true}).fill('T14');await page.getByRole('option',{name:/^T14/}).click();
 await page.locator('.product-card').first().click();await page.getByRole('button',{name:'เพิ่มในออเดอร์'}).click();await page.getByRole('button',{name:'ส่งเข้าครัว'}).click();
 await page.locator('nav').getByRole('button',{name:'หน้าจอครัว'}).click();const ticket=page.locator('.kitchen-ticket').filter({hasText:'T14'});
 for(const name of ['เริ่มทำอาหาร','พร้อมเสิร์ฟ','เสิร์ฟเรียบร้อย'])await ticket.getByRole('button',{name,exact:true}).click();
 await page.reload();await expect(page.locator('.sidebar')).toBeVisible();
 await page.locator('nav').getByRole('button',{name:'จัดการโต๊ะ',exact:true}).click();await page.locator('.table-card').filter({hasText:'T14'}).click();await page.getByRole('button',{name:'เปิดบิล / รับชำระเงิน'}).click();await page.getByRole('button',{name:'ชำระเงิน',exact:true}).click();await page.getByRole('button',{name:'บัตรจำลอง',exact:true}).click();await page.getByRole('button',{name:'ยืนยันชำระเงินจำลอง'}).click();await expect(page.getByRole('dialog',{name:'ใบเสร็จรับเงิน'})).toBeVisible();await page.getByRole('button',{name:'เสร็จสิ้น'}).click();
 await page.locator('nav').getByRole('button',{name:'QR สั่งอาหาร',exact:true}).click();await page.locator('.qr-table-card').filter({hasText:'โต๊ะ T15'}).getByRole('button').click();const qr=await page.locator('#customer-qr-link').inputValue();expect(qr).toContain('/setup-demo/#/order/');
 const guest=await context.newPage();guest.on('pageerror',e=>errors.push(e.message));guest.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());});await guest.goto(qr);await expect(guest.locator('.guest-menu-card')).toHaveCount(30);await guest.locator('.guest-menu-card').first().click();await guest.getByRole('button',{name:'เพิ่มในตะกร้า'}).click();await guest.locator('.guest-cart-bar button').click();await guest.getByRole('button',{name:'ยืนยันส่งเข้าครัว'}).click();await expect(guest.locator('.guest-round')).toHaveCount(1);await guest.reload();await guest.getByRole('button',{name:'ออเดอร์ของโต๊ะ',exact:false}).click();await expect(guest.locator('.guest-round')).toHaveCount(1);
 await page.getByRole('button',{name:'ปิด',exact:true}).click();await page.getByRole('button',{name:'รีเฟรชข้อมูล'}).click();await page.locator('nav').getByRole('button',{name:'หน้าจอครัว'}).click();await expect(page.locator('.kitchen-ticket').filter({hasText:'T15'})).toContainText('ลูกค้าสั่งผ่าน QR');
 const other=await browser.newContext();const isolated=await other.newPage();await isolated.goto(qr);await expect(isolated.locator('.guest-menu-card')).toHaveCount(0);await expect(isolated.getByRole('complementary',{name:'โหมดทดลอง'})).toBeVisible();await other.close();
 // Cancellation keeps the sample order; confirmation starts a new dataset.
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'รีเซ็ตข้อมูล',exact:true}).click();await expect(page.locator('.sidebar')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'รีเซ็ตข้อมูล',exact:true}).click();await expect(page.locator('#account')).toBeVisible();await page.getByRole('button',{name:'เข้าสู่ร้านของคุณ'}).click();await expect(page.locator('.sidebar')).toBeVisible();await page.locator('nav').getByRole('button',{name:'จัดการโต๊ะ',exact:true}).click();await expect(page.locator('.table-card').filter({hasText:'T15'})).toContainText('พร้อมรับลูกค้า');
 await page.screenshot({path:'/private/tmp/ktp-mockup-desktop.png'});expect(apiRequests).toEqual([]);expect(errors).toEqual([]);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'/private/tmp/ktp-mockup-mobile.png',animations:'disabled'});await guest.close();
});

test('Pages mockup explains unavailable browser storage',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Storage blocked','QuotaExceededError');};});
 await page.goto('http://127.0.0.1:5190/setup-demo/');
 await expect(page.locator('.error')).toContainText('อนุญาตพื้นที่จัดเก็บ');
 await expect(page.getByRole('complementary',{name:'โหมดทดลอง'})).toBeVisible();
});
