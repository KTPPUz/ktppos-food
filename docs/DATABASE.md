# PostgreSQL + Prisma

ระบบรองรับ PostgreSQL ผ่าน Prisma ORM 6.19.x โดยคง React / Express และ API เดิมไว้ หากมี `DATABASE_URL` ระบบเลือก PostgreSQL อัตโนมัติ หรือกำหนด `STORAGE_DRIVER=postgres` อย่างชัดเจน ถ้าไม่ได้ตั้งทั้งสองค่า จะใช้ JSON demo ตามเดิม ฐานข้อมูลที่เชื่อมต่อไม่ได้หรือยังไม่ migrate จะทำให้เซิร์ฟเวอร์หยุดเริ่มทำงาน ไม่มีการ fallback ไปเขียน JSON

## เริ่มในเครื่อง

ต้องมี Node.js 22 และ Docker Desktop ที่เปิดอยู่

1. `npm ci`
2. สร้าง `.env` จากตัวอย่างด้านล่าง เปลี่ยนรหัสผ่านทั้งสองจุดให้ตรงกัน (หากมี `.env` เดิมให้เพิ่มเฉพาะค่าที่ต้องใช้)
3. `docker compose up -d --wait postgres`
4. `npm run db:generate`
5. `npm run db:migrate`
6. เลือก **อย่างใดอย่างหนึ่ง**: `npm run db:import -- .data/demo.json` เพื่อนำเข้าข้อมูลเดิม หรือ `npm run db:seed` เพื่อสร้างข้อมูล demo ใหม่
7. `npm run dev` แล้วตรวจว่า Terminal แสดง `Storage → postgres`

```dotenv
STORAGE_DRIVER=postgres
POSTGRES_PASSWORD=replace_with_local_password
POSTGRES_PORT=55432
DATABASE_URL=postgresql://pos_food:replace_with_local_password@127.0.0.1:55432/pos_food?schema=public
```

ถ้ารหัสผ่านมีอักขระพิเศษ ต้อง percent-encode เฉพาะรหัสผ่านใน `DATABASE_URL` เก็บ `.env` ไว้เฉพาะเครื่อง ห้ามใส่ URL ฐานข้อมูลในตัวแปร `VITE_*` ซึ่งถูกเผยแพร่ไปยัง browser

คำสั่ง import ไม่แก้ไฟล์ต้นฉบับและทำทั้งหมดใน transaction เดียว ระบบปฏิเสธ seed/import เมื่อฐานข้อมูลมีข้อมูลอยู่แล้ว รวมถึงกรณีเรียกสองคำสั่งพร้อมกัน ควรหยุดรับออเดอร์ในเซิร์ฟเวอร์ JSON เดิมก่อนนำเข้าจริง เพื่อไม่ให้มีรายการใหม่ตกหล่นระหว่างย้าย

## การเก็บข้อมูลและ transaction

Schema อยู่ใน `prisma/schema.prisma` และ migration ที่ตรวจเข้า Git อยู่ใน `prisma/migrations/` แยกตารางร้าน สาขา พนักงาน เมนู ราคาเฉพาะร้าน โต๊ะ บิล รายการอาหาร รอบครัว รอบ QR รหัสคำขอ สต็อก สูตรอาหาร การเคลื่อนไหว โอนสินค้า กะ ตั้งค่า และ audit โดยมี foreign keys สำหรับความสัมพันธ์หลัก และ unique constraints สำหรับเลขบิล, QR token และ `(sessionId, key)` ของคำขอสั่งอาหาร

เป็น schema แบบผสม: คอลัมน์ที่ใช้ระบุความสัมพันธ์/ค้นหา/กำหนด constraint แยกเป็นคอลัมน์จริง ส่วนรายละเอียดของ domain เช่น modifiers, ส่วนลด, payment snapshot และประวัติ QR เก็บเป็น JSONB ต่อแถว รายการอาหาร รอบครัว และคำขอ QR แยกเป็น child rows ไม่เก็บทุกอย่างเป็น snapshot ก้อนเดียว

แต่ละคำขอ API อ่านสถานะล่าสุดจาก PostgreSQL ใน transaction ภายใต้ advisory lock กลาง แล้วรัน domain เดิมและบันทึกเฉพาะแถวที่เปลี่ยน การตอบสำเร็จจะเกิดหลัง commit เท่านั้น ถ้าฐานข้อมูลล้มเหลวจะตอบ 503; ถ้า API ปฏิเสธคำขอ จะไม่บันทึกการเปลี่ยนแปลงระหว่างทาง ทั้งการชำระ สต็อก audit และ idempotency ของ QR จึงอยู่ในขอบเขต transaction เดียวกัน

Session พนักงานในโหมด PostgreSQL เก็บ hash ของ bearer token ใน `AuthSession` อายุ 12 ชั่วโมง ใช้ข้าม process/restart ได้ และ logout ลบสิทธิ์จากฐานข้อมูล รหัส QR ยังเป็น capability token ที่ต้องอ่านกลับเพื่อแสดงให้พนักงาน จึงเก็บในตารางรอบ QR ตามเดิม

**ข้อจำกัดของระยะนี้:** ทุกคำขอ API โหลดข้อมูลทั้งชุดและใช้ล็อกกลางเดียวกัน จึงประมวลผลทีละคำขอต่อฐานข้อมูล แม้มีหลาย process เหมาะกับการย้ายจาก demo และตรวจความถูกต้องก่อนขยายระบบ ยังไม่เหมาะกับการรับโหลดหลายสาขาปริมาณมาก ระยะถัดไปควรย้าย domain ไปใช้ query ตามร้าน/สาขา และล็อกเฉพาะบิล/โต๊ะ/สต็อกที่เกี่ยวข้อง คอลัมน์ตัวเลขบางส่วนเป็น projection ของ JSONB ต้องแก้ข้อมูลผ่าน repository เพื่อให้สอดคล้องกัน

ระบบยืนยันตัวตนยังเป็น PIN demo และการชำระเงินยังจำลอง การเพิ่ม PostgreSQL ไม่ได้เปลี่ยนสองส่วนนี้ให้เป็นระบบ production

## ข้อมูลถาวรและ backup

Docker Compose เก็บข้อมูลใน named volume `pos_food_postgres`; `docker compose down` ไม่ลบข้อมูล อย่าใช้ `down -v` เมื่อต้องการเก็บข้อมูล ตรวจชื่อ volume จริงด้วย `docker volume ls` เพราะ Compose เติมชื่อโปรเจกต์ด้านหน้า

```sh
docker compose exec -T postgres pg_dump -U pos_food -d pos_food -Fc > backup.dump
```

สำหรับ server จริง ใช้ PostgreSQL ที่มี backup และทดสอบ restore แล้ว ตั้ง `DATABASE_URL` ผ่าน secret ของ host, รัน `npm run db:generate` ตอน build และ `npm run db:migrate` ก่อนเริ่มแอป ไม่ต้องใช้ persistent disk สำหรับไฟล์ JSON อีกต่อไป นำเข้าข้อมูลเดิมแยกครั้งเดียวก่อนสลับทราฟฟิก อย่ารัน seed ทุกครั้งที่ deploy

## ตรวจสอบ

```sh
npm test
npm run build
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE npm run test:db
```

ชุดทดสอบ PostgreSQL สร้าง schema ชั่วคราวแบบสุ่ม ใช้ migration จริง แล้วลบเฉพาะ schema นั้น ไม่ truncate ข้อมูลเดิม บัญชีทดสอบต้องสร้าง/ลบ schema ได้ ครอบคลุม round-trip import, ป้องกัน import ซ้ำ, สั่ง QR พร้อมกันจากสอง app/DB clients, idempotency, rollback, ไม่ตอบสำเร็จก่อน commit, session ข้าม restart, logout และปิดรอบหลังชำระเงิน หากไม่ตั้ง `TEST_DATABASE_URL` ชุดนี้จะถูก skip
