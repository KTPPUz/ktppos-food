# โครงสร้างข้อมูลและแนวทางต่อยอด

รายละเอียดตาราง ฟิลด์ ความสัมพันธ์ constraints ลำดับ migrations และแผนย้าย JSON สำหรับสร้างฐานข้อมูลจริงอยู่ใน [DATABASE-SPEC.md](DATABASE-SPEC.md) เอกสารหน้านี้เป็นภาพรวมของข้อมูลใน Demo ปัจจุบัน

Demo ใช้ repository object เดียวจาก `server/seed.mjs` บันทึก JSON ด้วย atomic rename สำหรับ process เดียว ออกแบบ IDs และขอบเขต tenant/branch ไว้เพื่อย้าย storage ได้ ไม่ใช่ implementation MySQL

| Collection | Key / relationships | การใช้ใน Demo |
| --- | --- | --- |
| tenants | id, plan | ร้านอิสระ Small/Medium/Enterprise |
| branches | id, tenantId | สาขาและเป้าหมายยอดขาย |
| users | id, tenantId, branchId, role | 8 บัญชี/ร้าน; session เชื่อม userId |
| menu | id, category, modifiers | catalog ตั้งต้น 30 รายการ |
| menuCustom | tenantId → menuId | name/price/category/available/modifiers และ overrides ต่อ branch |
| tables | id, tenantId, branchId | จำนวนที่นั่งและ reservation วันนี้ |
| orders | id, tenantId, branchId, tableId, createdBy | status, type, items, snapshot rates, discount, receipt/payment/refund |
| order.items | id, menuId | snapshot ชื่อ ราคา ตัวเลือก จำนวน หมายเหตุ |
| ingredients | id, tenantId, branchId | stock, minimum และ unit |
| recipes | menuId, parts[index,qty] | สูตรตัวอย่างใช้รายการวัตถุดิบชุดเดียวกันในแต่ละสาขา |
| movements | ingredientId, branchId, tenantId, userId | delta รับเข้า/ตัดขาย/คืน/โอน พร้อมเหตุผลเวลา |
| transfers | tenantId, fromBranchId, toBranchId | pending → approved พร้อมผู้ขอและผู้อนุมัติ |
| shifts | branchId, tenantId | open, openingCash, openedAt/closedAt |
| audit | tenantId, branchId | user, role, action, detail, at |
| settings | tenantId | taxRate, serviceRate |

Entity ที่ฝังอยู่ใน Demo ได้แก่ order_items, payments, receipts, reservations, modifiers, roles และ permissions โดย roles/permissions กำหนดผ่าน `server/domain.mjs` ไม่มี suppliers หรือคลังกลางแยกในรุ่นนี้

## เมื่อย้ายไป relational database

แยกตาราง `order_items`, `payments`, `receipts`, `refunds`, `modifiers`, `menu_overrides`, `reservations`, `roles`, `permissions`, `user_roles`, `recipes`, `recipe_items`, `stock_movements` และ `suppliers` ตามขอบเขตที่ต้องใช้จริง

ใช้ foreign key แบบ composite `(tenant_id, id)` และ `(tenant_id, branch_id)` เพื่อบังคับ tenant isolation จากฐานข้อมูลด้วย ไม่พึ่งแค่การกรองใน API เพิ่ม unique constraints ที่ receipt/order number ภายใน tenant และ idempotency key ของ payment

ย้าย payment, stock consumption, receipt และ audit ไป transaction เดียวกัน ใช้ row lock หรือ compare-and-swap บน status เพื่อป้องกัน double payment หลาย process การอนุมัติโอนต้อง lock ทั้งต้นทาง/ปลายทางและตรวจปริมาณใหม่ใน transaction

ใช้ `DECIMAL` หรือจำนวนเต็มหน่วยสตางค์แทน floating-point เพิ่ม integer precision/rounding tests ตามนโยบายภาษีที่เลือก และ snapshot category, modifier, unit, recipe revision และ branch pricing ต่อ order item เพื่อให้รายงานย้อนหลังไม่เปลี่ยนตาม catalog

เพิ่ม durable sessions/identity, password hashing, secrets, rate limiting และ WebSocket/event stream ตาม deployment จริง Demo นี้ไม่มีการรับรอง production และไม่เชื่อมระบบภายนอก

## QR service rounds

เพิ่ม `tableSessions`: id/token, tenantId, branchId, tableId, orderIds, acceptingOrders, status, expiry, submissions (request key/hash/result) และ closedOrders snapshot

ออเดอร์เพิ่ม `serviceSessionId`, `source` และ `kitchenBatches` (id, round, source, status, itemIds, createdAt) รายการอาหารมี batchId/status เพื่อแยกคิวแต่ละรอบ รายการจากหลายมือถือรวมอยู่ในบิลเดิม

เมื่อย้ายไปฐานข้อมูล ต้องกำหนด unique active service round ต่อโต๊ะ และ unique (service_session_id, request_id) พร้อม transaction ที่สร้าง submission, order items, batch และ audit ในครั้งเดียว
