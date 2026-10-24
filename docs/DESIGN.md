# UI / UX prototype

ต้นแบบเป็น React components และ CSS ที่ใช้งานได้จริง ใช้เป็นไฟล์ออกแบบเทียบเท่า prototype ตาม scope ได้ โดยไม่มีไฟล์ Figma แยก

## Sitemap

```text
Demo login — เลือก Small / Medium / Enterprise + บทบาท + PIN
└─ Workspace
   ├─ ภาพรวมร้าน — KPI, ยอดขาย 7 วัน, เมนูขายดี, ใบเสร็จ
   ├─ ขายหน้าร้าน — ค้นหา/หมวด/เมนู → ตัวเลือก → ตะกร้า → checkout
   ├─ จัดการโต๊ะ [Medium+] — ผัง 15 โต๊ะ, จอง, เปิด/ย้าย/แยก/รวมบิล
   ├─ หน้าจอครัว [Medium+] — รอทำ / กำลังทำ / พร้อมเสิร์ฟ
   ├─ เมนูอาหาร — ชื่อ, หมวด, ราคา, ตัวเลือก, หมด/พร้อมขาย
   ├─ คลังวัตถุดิบ [Medium+] — ยอดคงเหลือ, ขั้นต่ำ, รับเข้า/ปรับยอด
   ├─ รายงาน — วันนี้ / 30 วัน [Medium+], CSV, ใบเสร็จ, คืนเงิน
   ├─ ทีมงาน & สิทธิ์ — 8 บัญชีต่อร้าน, แก้บทบาทตามสิทธิ์
   ├─ สำนักงานใหญ่ [Enterprise] — เปรียบเทียบสาขา, โอนและอนุมัติ
   ├─ ประวัติ — ผู้ดำเนินการ เวลา เหตุผล
   └─ ตั้งค่าร้าน — VAT / service, เปิด/ปิดกะ
```

## Flows

ขายรวดเร็ว: ประเภท → เมนู → ตัวเลือก/หมายเหตุ → ตรวจยอด/ส่วนลด → payment modal → เงินสด/QR/บัตรจำลอง → receipt → รายงาน

บริการโต๊ะ: เลือกโต๊ะ → รับรายการ → ส่งครัว → เริ่มทำ → พร้อมเสิร์ฟ → เสิร์ฟ → เปิดบิล → แยก/รวม/ย้ายถ้าต้องการ → ชำระ → โต๊ะว่าง

คืนเงิน: รายงาน → ใบเสร็จ → ตรวจบทบาท Manager+ → เหตุผล → ยืนยัน → รายงานลดลง + audit + Enterprise คืน stock

สำนักงานใหญ่: Login Enterprise Owner/HQ → เลือกสาขา → ดูยอดรวมและเปรียบเทียบ → โอนวัตถุดิบ → อนุมัติ → สต๊อกสองสาขาเปลี่ยน

## Design system

ทิศทาง: บรรยากาศร้านอาหารร่วมสมัย โปร่งและอบอุ่น ใช้สี coral สำหรับ action หลัก และสี sage สำหรับสถานะงาน

| Token | ค่า / การใช้ |
| --- | --- |
| Primary | `#ea694e` — ส่งครัว/ชำระ/ยืนยัน |
| Canvas | `#f8f9f7` — พื้นหลังทำงาน |
| Surface | `#ffffff` — sidebar, บัตรเมนู, cart, modal |
| Ink | `#29312e` — ข้อความ |
| Border | `#e9ece6` — แบ่งโครงสร้าง |
| Typography | DM Sans + Noto Sans Thai พร้อม sans-serif fallback |
| Radius | 6–10px ใน control/card, 14px ใน modal |
| Spacing | 4/8/12/16/24/32px |

Components: sidebar nav, branch switch, plan badge, demo banner, search, category tile, menu card, quantity stepper, modifier radio group, order panel, table card, kitchen ticket, summary stat, chart, data table, toggle, modal, receipt, form, toast, error, empty และ loading

## Responsive และสถานะ

- Desktop: sidebar + เมนู 3–4 คอลัมน์ + cart sticky ด้านขวา
- Tablet: sidebar ย่อ, เมนู 2 คอลัมน์ + cart; หน้าเนื้อหาปรับ grid
- Mobile: navigation แบบเปิด/ปิด เมนู 2 คอลัมน์ และ cart ด้านล่าง ตารางเลื่อนในกรอบได้
- Loading: หน้ารอโหลดเริ่มต้นและปิดปุ่มระหว่าง mutation
- Empty: ตะกร้า, ผลค้นหา, คิวครัว, รายการโอน และ audit ที่ไม่มีข้อมูล
- Error: validation จาก API ใน modal หรือ banner พร้อมข้อความภาษาไทย
- Focus: outline ชัดเจน, label/aria-label, native input/select, dialog role
- Receipt: print CSS แสดงเฉพาะใบเสร็จเมื่อสั่งพิมพ์

Main UI มี 12 หน้าภายใน workspace และหน้าเข้าสู่ระบบ ฟีเจอร์ที่เห็นขึ้นกับ role/plan; API ตรวจซ้ำอย่างอิสระจาก UI

## ภาพหน้าจอจาก Chrome

[Desktop](screenshots/pos-desktop.png) · [Mobile](screenshots/pos-mobile.png)

## QR สั่งอาหาร

เพิ่มหน้า QR สั่งอาหารใน Workspace สำหรับ Medium+ รวมเป็น 12 หน้า พนักงานเปิดรอบโต๊ะ แสดง QR จริง พิมพ์/ดาวน์โหลด หรือเปิดลิงก์ลูกค้าได้

หน้าลูกค้า `/order/:token` ใช้เมนูสำหรับมือถือ ค้นหา/หมวด ตัวเลือก/หมายเหตุ ตะกร้าแบบ bottom sheet ยืนยันส่งครัว สถานะออเดอร์ร่วมกันของโต๊ะ และหน้ารอบบริการที่ปิดแล้ว แยกจากหน้าพนักงาน
