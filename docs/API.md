> API นี้ให้บริการด้วย Laravel/PHP แล้ว โดยคงรูปแบบ response และเส้นทางเดิม ดู [คู่มือ Hostinger/MariaDB](HOSTINGER.md) สำหรับการติดตั้ง

# REST API — Demo v1

Base URL: `http://localhost:5173/api` JSON ทั้งหมด ใช้ `Authorization: Bearer <token>` ทุก endpoint ยกเว้น `/demo`, `/auth/login` และ `/guest/:token` ซึ่งใช้ token รอบโต๊ะจาก QR ข้อผิดพลาดส่ง `{ "error": "ข้อความภาษาไทย" }`

| Method | Endpoint | หน้าที่ / สิทธิ์ |
| --- | --- | --- |
| GET | `/demo` | รายการร้านและบัญชีตัวอย่าง ไม่คืน PIN |
| POST | `/auth/login` | `{userId, pin}` → `{token, user}` |
| POST | `/auth/logout` | ยกเลิก session ปัจจุบัน |
| GET | `/state` | snapshot ที่กรอง tenant, branch, role และ package |
| GET | `/menu-items` | catalog พร้อม tenant customizations |
| PATCH | `/menu-items/:id` | Owner/Manager/HQ; `{name?, price?, category?, modifiers?, available?, branchId?}`; branch override ต้อง Enterprise |
| GET | `/branches` | สาขาที่มีสิทธิ์เข้าถึง |
| POST | `/orders` | รับออเดอร์ `{branchId,type,tableId?,items}`; ต้องมีกะเปิด |
| POST | `/orders/:id/items` | เพิ่ม `{items}` ในบิลที่ยังไม่ปิด |
| POST | `/orders/:id/items/:itemId/cancel` | Manager+; `{reason}` เก็บ cancelledItems และ audit |
| POST | `/orders/:id/discount` | Manager+; `{amount}` ส่วนลดบาท |
| PATCH | `/orders/:id/status` | `{status,reason?}` ตรวจลำดับสถานะและสิทธิ์ |
| POST | `/orders/:id/payments` | Cashier/Manager/Owner/HQ; `{method,received?}` |
| POST | `/orders/:id/refund` | Manager+; `{reason}` คืนเงินจำลองทั้งบิล |
| POST | `/orders/:id/split` | Medium+ ฝ่ายหน้าร้าน; `{selected:{[itemId]:qty}}` |
| POST | `/orders/:id/merge` | Medium+ ฝ่ายหน้าร้าน; `{targetId}` |
| POST | `/orders/:id/move` | Medium+ ฝ่ายหน้าร้าน; `{tableId}` |
| PATCH | `/tables/:id/reservation` | Medium+; `{reservation:{name,time}}` หรือ `{reservation:null}` |
| POST | `/inventory/adjust` | Manager+ / Medium+; `{ingredientId,qty,reason}` |
| GET | `/inventory/movements` | Manager+; ประวัติรับเข้า/ขาย/คืน/โอน ที่กรองสิทธิ์ |
| POST | `/transfers` | Owner/HQ / Enterprise; `{fromBranchId,toBranchId,ingredientId,qty}` |
| POST | `/transfers/:id/approve` | Owner/HQ / Enterprise; อนุมัติครั้งเดียว |
| POST | `/users` | Owner; เพิ่ม `{name,email,role,branchId,pin}` เฉพาะร้านตนเอง |
| PATCH | `/users/:id` | Owner; แก้ไขชื่อ อีเมล บทบาท สาขา หรือ PIN เฉพาะร้านตนเอง เปลี่ยนตนเองไม่ได้ |
| DELETE | `/users/:id` | Owner; ลบทีมงานในร้านตนเอง ลบตนเองไม่ได้ และเก็บประวัติการทำรายการเดิม |
| PATCH | `/settings` | Owner/HQ; `{taxRate,serviceRate}` ทั้งคู่ 0–30 |
| POST | `/shifts` | ผู้มีสิทธิ์รายงาน; `{branchId,open}` ปิดเมื่อไม่มีบิลค้าง |
| GET | `/reports/sales?branchId=...` | ผู้มีสิทธิ์รายงาน; `{orders,total,refund}` กรอง tenant/branch |

## ตัวอย่าง

Login: `POST /auth/login`

```json
{"userId":"restaurant-u0","pin":"1234"}
```

สร้างบิล: `POST /orders`

```json
{
  "branchId": "r1",
  "type": "dinein",
  "tableId": "r1-t10",
  "items": [{
    "menuId": "m1", "qty": 1,
    "modifiers": [{"group": "protein", "name": "เพิ่มไข่ดาว"}],
    "note": "ไม่ใส่ใบกะเพรา"
  }]
}
```

ราคาคำนวณใหม่ที่ API = 129 + 15 = 144 บาท ไม่รับ unitPrice จาก client

`type`: `dinein`, `takeaway`, `delivery`; `method`: `cash`, `qr`, `card` — QR รับโอนแบบพนักงานยืนยันเองต้องส่ง `verified:true` และ `qrVersion` ส่วนบัตรยังเป็นการจำลอง

`POST /orders/:id/payments` ตัวอย่าง: `{"method":"cash","received":200}` → ยอดรวม 154.08 บาท (VAT 7%, service 0%) เงินทอน 45.92 บาท คืน order พร้อม `receipt`, `payment`, `totals`, `paidAt`

## State machine และ error codes

```text
draft → pending → cooking → ready → served
      ส่งครัว      ครัว        ครัว       หน้าร้าน

บิลเปิดทุกสถานะ → paid → refunded
บิลเปิดทุกสถานะ → cancelled
บิลต้นทางที่รวม → merged
```

Small ชำระ draft ได้โดยตรง ไม่ผ่าน KDS เมื่อเพิ่มรายการหลัง ready/served หรือยกเลิกรายการที่ส่งครัว บิลจะกลับ pending

- `400`: validation เช่น สินค้าหมด จำนวน/ตัวเลือกไม่ถูกต้อง เงินสดไม่พอ หรือเหตุผลว่าง
- `401`: ไม่มี session หรือ session หมดหลัง restart
- `403`: ไม่มีสิทธิ์บทบาท/แพ็กเกจ/สาขา
- `404`: ไม่พบข้อมูล หรือ object นั้นอยู่นอก tenant/branch ที่มองเห็น
- `409`: ขัดแย้งกับสถานะปัจจุบัน เช่น บิลปิดแล้ว โต๊ะไม่ว่าง จ่าย/คืน/อนุมัติซ้ำ หรือ stock ไม่พอ

`totals` ประกอบด้วย `subtotal,discount,service,tax,total` บิลแยก/รวมอาจมี `roundingAdjustment` เก็บความต่างของการปัดเศษในยอดสุทธิ

ตัวอย่าง tenant IDs: `cafe`, `restaurant`, `brand`; branch IDs: `c1`, `r1`, `b1`, `b2`, `b3`; user ID ลงท้าย `u0` Owner, `u1` Manager, `u2` Cashier, `u3` Waiter, `u4` Kitchen, `u5` HQ Admin, `u6` Cashier, `u7` Waiter

ข้อมูลนี้เป็นสัญญา API สำหรับ Demo เมื่อย้ายไป MySQL ให้คง permission/tenant guards และย้าย validation กับ payment/stock/transfer ไป transaction เดียวกัน

## QR Customer Ordering

ดู [API และวงจร QR สั่งอาหาร](QR-ORDERING.md) สำหรับ public guest endpoints ซึ่งใช้ token รอบโต๊ะแทน staff login, staff table-session endpoints, kitchen-batch status และ request idempotency

## Menu promotions

`PATCH /menu-items/:id` เพิ่ม `discount: {type: "none" | "percent" | "fixed", value: number}` โดย `none` ต้องมี value 0, percent อยู่ระหว่าง 0–100 และ fixed อยู่ระหว่าง 0–100000 ทศนิยมสูงสุดสองตำแหน่ง ใช้สิทธิ์จัดการเมนูและแยกตาม tenant

ตัวอย่าง: `{"discount":{"type":"percent","value":10}}` หรือ `{"discount":{"type":"fixed","value":20}}`

หักส่วนลดจาก base price หลัง branch override โดยไม่ลดราคา modifier ยอดลดสูงสุดเท่ากับราคาอาหาร จากนั้นจึงคำนวณส่วนลดบิล/service/VAT ตามปกติ Backend คำนวณใหม่เสมอและไม่รับ discount/price ที่ client ส่งมาใน order item

Order items เพิ่ม snapshot `originalUnitPrice` (รวมตัวเลือกเสริมก่อนลด) และ `menuDiscount` (ส่วนลดต่อหนึ่งจาน) ส่วน `unitPrice` เป็นราคาสุทธิหลังส่วนลดเมนู ยอด subtotal ใช้ unitPrice โดยไม่หัก menuDiscount ซ้ำ รายการเก่าที่ไม่มี field ใหม่ยังอ่านได้ตามปกติ

Guest catalog คืน `price` เป็นราคาหลังลด พร้อม `originalPrice`, `discountAmount` และ `discount` เพื่อแสดงราคาเดิม/ราคาใหม่ตรงกับราคา POS

## จัดการทีมงาน

หน้า **ทีมงาน & สิทธิ์** มีปุ่มเพิ่ม แก้ไข และลบสำหรับ Owner เท่านั้น บทบาทอื่นที่มีสิทธิ์ `staff` ดูรายชื่อได้ อีเมลต้องไม่ซ้ำภายในร้าน (ไม่แยกตัวพิมพ์ใหญ่/เล็ก) สาขาต้องอยู่ในร้านเดียวกัน และ PIN ต้องเป็นตัวเลข 4–8 หลัก สำหรับ PATCH ให้ละ `pin` เพื่อคงค่าเดิม API ไม่คืน PIN ใน response และไม่บันทึก PIN ลง audit

เมื่อเปลี่ยน PIN บทบาท หรือสาขา จะยกเลิก session เดิมทุกเครื่องของทีมงานคนนั้น การลบจะยกเลิก session และบัญชีเข้าสู่ระบบ แต่ยังเก็บบิลและ audit เดิมไว้ เจ้าของร้านแก้ไขหรือลบบัญชีที่กำลังใช้งานไม่ได้ มีการตรวจสิทธิ์ซ้ำที่ API ทั้งในโหมด JSON และ PostgreSQL

## แก้ไขข้อมูลโต๊ะ

`PATCH /tables/:id` ใช้สิทธิ์ `settings` (Owner/HQ Admin) และแพ็กเกจ Medium/Enterprise ส่ง `{name, seats}` หรือแก้ไขบางฟิลด์ได้ ชื่อโต๊ะหลัง trim ต้องยาว 1–50 ตัวอักษรและไม่ซ้ำในสาขาเดียวกัน จำนวนที่นั่งเป็นจำนวนเต็ม 1–50 ไม่อนุญาตให้เปลี่ยน id, tenantId หรือ branchId

หน้า **ตั้งค่าร้าน → จัดการโต๊ะ** แสดงโต๊ะตามสาขาที่เลือก การแก้ไขคงบิล การจอง และ QR เดิมไว้ และบันทึก audit ใน transaction เดียวกัน

## แนบรูปเมนูอาหาร

ส่ง `POST /api/menu-items/:id` แบบ multipart/form-data พร้อม `_method=PATCH`, `payload` เป็น JSON ของข้อมูลเมนู และ `image` เป็นไฟล์ JPG/PNG/WebP ไม่เกิน 5 MB ใช้สิทธิ์ `menu` เหมือนแก้ไขเมนูเดิม การแก้ข้อมูลโดยไม่แนบรูปยังใช้ JSON PATCH ตามเดิมได้

รูปจะถูกตรวจ MIME/ขนาด/มิติ แล้วแปลงเป็น WebP ก่อนเก็บชื่อสุ่ม รูปใหม่กับข้อมูลเมนูจะสำเร็จพร้อมกัน หากบันทึกข้อมูลล้มเหลวจะลบไฟล์ใหม่และคงรูปเดิม Catalog ส่ง image URL ของ API origin ปัจจุบันเพื่อใช้งานได้ทั้งเว็บและ QR บนมือถือ รูปเก็บใน overlay แยกตามร้าน ไม่เปลี่ยน catalog ของร้านอื่น

## บทบาทและสิทธิ์เมนู (Laravel)

เจ้าของร้านจัดการได้ที่ **ทีมงาน & สิทธิ์ → บทบาทและสิทธิ์** และนำบทบาทไปเลือกให้พนักงานที่แท็บ **ทีมงาน**

| Method | Endpoint | ข้อมูล / เงื่อนไข |
| --- | --- | --- |
| GET | `/roles` | Owner เท่านั้น; รายการบทบาทของร้าน พร้อมจำนวนสมาชิก |
| POST | `/roles` | Owner; `{name,menus:[menuId],scope:"branch"\|"tenant",refund:boolean}` |
| PATCH | `/roles/:id` | Owner; แก้ไขฟิลด์ข้างต้นได้บางส่วน คีย์บทบาทไม่เปลี่ยน |
| DELETE | `/roles/:id` | Owner; ลบได้เมื่อไม่มีพนักงานใช้งานอยู่ มิฉะนั้น 409 |

`/state` เพิ่ม `visibleMenus` สำหรับกรองเมนูด้านข้าง, `roles` และ `roleMenus` สำหรับเจ้าของร้าน; บัญชีพนักงานมี `roleName` เป็นชื่อแสดงผล ส่วน `role` เป็นคีย์บทบาทถาวร ใช้คีย์นี้เมื่อเพิ่มหรือแก้ไขพนักงานผ่าน `/users` บทบาทแยกกันในแต่ละร้านและไม่สามารถแก้ไขหรือลบบทบาท Owner ได้

การเลือกเมนูให้สิทธิ์ API ของเมนูนั้นด้วย: `dashboard/reports → reports`, `tables/qr → tables`, `payments → pay` และเมนูอื่นใช้ capability ชื่อเดียวกับ menu ID การซ่อนเมนูหนึ่งในคู่ที่ใช้ capability เดียวกันไม่ยกเลิกสิทธิ์ข้อมูลของอีกเมนูหนึ่ง `refund` ใช้สำหรับส่วนลด ยกเลิกรายการ และคืนเงิน การจัดการทีมงาน/บทบาทยังคงเป็น Owner เท่านั้นแม้จะให้ดูเมนูทีมงาน

สิทธิ์ API เปลี่ยนทันทีที่บันทึก ส่วนเมนูบนหน้าจอพนักงานเปลี่ยนตามรอบดึงข้อมูล 8 วินาที บทบาทที่ไม่มีเมนูจะแสดงข้อความให้ติดต่อเจ้าของร้าน สิทธิ์ตามแพ็กเกจ Small/Medium/Enterprise ยังคงบังคับใช้ และเมนู `hq` ต้องมี scope `tenant` การเปลี่ยน Role ของพนักงานหรือ PIN/สาขาจะยกเลิก session ของพนักงานคนนั้นตามเดิม

Migration `2026_10_26_000003_create_roles` สร้างบทบาทเริ่มต้น 6 แบบให้ร้านเดิมด้วยสิทธิ์เดิม การ import JSON เก่าที่ไม่มี `roles` จะสร้างบทบาทเริ่มต้นให้อัตโนมัติ

## จัดการสาขา (Laravel)

เมนู **จัดการร้าน → จัดการสาขา** ให้เจ้าของร้านเพิ่มหลายสาขาและแก้ไขชื่อ ที่อยู่ เบอร์โทร และเป้าหมายยอดขายรายวันได้ทุกแพ็กเกจ Owner เห็นเมนูนี้อัตโนมัติ บทบาทอื่นสามารถได้รับเมนู `branches` เพื่อดูรายชื่อสาขาตามขอบเขตข้อมูล แต่เพิ่ม/แก้ไข/ลบได้เฉพาะ Owner

| Method | Endpoint | ข้อมูล / เงื่อนไข |
| --- | --- | --- |
| GET | `/branches` | คงเดิม: รายการสาขาตาม tenant และ scope ของผู้ใช้ |
| POST | `/branches` | Owner ทุกแพ็กเกจ; `{name,address?,phone?,target?,tableCount?}` → 201 |
| PATCH | `/branches/:id` | Owner; `{name?,address?,phone?,target?}` เก็บรหัสเดิมและข้อมูลอ้างอิง |
| DELETE | `/branches/:id` | Owner; เฉพาะสาขาที่ยังไม่ใช้งานและไม่ใช่สาขาสุดท้าย มิฉะนั้น 409 |

ชื่อไม่ซ้ำภายในร้านและยาวไม่เกิน 100 ตัวอักษร, ที่อยู่ 500, เบอร์โทร 30, เป้าหมายรายวัน 0–100,000,000 บาท (ทศนิยม 2 ตำแหน่ง) สาขาใหม่เริ่มต้นด้วยกะปิด เงินทอน 0, โต๊ะ 4 ที่นั่งตาม `tableCount` (0–100, ค่าเริ่มต้น 15 สำหรับ Medium/Enterprise; Small ใช้ 0 และไม่เปิดการจัดการโต๊ะ) และรายการวัตถุดิบตามสาขาประจำเจ้าของร้านโดยสต๊อกเริ่มต้น 0 เมนูและสูตรอาหารใช้ร่วมกันภายในร้าน ต้องเปิดกะก่อนขาย และ Enterprise ต้องรับเข้าสต๊อกก่อนขาย

ไม่ลบสาขาที่มีทีมงาน ประวัติบิล/QR/สต๊อก/โอน/กิจกรรม กะที่เคยเปิด การจองโต๊ะ สต๊อกคงเหลือ หรือราคาเฉพาะสาขา โต๊ะ วัตถุดิบ และกะตั้งต้นที่ยังไม่ใช้งานจะลบพร้อมสาขาใน transaction เดียวกัน บันทึกกิจกรรมจัดการสาขาไว้ที่สาขาประจำของเจ้าของร้าน การแก้ไขชื่อส่งผลถึงตัวเลือกสาขา ตารางทีมงาน รายงาน และหน้าจออื่นโดยอ้างอิง ID เดิม

## เพิ่ม/ลบเมนู โต๊ะ และคำนวณขายดี

- `POST /menu-items` ใช้สิทธิ์ `menu`: `{name,en?,category,price,modifiers?,discount?,available?}` รองรับ multipart `payload` + `image` เช่นเดียวกับการแก้ไข รูปไม่บังคับ เมนูใหม่เป็นของร้านผู้สร้างเท่านั้น
- `DELETE /menu-items/:id` ใช้สิทธิ์ `menu`: ซ่อนเมนูจากหน้าขายและ QR เฉพาะร้านนั้น เก็บข้อมูลและรายการในบิลเดิมไว้ ถ้าเมนูยังอยู่ในบิลที่ไม่ปิดคืน 409
- `POST /tables` ใช้สิทธิ์ `settings` และ Medium ขึ้นไป: `{branchId,name,seats}` ชื่อไม่ซ้ำภายในสาขา (ไม่รวมโต๊ะที่ลบแล้ว), ที่นั่ง 1–50
- `DELETE /tables/:id` ใช้สิทธิ์เดียวกับเพิ่ม: ไม่ลบเมื่อมีบิลค้าง การจอง หรือ QR ที่ยังเปิดอยู่ (409) บันทึกเป็นโต๊ะที่เลิกใช้งาน ไม่ลบแถวที่ประวัติบิลอ้างอิง `/state.archivedTables` ให้ชื่อโต๊ะเดิมสำหรับแสดงประวัติ

`popular` ใน catalog และเมนู QR คำนวณจาก **จำนวนหน่วยที่ขายในบิลสถานะ paid ของร้านรวมทุกสาขา ย้อนหลัง 30 วันนับจากเวลาปัจจุบัน** ใช้ `paidAt` (fallback `createdAt`) ไม่รวมบิลคืนเงิน ยกเลิก หรือยังไม่ชำระ เลือก 5 เมนูที่มียอดมากที่สุดและมากกว่า 0 เท่ากันเรียงตาม menu ID เมนูที่ลบแล้วไม่ติดอันดับ `soldQuantity` เป็นจำนวนขายในช่วงเดียวกัน ไม่มีการใช้ popular ที่ตั้งไว้ใน seed มาตัดสินอีกต่อไป

## QR รับชำระเงินแบบยืนยันเอง

เมนู **จัดการร้าน → QR รับชำระเงิน** ตั้งค่าแยกตามสาขาที่เลือก รองรับทุกแพ็กเกจ แก้ไขได้เฉพาะ Owner โดยไม่ต้องเชื่อม Payment Gateway

- `PATCH /branches/:id/payment-qr`: `{bankName?,accountName?,accountNumber?,instructions?,enabled?}` หรือ multipart `payload` + `image` JPG/PNG/WebP ไม่เกิน 5 MB รูปจัดเก็บเป็น PNG เพื่อไม่สูญเสียรายละเอียด QR การเปิดใช้ต้องมีรูปและชื่อบัญชี
- `DELETE /branches/:id/payment-qr`: ลบการตั้งค่าและไฟล์ QR หลัง transaction สำเร็จ
- ข้อมูลอยู่ใน `/state.branches[].paymentQr` และ `GET /branches` พร้อม URL รูปและ `version` ใหม่ทุกครั้งที่แก้ไข ผู้มีสิทธิ์รับชำระเห็น QR ของสาขาในหน้ารับชำระ
- `POST /orders/:id/payments` เมื่อ `method:"qr"` ต้องส่ง `verified:true` และ `qrVersion` ตรงกับ version ปัจจุบันของสาขา สาขาต้องเปิดใช้ QR อยู่ หากยังไม่ตั้งค่า ปิดใช้ หรือ version เปลี่ยนคืน 409 หากไม่ยืนยันยอดคืน 400
- เมื่อยืนยัน บิลบันทึก `payment.verification:"manual"`, `verifiedBy`, `verifiedAt` และ snapshot ชื่อธนาคาร/บัญชี พร้อม audit ระบบไม่ตรวจสอบเงินเข้าหรือสลิปอัตโนมัติ พนักงานต้องตรวจบัญชีร้านก่อนกดยืนยัน การคืนเงินยังเป็นการบันทึกเท่านั้นและต้องคืนเงินจริงแยก

การอัปโหลด QR ตรวจรูปจริงและ normalize เช่นเดียวกับรูปเมนู ไม่ตรวจสอบว่ารูปเป็นบัญชีใด เจ้าของร้านต้องทดลองสแกนและตรวจชื่อบัญชีก่อนเปิดใช้ เก็บสำรอง QR พร้อม `storage/app/menu-images` และฐานข้อมูล การเปลี่ยนรูป/ลบจะจัดการไฟล์เมื่อ commit สำเร็จเท่านั้น บทบาทอื่นที่เปิดเมนู `paymentQr` ผ่าน Role ใช้ดูข้อมูลได้ แต่แก้ไขได้เฉพาะ Owner

## รายละเอียดประวัติการทำรายการ

หน้า **ประวัติการทำรายการ → ดูรายละเอียด** เปิดเป็นหน้าอ่านอย่างเดียว แสดงผู้ดำเนินการ สาขา เวลา และตารางข้อมูลก่อน–หลังของรายการใหม่

- `GET /audit/:id`: ต้องมีสิทธิ์ `audit` และเข้าถึงสาขาของประวัตินั้นได้ ข้ามร้าน/สาขาที่ไม่มีสิทธิ์คืน 404
- `/state.audit` ส่งรายการสรุปโดยไม่รวม `changes` ส่วนรายละเอียดดึงเมื่อกดปุ่ม เพื่อไม่ส่ง snapshot ทุกครั้งที่ poll
- ประวัติใหม่มี `changes:[{entity,id,label,type,fields:[{key,label,before,after,redacted}]}]` เก็บการเปลี่ยนแปลงพร้อมข้อมูลธุรกิจใน transaction เดียวกัน กรณีเพิ่ม/ลบแสดงค่าฝั่งที่มีข้อมูล ส่วนเมนูใช้ข้อมูลจริงหลังรวมราคากับค่าที่ร้านแก้ไข
- PIN ถูกปกปิดและไม่บันทึกค่า/แฮชลง snapshot; token, tokenHash และข้อมูลส่งซ้ำ QR ไม่ถูกเก็บในรายละเอียด
- ประวัติเดิมไม่มี `changes` จึงแสดงเฉพาะข้อมูลที่บันทึกไว้ ไม่มีการสร้างค่าเดิมย้อนหลัง การเปิดดูรายละเอียดไม่สร้างกิจกรรมใหม่
- รูปก่อนหน้าที่ถูกแทนที่/ลบไฟล์ไปแล้วอาจเปิดดูไม่ได้ แม้ยังมีข้อมูลเส้นทางรูปในประวัติ

## จัดการประเภทอาหาร

หน้า **ตั้งค่าร้าน → ประเภทอาหาร** เพิ่ม แก้ไข ลบ และจัดลำดับประเภทได้ด้วยสิทธิ์ `settings` รองรับทุกแพ็กเกจ ใช้ร่วมกันทุกสาขาภายในร้าน และแยกข้อมูลจากร้านอื่น

- `GET /categories`: รายการประเภทของร้านผู้ใช้ที่ล็อกอิน มี `all` เป็นรายการแรกเสมอ
- `POST /categories`: `{name,icon?,order?}` ชื่อยาว 1–80 ตัวอักษรและไม่ซ้ำภายในร้าน คืน `{id,name,icon}` กับ status 201
- `PATCH /categories/:id`: `{name?,icon?,order?}` คงรหัสเดิมเมื่อเปลี่ยนชื่อ `order` เป็นลำดับเริ่มจาก 1 ไม่รวมประเภททั้งหมด
- `DELETE /categories/:id`: ลบได้เมื่อไม่มีเมนูที่ยังใช้งานอ้างอิง และเหลืออย่างน้อย 1 ประเภทจริง ประเภท `all` แก้ไข/ลบไม่ได้ เมนูที่ปิดขายยังถือว่าอ้างอิงประเภทอยู่ ต้องย้ายประเภทก่อน

ไอคอนรองรับ `Grid2X2`, `Utensils`, `Soup`, `Pizza`, `Salad`, `Coffee`, `IceCreamBowl` ค่าเริ่มต้น `Utensils` ข้อมูลเก็บใน payload ของ `tenant_settings.categories` โดยไม่รวมรายการ `all` ร้านที่ยังไม่ตั้งค่าใช้รายการเริ่มต้นตามเดิม ไม่ต้องย้ายข้อมูลเมนูเก่า

`/state.categories`, `/guest/:token.categories` และการตรวจประเภทตอนเพิ่ม/แก้เมนูใช้รายการเดียวกัน ชื่อและลำดับจึงอัปเดตตามรอบดึงข้อมูลของหน้าขายและ QR ทุกสาขา การเปลี่ยนแปลงถูกเก็บในประวัติพร้อมข้อมูลก่อน–หลัง และการรีเฟรชหน้าตั้งค่าคงแท็บประเภทอาหารไว้

### รับเงินก่อนอาหารเสร็จ

บิลที่รับเงินแล้วคง `status: paid` สำหรับใบเสร็จและรายงาน และเก็บสถานะอาหารแยกใน `kitchenStatus` (`pending`, `cooking`, `ready`, `served`) การจ่ายจากบิล draft ใน Medium/Enterprise จะส่งอาหารเข้าคิวรอทำ ส่วน Small ไม่มีหน้าครัว จึงถือว่าให้บริการเสร็จเมื่อรับเงิน

หลังรับเงิน อัปเดตอาหารผ่าน `PATCH /orders/{id}/status` หรือ `PATCH /orders/{id}/kitchen-batches/{batchId}/status` ตามลำดับและสิทธิ์เดิมได้ ยอดบิล/ใบเสร็จ/เวลาชำระไม่เปลี่ยน และห้ามเพิ่มรายการ ลดราคา ย้าย/รวม/แยกบิล หรือชำระซ้ำ การปรับสถานะทั้งบิลที่มีหลายรอบจะเลื่อนเฉพาะรอบที่อยู่ในสถานะช้าที่สุด ไม่ย้อนสถานะรอบที่ทำไปแล้ว

โต๊ะและ QR ยังอยู่ในรอบบริการจนเสิร์ฟครบ ลูกค้าที่ชำระแล้วดูสถานะต่อได้ แต่สั่งเพิ่มไม่ได้ กะขายยังปิดไม่ได้หากเหลืองานเสิร์ฟ บิลเก่าที่เป็น paid และไม่มี `kitchenStatus` จะถือว่าเสิร์ฟแล้ว เพื่อไม่เปิดคิวเก่าย้อนหลัง การคืนเงินเต็มบิลยุติงานครัวและรอบบริการตาม flow เดิม
