# Laravel / PHP + MariaDB บน Hostinger (ไม่ใช้ VPS)

Stack หลัก: React 19 + TypeScript + Vite → Laravel 12 / PHP 8.3 → MariaDB ผ่าน Eloquent ส่วน phpMyAdmin เป็นหน้าจัดการฐานข้อมูล ไม่ใช่ตัวฐานข้อมูล

## เครื่องพัฒนา

- PHP 8.3 พร้อม PDO MySQL, mbstring, openssl, fileinfo, dom และ Composer 2
- Node.js 22 ใช้ build/develop React เท่านั้น ไม่ต้องรัน Node.js บนโฮสต์จริง
- คัดลอก `.env.example` ที่ root เป็น `.env` และตั้ง `MARIADB_PASSWORD` / `MARIADB_ROOT_PASSWORD` ก่อนใช้ Docker
- MariaDB ใน Docker (`docker compose up -d --wait mariadb phpmyadmin`) หรือ MySQL/MariaDB ของ MAMP
- `composer install --working-dir=backend` และ `npm ci`
- สร้าง `backend/.env` ตาม `backend/.env.example` แล้วตั้ง `DB_*` ให้ตรงกับฐานข้อมูล
- `cd backend` → `php artisan key:generate` → `php artisan migrate`
- เลือก `php artisan pos:import /absolute/path/export.json` เพื่อใช้ข้อมูลเดิม หรือ `php artisan pos:seed` เพื่อเริ่ม demo ใหม่ ห้ามรันทั้งสองบนฐานข้อมูลเดียวกัน
- กลับ root แล้ว `npm run dev` เปิด http://localhost:5173 (Laravel API ที่ 8050)

Docker ในชุดนี้มี MariaDB ที่ `127.0.0.1:55433` และ phpMyAdmin ที่ http://localhost:8081 บัญชีฐานข้อมูลคือ `pos_food` รหัสผ่านอยู่ใน `.env` (`MARIADB_PASSWORD`) และ `backend/.env` (`DB_PASSWORD`) ใช้รหัสที่ตรงกัน ไม่ต้องเผยแพร่ phpMyAdmin นี้สู่ภายนอก

## ย้ายข้อมูลจากระบบ PostgreSQL เดิม

1. หยุดเซิร์ฟเวอร์ Express เดิมเพื่อไม่ให้มีออเดอร์เข้าระหว่างย้าย
2. จาก root รัน `npm run db:export:legacy -- .data/migration.json` โดยใช้ `DATABASE_URL` เดิมใน `.env`
3. ใน `backend/` รัน `php artisan migrate --force` และ `php artisan pos:import ../.data/migration.json`
4. ตรวจจำนวนร้าน/บิลและทดสอบล็อกอิน แล้วเริ่มเซิร์ฟเวอร์ Laravel

Import ทำใน transaction เดียวและปฏิเสธการเขียนทับฐานข้อมูลที่มีข้อมูลอยู่แล้ว ไฟล์ต้นฉบับและ PostgreSQL เดิมยังคงอยู่ PIN เดิมถูกแฮช และ QR capabilities ถูกเข้ารหัสด้วย `APP_KEY` ของ Laravel รอบ QR และ requestId เดิมยังนำเข้าได้ แต่ session พนักงานเดิมต้องล็อกอินใหม่ เก็บไฟล์ export นอก public directory และลบทิ้งเมื่อย้าย/ตรวจสอบเสร็จและมี backup แล้ว

## เตรียมไฟล์บนเครื่องก่อนอัปโหลด

```sh
npm run package:hostinger
```

ได้ `.artifacts/hostinger.zip` ซึ่งมี `laravel/`, `public_html/` และคู่มือนี้ รวม Composer dependencies สำหรับ production และ React ที่ build แล้ว ไม่มี `.env` หรือข้อมูลลูกค้า ต้องติดตั้ง Composer ในเครื่องที่สร้างแพ็กเกจ ไม่ต้องใช้ Composer หรือ Node.js บนโฮสต์เพื่อรันเว็บ

## ติดตั้งบน Hostinger Web Hosting

1. เลือก PHP **8.3 หรือใหม่กว่าที่รองรับ dependencies** และเปิด extensions ตามข้อกำหนด Laravel
2. สร้างฐานข้อมูล MariaDB/MySQL และผู้ใช้ใน hPanel จดชื่อ DB/ผู้ใช้จริง (มักมี prefix ของบัญชี)
3. อัปโหลดแล้วแตก ZIP ให้ได้โครงสร้างนี้:

```text
domains/your-domain.com/
├── laravel/          # app, vendor, storage, .env — อยู่นอก public_html
└── public_html/      # index.php, .htaccess, index.html, assets
```

`public_html/index.php` ใน ZIP ถูกปรับให้โหลด Laravel จาก `../laravel` แล้ว อย่าอัปโหลด `.env`, vendor หรือ database export ลง `public_html`

4. สร้าง `laravel/.env` จาก `.env.example`: ตั้ง `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-domain.com` และ `DB_*` จาก hPanel สำหรับเว็บ origin เดียวกันปล่อย `CORS_ALLOWED_ORIGINS` ว่างได้
5. ผ่าน SSH ไปที่ `laravel/` แล้วรัน:

```sh
php artisan key:generate --force
php artisan migrate --force
php artisan pos:import /path/outside/public_html/migration.json
php artisan config:cache
php artisan route:cache
```

ถ้าเริ่มใหม่ใช้ `php artisan pos:seed` แทน import (ข้อมูล demo, PIN 1234) ห้ามรัน seed ในทุก deployment

6. ให้บัญชี PHP เขียน `laravel/storage` และ `laravel/bootstrap/cache` ได้ตาม permission ของโฮสต์ หลีกเลี่ยง chmod 777
7. เปิด `/healthz` ให้ได้ `{"status":"ok"}` แล้วลองล็อกอิน สร้างออเดอร์ สแกน QR และปิดบิล
8. เปิดฐานข้อมูลผ่าน **hPanel → Databases → phpMyAdmin** เพื่อดูตาราง สำรอง/ส่งออก SQL หรือ restore backup

หากแพ็กเกจไม่มี SSH ให้ใช้ `php artisan pos:export-sql /private/path/backup.sql` จากฐานข้อมูล MariaDB ที่เตรียมเสร็จในเครื่อง แล้ว import SQL ผ่าน phpMyAdmin เข้า DB ว่างบน Hostinger แทนคำสั่ง migrate/import ต้องคัดลอก **APP_KEY เดิม** ไปตั้งใน `laravel/.env` ด้วย เพราะ SQL มีข้อมูล QR ที่เข้ารหัสอยู่ อย่าสร้าง key ใหม่หลังนำเข้า SQL และอย่าวางไฟล์ SQL ใน public_html แพ็กเกจ ZIP ไม่รวม SQL ข้อมูลจริงให้อัตโนมัติ

## ข้อจำกัดและการดูแล

- เป็นการย้าย domain เดิมครบ API โดยยังโหลดข้อมูลทั้งชุดในแต่ละคำขอ และล็อกแถว `pos_counters` กลางใน transaction เพื่อป้องกันหลาย PHP requests เขียนทับกัน เหมาะกับการทดสอบ/เริ่มใช้งานขนาดเล็ก ต้องปรับ query และล็อกแยกบิลก่อนขยายหลายสาขาปริมาณมาก
- ตารางหลักแยกเป็นร้าน สาขา พนักงาน บิล รายการอาหาร รอบครัว รอบ QR สต็อก ฯลฯ รายละเอียดบางส่วนยังเป็น JSON ต่อแถวเพื่อรักษารูปแบบ API เดิม การแก้ข้อมูลตรงใน phpMyAdmin อาจทำให้คอลัมน์กับ JSON ไม่สอดคล้องกัน ควรแก้รายการผ่านหน้าระบบ
- อีเมลซ้ำที่มีอยู่ในข้อมูล demo เดิมคงไว้เพื่อไม่แก้ข้อมูลระหว่างย้าย แต่ API ป้องกันอีเมลซ้ำสำหรับทีมงานที่เพิ่ม/แก้ไขใหม่ภายใต้ transaction
- ยังใช้ PIN เข้าสู่ระบบและการชำระเงินจำลอง ข้อมูลจริงควรใช้บัญชีและ PIN ที่ตั้งใหม่ ไม่ใช้ demo defaults
- ไม่ต้องใช้ Docker, Redis, WebSocket server, queue worker หรือ process Node.js บน Hostinger หน้า POS/ครัวยัง poll ทุก 8 วินาที
- สำรองทั้ง MariaDB และ `APP_KEY` อย่างปลอดภัย ทดสอบ restore ก่อนเปิดรับรายการจริง

## ตรวจสอบ

```sh
npm run test:php
npm run build:hostinger
npm run test:e2e
# หลังสร้าง ZIP แล้ว ตรวจชุดติดตั้งด้วย PHP จริง:
npm run test:production
```

PHP tests ใช้ SQLite ชั่วคราวตาม `backend/phpunit.xml` หากต้องการตรวจ SQL ของ MariaDB ให้สร้าง DB สำหรับทดสอบแยกโดยเฉพาะ แล้วรันใน backend:

```sh
DB_CONNECTION=mysql DB_DATABASE=pos_food_test php artisan test
```

อย่าชี้ PHPUnit ไปฐานข้อมูลใช้งานจริง เพราะ RefreshDatabase ใช้ migrations/transactions สำหรับเตรียมฐานข้อมูลทดสอบ

## รูปเมนูที่อัปโหลด

หน้า **เมนูอาหาร → แก้ไข → แนบรูปอาหาร** รับ JPG, PNG และ WebP ไม่เกิน 5 MB มีตัวอย่างก่อนบันทึก เมื่อบันทึกจะตรวจไฟล์จริง ย่อด้านยาวไม่เกิน 1600 พิกเซล และสร้าง WebP ชื่อสุ่ม รูปเดียวกันใช้ในเมนู หน้าขาย และหน้าลูกค้า QR ของทุกสาขาภายในร้าน

เปิดส่วนขยาย PHP **GD ที่รองรับ WebP** และ **Fileinfo** บน Hostinger ควรตั้ง `upload_max_filesize=6M` และ `post_max_size=8M` (ชุดติดตั้งมี `public_html/.user.ini` แล้ว หากโฮสต์ไม่อนุญาตให้แก้ในไฟล์นี้ให้ตั้งผ่าน PHP Configuration ใน hPanel)

รูปจริงเก็บใน `laravel/storage/app/menu-images` และอ่านผ่าน `/media/menu-images/{filename}` โดยไม่ต้องใช้ `storage:link` ต้องให้ PHP เขียนโฟลเดอร์ storage ได้ เมื่อเปลี่ยนรูปสำเร็จ ระบบลบรูปเก่าที่ไม่มีเมนูอื่นใช้งาน ส่วนการยกเลิกฟอร์มหรือบันทึกไม่ผ่านจะไม่เปลี่ยนรูปเดิม

**สำรองและย้ายทั้งฐานข้อมูลกับโฟลเดอร์รูป** ZIP และ SQL export ไม่รวมไฟล์รูปที่อัปโหลด เมื่ออัปเดตเว็บให้เก็บ storage เดิมไว้ และคัดลอกโฟลเดอร์นี้แยกเมื่อย้ายเครื่อง/โฮสต์ โหมด static demo ในเบราว์เซอร์ยังไม่รองรับการอัปโหลดรูป

## QR รับโอนเงินและการจัดการรายการ

เจ้าของร้านตั้งค่า QR ของบัญชีร้านใน **จัดการร้าน → QR รับชำระเงิน** แยกตามสาขา รูป QR เก็บเป็น PNG ในพื้นที่รูปเดียวกับเมนู เมื่อรับชำระด้วย QR แคชเชียร์ต้องตรวจสอบเงินเข้าบัญชีและติ๊กยืนยัน ระบบเก็บชื่อผู้ยืนยัน เวลา และข้อมูลบัญชี ไม่มีการเช็กสลิปหรือยอดโอนอัตโนมัติ และการคืนเงินยังไม่โอนเงินคืนให้ลูกค้า

เพิ่ม/ลบเมนูได้ใน **เมนูอาหาร** และเพิ่ม/ลบโต๊ะได้ใน **ตั้งค่าร้าน → จัดการโต๊ะ** การลบเก็บข้อมูลเก่าไว้เพื่อแสดงประวัติบิล และป้องกันการลบรายการที่ยังใช้งานอยู่ ป้ายขายดีคำนวณ 5 อันดับจากจำนวนขายในบิลชำระแล้วของร้านย้อนหลัง 30 วัน ไม่รวมบิลคืนเงิน เมื่อติดตั้งใหม่ด้วยข้อมูล demo อันดับจะสะท้อนบิลตัวอย่างที่ยังอยู่ในช่วงนั้นด้วย ควรเตรียมฐานข้อมูลของร้านจริงก่อนเปิดใช้งาน
