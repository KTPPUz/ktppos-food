# ติดตั้ง restaurant.itfeature.tech บน Hostinger

แพ็กเกจนี้ใช้ PHP 8.3 + MySQL/MariaDB บน Web Hosting ไม่ต้องมี VPS หรือ Node.js บนโฮสต์

## ไฟล์ติดตั้ง

- `.artifacts/hostinger.zip`: โปรแกรม Laravel พร้อม production vendor, React, ฟอนต์ใบเสร็จ 80 มม.
- `HOSTINGER.env.example`: ค่าตัวอย่างสำหรับโดเมนจริง ไม่มีรหัสผ่านหรือ APP_KEY
- `RELEASE.json`: เวลาสร้าง revision ของ Git และ SHA-256 ของ assets; รวมไฟล์ที่แก้ไขแต่ยังไม่ commit ณ เวลาสร้างด้วย
- ฐานข้อมูลจริง, `.env`, APP_KEY และรูปที่อัปโหลด **ไม่อยู่ใน ZIP**

## 1. ตั้งค่าใน hPanel

1. เพิ่มเว็บไซต์/ซับโดเมน `restaurant.itfeature.tech` ให้ชี้ไปยัง Web Hosting และเปิด SSL / Force HTTPS
2. เลือก PHP 8.3 และเปิด `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`, `gd` (WebP), `dom`, `xml`, `ctype`, `tokenizer`, `curl`; แนะนำ `exif` สำหรับหมุนรูปจากมือถือ
3. ตั้ง upload_max_filesize=6M และ post_max_size=8M; ใน ZIP มี `.user.ini` แล้ว
4. สร้างฐานข้อมูลและผู้ใช้ใน hPanel บันทึกชื่อ DB/ผู้ใช้ที่มี prefix ตามจริง และ DB host ที่ hPanel ระบุ
5. ตรวจ Document Root ของซับโดเมนจาก hPanel ก่อนแตกไฟล์ อย่าทับเว็บ `itfeature.tech` ที่มีอยู่

## 2. วางไฟล์

```text
โฟลเดอร์เฉพาะของ restaurant.itfeature.tech/
├── laravel/             # อยู่นอกพื้นที่ public ของซับโดเมน
│   ├── vendor/
│   ├── storage/
│   └── .env             # สร้างเองจาก HOSTINGER.env.example
└── public_html/         # ใช้เนื้อหานี้วางใน Document Root ของซับโดเมน
    ├── index.php
    ├── index.html
    ├── .htaccess
    ├── .user.ini
    └── assets/
```

`index.php` โหลด Laravel จาก `../laravel` ถ้า Document Root จริงเป็นโฟลเดอร์อื่น ให้จัด `laravel` เป็นโฟลเดอร์ข้างเคียงให้สัมพันธ์แบบเดียวกัน หรือแก้ 3 paths ใน index.php ให้ตรง ห้ามนำ laravel ทั้งโฟลเดอร์ไว้ใน Document Root

หาก hPanel กำหนด Document Root เป็น `domains/itfeature.tech/public_html/restaurant` ให้เก็บแอปที่ `domains/itfeature.tech/laravel-restaurant` ซึ่งอยู่นอก public_html ของโดเมนหลัก และแก้ paths ใน index.php จาก `../laravel/storage`, `../laravel/vendor`, `../laravel/bootstrap` เป็น `../../laravel-restaurant/storage`, `../../laravel-restaurant/vendor`, `../../laravel-restaurant/bootstrap` ตามลำดับ **อย่าวาง laravel ใน public_html ของโดเมนหลัก** แม้จะอยู่นอกโฟลเดอร์ซับโดเมนก็ตาม

คัดลอก `HOSTINGER.env.example` เป็น `laravel/.env` แล้วกรอก DB_DATABASE, DB_USERNAME, DB_PASSWORD และ DB_HOST จาก hPanel

## 3. เลือกวิธีเริ่มฐานข้อมูล

### ย้ายข้อมูลร้านเดิม (แนะนำหากต้องการเก็บบิล/สาขา/รูปเดิม)

สำรองฐานข้อมูลด้วย phpMyAdmin หรือ `php artisan pos:export-sql /private/path/pos-food.sql` บนเครื่องเดิม เก็บ SQL นอก public directory นำเข้า SQL ผ่าน phpMyAdmin บน Hostinger ไปยังฐานข้อมูลว่าง จากนั้น:

- ตั้ง `APP_KEY` ใน .env บน Hostinger ให้เป็น **ค่าเดิม** ของระบบต้นทาง เพื่ออ่านข้อมูล QR ที่เข้ารหัสได้
- คัดลอกไฟล์รูปใน `backend/storage/app/menu-images/` ไป `laravel/storage/app/menu-images/` แยกจาก ZIP
- หากใช้ SSH ให้รัน `php artisan migrate --force` เพื่อเพิ่ม migrations ที่ยังขาด โดยไม่ลบข้อมูล
- ไม่ต้องรัน `key:generate`, `pos:seed` หรือ `pos:import` ซ้ำหลัง restore SQL
- หากไม่มี SSH ให้ migrate ฐานข้อมูลต้นทางจนล่าสุดก่อน export SQL แล้วจึงนำเข้าทั้ง schema/data

การอัปโหลดโค้ดอย่างเดียวจะยังไม่มีฐานข้อมูลร้าน หากต้องการเริ่มใหม่ต้อง initialize ข้อมูลก่อน หน้า `/healthz` จะตอบ `uninitialized` จนกว่าจะตั้งค่าฐานข้อมูลเสร็จ `pos:seed` มีไว้ทดลองและใช้ PIN เริ่มต้น ไม่ควรใช้บัญชี demo เปิดรับลูกค้าจริง

### นำเข้า JSON ผ่าน SSH

ใช้ฐานข้อมูลว่าง รัน `php artisan key:generate --force`, `php artisan migrate --force`, แล้ว `php artisan pos:import /private/path/export.json` คำสั่งนี้ปฏิเสธการทับฐานข้อมูลเดิม ห้ามรันร่วมกับ restore SQL

## 4. เปิดใช้

- ให้ PHP เขียน `laravel/storage` และ `laravel/bootstrap/cache` ได้; ไม่ใช้ chmod 777
- ถ้ามี SSH รันใน laravel: `php artisan config:cache` และ `php artisan route:cache`
- หากไม่มี SSH ไม่ต้อง cache ระบบทำงานจาก .env ได้ และแพ็กเกจไม่มี cache จากเครื่องพัฒนา
- ทดสอบ https://restaurant.itfeature.tech/healthz ต้องได้ HTTP 200 และ `{"status":"ok"}`
- เข้าระบบด้วยบัญชีร้าน ตรวจสาขา รายงาน รูปอาหาร QR รับชำระ และฟอนต์ใบเสร็จ
- QR ที่พิมพ์ใหม่ต้องเริ่มด้วย `https://restaurant.itfeature.tech` ลิงก์เก่าที่เป็น localhost/IP เครื่องเดิมต้องพิมพ์ใหม่
- ทดสอบหลายอุปกรณ์: ลูกค้าสแกน → สั่งอาหาร → ครัวอัปเดต → ชำระเงิน → ใบเสร็จ โดยใช้ออเดอร์ทดสอบที่แยกจากยอดใช้งานจริง

## อัปเดตและย้อนกลับ

ก่อนอัปเดตสำรอง DB, .env, APP_KEY และโฟลเดอร์รูป เก็บ ZIP เวอร์ชันก่อนหน้าไว้ **ห้ามทับหรือลบ .env และ storage เดิมเมื่อแตก ZIP รอบใหม่** อัปโหลดโค้ด/production vendor/assets แล้ว migrate และ rebuild config/route cache หลังตั้งค่าเสร็จ หากไม่มี SSH ต้องไม่เหลือ config.php/routes cache จากรุ่นก่อนใน bootstrap/cache

หากต้องย้อนกลับ ให้คืนโค้ดรุ่นก่อนพร้อมฐานข้อมูลที่เข้าคู่กันเมื่อ migrations เปลี่ยนโครงสร้าง และคง APP_KEY เดิม; ห้ามใช้ migrate:fresh ในฐานข้อมูลร้าน

## ข้อมูลที่ยังต้องกรอก

ชื่อฐานข้อมูล / ผู้ใช้ / รหัสผ่าน / DB host จาก hPanel และ APP_KEY จากระบบต้นทาง ไม่ต้องส่งรหัสผ่านในแชต

อ้างอิง Hostinger: [SSH Access](https://www.hostinger.com/support/1583645-how-to-enable-ssh-access-in-hostinger/) และ [การโอนไฟล์และการเข้าถึงเซิร์ฟเวอร์](https://www.hostinger.com/support/which-file-transfer-and-server-access-options-are-supported-at-hostinger/) การมี SSH ขึ้นอยู่กับแพ็กเกจ; ZIP นี้รวม dependencies แล้ว และมีวิธีย้าย SQL ผ่าน phpMyAdmin
