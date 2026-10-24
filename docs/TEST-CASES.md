# Acceptance / Test cases

## Automated API

รัน `npm test` ชุดทดสอบใช้ data ใน memory และ HTTP server แยก ไม่เขียนข้อมูล Demo

| Case | สิ่งที่ยืนยัน |
| --- | --- |
| Authentication / Permission | ไม่มี session ได้ 401; Cashier ตั้งค่าไม่ได้; Kitchen สร้าง order ไม่ได้ |
| Happy path | Modifier + note → ส่งครัว → cooking → ready → served → เงินสด → รายงาน |
| Duplicate payment | ส่งคำขอ payment พร้อมกันสองครั้ง สำเร็จครั้งเดียว อีกครั้ง 409 และ audit หนึ่งรายการ |
| Validation | qty ติดลบ, modifier ปลอม, เงินสดน้อยกว่า total, เปลี่ยนสถานะข้ามขั้น ถูกปฏิเสธ |
| Waiter / Kitchen | Waiter ชำระไม่ได้ Kitchen รับออเดอร์ไม่ได้ |
| Tenant / Branch | อ้างอิง object ต่างร้านไม่ได้, พนักงานทั่วไปเห็นเฉพาะสาขา, ไม่คืน PIN |
| Package | Small เรียก KDS และ inventory ผ่าน API ไม่ได้ |
| Catalog | ราคาแก้เฉพาะ tenant; server ไม่เชื่อ unitPrice ที่ส่งมา; ของหมดสั่งไม่ได้ |
| Split | หักส่วนลดและปัดเศษแล้วยอดรวมสองบิลเท่าเดิม; จำนวนเกินถูกปฏิเสธ |
| Move / Merge | ย้ายเข้าโต๊ะที่ใช้งานไม่ได้; รวมแล้วรายการครบ |
| Cancel / Refund | ต้องมี role+reason; ปิดบิลแล้วจ่ายไม่ได้; คืนซ้ำไม่ได้; audit มีผู้ดำเนินการ/เวลา/เหตุผล |
| Recipes | Enterprise ขายแล้วลดวัตถุดิบ คืนเงินแล้ว stock คืนเท่าเดิม |
| Saved item cancellation | ยกเลิกรายการที่ส่งครัวแล้วมีผู้ดำเนินการ/เหตุผลและกลับเข้าคิว; รายการสุดท้ายต้องยกเลิกทั้งบิล |
| Modifier / Override | ตัวเลือกและราคาเฉพาะสาขาใช้จริงตอน checkout และไม่ข้าม tenant |
| Rate / Shift | Snapshot อัตราบริการ/ภาษี; ปิดกะเมื่อไม่มีบิลเปิด; ปิดแล้วสร้างบิลไม่ได้ |
| Transfers | ขอแล้วยังไม่ตัด stock; อนุมัติแล้วต้นทางลด/ปลายทางเพิ่ม; อนุมัติซ้ำไม่ได้ |

## Automated browser

รัน `npm run test:e2e` ใช้ Chrome จริงและข้อมูลแยกจาก Demo

1. เลือกโต๊ะ → เพิ่ม modifier/note → ส่งครัว → เปลี่ยนสถานะจนครบ → เปิดบิล → QR จำลอง → receipt → รายงาน → refund
2. เปิดครบ 12 หน้า Owner Enterprise ตรวจ desktop 1440px, tablet 1024px และ mobile 390px ไม่มี page overflow พร้อม screenshots
3. Kitchen เห็น KDS และไม่เห็น checkout / รายงาน
4. Small มี 30 เมนู ไม่มี table/KDS/inventory/HQ navigation

## Manual walkthrough

- เปลี่ยนประเภทออเดอร์ทั้งสามแบบ ค้นหาภาษาไทย/อังกฤษ กรองหมวดและยอดนิยม
- เพิ่ม/ลบรายการที่ยังไม่บันทึก และปรับจำนวน; บิลส่งครัวแล้วเลือกจัดการบิล → ยกเลิกรายการพร้อมเหตุผล ให้ครัวเห็น
- ทดสอบส่วนลดเกิน subtotal และการแก้ VAT/service สำหรับบิลใหม่
- เงินสดรับน้อยกว่ายอด ยืนยันไม่ได้; เงินสดมากกว่าคำนวณเงินทอนถูกต้อง
- พิมพ์ใบเสร็จตรวจ print preview และส่งออก CSV เปิดด้วยโปรแกรม spreadsheet
- แยกบิลทั้งจำนวน/บางจำนวน เปิดบิลใหม่ได้จากบิลเปิด ยอดรวมคงเดิม
- ย้ายโต๊ะ/รวมบิล ตรวจโต๊ะต้นทางว่างและบิลปลายทางมีรายการครบ
- จองโต๊ะวันนี้ แก้ชื่อ/เวลา ยกเลิกจอง
- ปรับ stock รับเข้าและลด ตรวจ audit ใกล้หมดตาม minimum
- Enterprise override ราคาเฉพาะสาขา สลับสาขาตรวจราคาไม่เปลี่ยนอีกสาขา
- โอนสินค้าปริมาณมากกว่าสต๊อกต้องผิดพลาด อนุมัติแล้ว stock ถูกทั้งสองฝั่ง
- ปิดกะที่มีบิลเปิดต้องได้ error; ปิดบิลก่อนปิดกะ และรับออเดอร์ไม่ได้จนเปิดกะ
- รีโหลดหน้าและ restart server ข้อมูลที่แก้ยังอยู่ เข้าสู่ระบบใหม่หลัง restart

## ข้อจำกัดการตรวจรับ

การตรวจเหล่านี้ใช้กับ local mockup ไม่ใช่การรับรอง production, concurrency หลาย process, payment gateway จริง, isolation ระดับฐานข้อมูล, network/offline resilience หรือมาตรฐานภาษี ภาพเมนูเป็นภาพประกอบและฟอนต์ภายนอกอาจโหลดไม่ได้หากไม่มีอินเทอร์เน็ต

## QR ordering เพิ่มเติม

- Public guest แยกจาก staff auth จำกัด tenant/branch/table/package และไม่คืนบัญชีพนักงาน
- สองมือถือเข้าบิลเดิม แต่ kitchen batch แยกรอบและคงสถานะที่เสิร์ฟแล้ว
- Duplicate/concurrent request ราคา/สาขาที่ client ปลอม สินค้าหมด จำนวนและ modifier ไม่ถูกต้อง
- การปิดบิล แยก/รวมบิล ย้ายโต๊ะ snapshot QR ที่ปิดแล้ว และ QR หมดอายุ
- Browser ถอดรหัสภาพ QR จริง เปิดลิงก์สั่งอาหาร และทดสอบ crypto.randomUUID fallback สำหรับ LAN HTTP
- Browser จำลอง response หายหลัง server รับรายการ แล้ว retry ด้วย requestId เดิมและไม่มีรายการซ้ำ

## ส่วนลดรายเมนู

- API ทดสอบเปอร์เซ็นต์ จำนวนเงิน การจำกัดส่วนลดไม่เกินราคาอาหาร และตัวเลือกเสริมที่ไม่ลดตาม
- ตรวจสิทธิ์ Validation เปอร์เซ็นต์ไม่เกิน 100 จำนวนติดลบ/ชนิดไม่ถูกต้อง/ทศนิยมเกินสองตำแหน่ง และ tenant isolation
- ตรวจบิลเก่าคงราคาเดิม ปิดโปรโมชั่นแล้วรายการใหม่กลับราคาปกติ รวมกับส่วนลดบิล ภาษี และคืนเงินตามยอดที่จ่าย
- ตรวจราคา override ของสาขากับ guest API และป้องกัน client ปลอมราคา/ส่วนลด
- ตรวจส่วนลด 100% สามารถแยกบิลและชำระยอดศูนย์ได้
- Chrome ทดสอบตั้ง/ปิดส่วนลดผ่าน UI ราคา POS modifier และใบเสร็จ รวมถึงราคาลดบนหน้าลูกค้า QR

## Deployment

- API ตรวจ health check, CORS/preflight, staff authentication และ HTTPS ผ่าน trusted proxy
- URL helper เก็บ repository path และใช้ hash route โดยรองรับลิงก์ /order เดิม
- Chrome build frontend เป็น static files ใต้ /ktppos-food/ แยก origin จาก API ตรวจ login, QR, refresh, เปลี่ยน QR ในแท็บเดิม, ครัว และชำระ
- `npm run test:production` ตรวจ static assets, SPA fallback, API, URL สาธารณะ และข้อมูล/การกันส่งซ้ำที่ยังอยู่หลัง restart โดยใช้ข้อมูลชั่วคราว
