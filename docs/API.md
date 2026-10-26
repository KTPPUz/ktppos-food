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

`type`: `dinein`, `takeaway`, `delivery`; `method`: `cash`, `qr`, `card` ทั้งหมดเป็นจำลอง

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
