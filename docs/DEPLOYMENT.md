> แนวทาง Node/Render และ static demo รุ่นเดิม สำหรับ Laravel/PHP + MariaDB บน Hostinger ให้ใช้ [คู่มือ Hostinger](HOSTINGER.md)

# เปิด KTP Table ออนไลน์จาก GitHub

เอกสารนี้ใช้ repository `KTPPUz/ktppos-food` เป็นตัวอย่าง มีสามวิธีที่ใช้โค้ดชุดเดียวกันได้:

| วิธี | URL ที่ใช้ | ส่วนที่โฮสต์ |
| --- | --- | --- |
| Mockup บน GitHub Pages | `https://ktppuz.github.io/ktppos-food/` | หน้าเว็บและข้อมูลจำลองในเบราว์เซอร์ ไม่ต้องมี Backend |
| A. Render ทั้งระบบ | `https://ชื่อบริการ.onrender.com` | React และ Express API ในบริการเดียว |
| B. GitHub Pages + Render API | `https://ktppuz.github.io/ktppos-food/` | Pages ให้บริการหน้าเว็บ; Render รัน API และเก็บข้อมูล |

GitHub Pages ไม่รัน Node.js API แต่โหมด Mockup ทดลองออเดอร์ในเบราว์เซอร์ได้ หากต้องการให้ออเดอร์จากหลายเครื่องเข้าครัวเดียวกันต้องเปิด Backend ก่อน [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## ก่อนเริ่ม

1. Commit และ push ไฟล์ที่แก้ทั้งหมด รวม `render.yaml`, `vite.config.ts`, `.github/workflows/static.yml`, `scripts/`, `shared/` และ source changes ขึ้น GitHub
2. ถ้าเปิดหน้าแก้ `static.yml` ค้างใน GitHub ตามภาพเดิม ให้ใช้ workflow ฉบับในโปรเจกต์นี้แทน อย่าสร้าง workflow deploy Pages สองชุดซ้อนกัน
3. ไม่ push `.data`, `.env.local`, token หรือข้อมูลร้านจริง; `.gitignore` กันไฟล์ข้อมูล/ค่า environment ไว้แล้ว
4. ระบบนี้ยังเป็น Demo ที่มีบัญชีสาธิต PIN 1234 ใช้ข้อมูลตัวอย่างสำหรับทดลอง ก่อนเปิดให้ใช้งานธุรกิจจริงต้องพัฒนา identity และ database ตาม [DATABASE-SPEC.md](DATABASE-SPEC.md)

การสร้างบริการ Render ต้องทำผ่านบัญชีของคุณ ส่วน GitHub Pages deploy อัตโนมัติเมื่อ push เข้า main และตั้ง Pages Source เป็น GitHub Actions

## ดู Mockup โดยไม่ต้องเปิด Backend

1. ตั้ง Settings → Pages → Source เป็น **GitHub Actions**
2. ไม่ต้องตั้ง `VITE_API_BASE_URL` (ถ้ามีค่าเก่า ให้ลบออก) แล้ว push main หรือ Run workflow
3. เปิด URL Pages เลือก Small/Medium/Enterprise และบัญชีที่ต้องการ PIN ทุกบัญชีคือ **1234**
4. ทดลองเลือกเมนู ส่งครัว เปลี่ยนสถานะ ชำระเงิน และดูรายงานได้
5. ข้อมูลอยู่ใน localStorage ของ origin นี้ รีเฟรชแล้วยังอยู่ กด **รีเซ็ตข้อมูล** เพื่อกลับเป็นข้อมูลตัวอย่างและออกจากบัญชี

แถบ **โหมด Demo** แสดงบนทุกหน้า ข้อมูลไม่เชื่อมข้ามเครื่องหรือข้าม browser profile การสาธิต QR ให้เปิดลิงก์ในแท็บใหม่ของเบราว์เซอร์เดียวกัน โหมดนี้ใช้กติกา POS ชุดเดียวกับ Node ผ่านตัวจำลอง API ในเครื่อง ไม่ส่ง API request ไป Backend และใช้ชุดข้อมูลแยกจาก `.data/demo.json` การล้าง site data จะลบข้อมูลจำลองด้วย หาก browser ไม่อนุญาตพื้นที่จัดเก็บจะแสดงข้อผิดพลาด

เมื่อต้องการทดลองร่วมกันหลายเครื่อง ให้ทำวิธี A/B ด้านล่าง การตั้ง URL API จริงแล้ว build ใหม่จะเปลี่ยนไปใช้ Backend โดยไม่ย้ายข้อมูล Mockup ขึ้นเซิร์ฟเวอร์

## A. เปิดทั้งระบบบน Render

### 1. สร้าง Web Service ผ่าน Blueprint

- เข้า Render ด้วยบัญชีของคุณ
- เลือก **New → Blueprint** และเชื่อม repository `KTPPUz/ktppos-food`
- เลือก branch `main` และใช้ไฟล์ `render.yaml` ที่ root
- ตรวจรายการทรัพยากรและค่าใช้จ่ายใน Render ก่อนสร้าง

Blueprint นี้กำหนดบริการ Node หนึ่ง instance พร้อม persistent disk `/var/data` เพื่อเก็บ JSON Demo ข้ามการ deploy/restart ใช้ compute plan ที่รองรับ disk ซึ่งเป็นบริการที่มีค่าใช้จ่าย ไม่ใช่ free plan [Render Blueprint](https://render.com/docs/blueprint-spec), [Persistent disks](https://render.com/docs/disks)

ค่าที่เตรียมไว้:

| รายการ | ค่า |
| --- | --- |
| Runtime | Node.js 22 |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Instances | 1 — JSON repository และ staff sessions ยังเป็นแบบ process เดียว |
| Disk mount | `/var/data` ขนาด 1 GB |
| DATA_DIR | `/var/data/ktp-table` |
| NODE_ENV | `production` |
| HOST | `0.0.0.0` |
| TRUST_PROXY | `1` สำหรับ reverse proxy ของ Render |
| CORS_ALLOWED_ORIGINS | `https://ktppuz.github.io` เพื่อรองรับ Pages ของบัญชีตัวอย่าง |

ไม่ต้องกำหนด PORT เอง Render ส่งค่าพอร์ตให้แอป หากชื่อบริการซ้ำ Render อาจให้ URL ต่างจากตัวอย่าง ให้ใช้ URL ที่ Dashboard แสดงจริง

### 2. เปิด URL บริการ

เมื่อสถานะ Live ให้เปิด URL HTTPS ที่ Render แสดง หน้า POS และ API อยู่โดเมนเดียวกัน ลองเปิด `/healthz` ควรได้ `{"status":"ok"}` แล้วทดลอง login และออเดอร์

Render มี `RENDER_EXTERNAL_URL` ให้โดยอัตโนมัติ แอปใช้ค่านี้สร้างตัวเลือก URL สำหรับ QR จึงไม่แสดง IP เครือข่ายภายในของเครื่องโฮสต์ให้ลูกค้าสแกน [Default environment variables](https://render.com/docs/environment-variables)

หากใช้โดเมนเอง ให้เพิ่ม `CUSTOMER_BASE_URL=https://pos.example.com` ใน Render Environment แล้ว deploy ใหม่ ค่านี้ระบุ URL เท่านั้น ไม่ได้ตั้ง DNS หรือ certificate ให้เอง

**ห้ามตั้ง `VITE_BASE_PATH=/ktppos-food/` บนบริการ Render แบบ A** เพราะหน้าเว็บของบริการนี้อยู่ที่ root `/` หากตั้ง `VITE_API_BASE_URL` บนบริการนี้โดยไม่จำเป็น ให้ลบออกเพื่อให้ API เป็น same-origin

### 3. ข้อมูลและการ redeploy

- ข้อมูลออนไลน์เริ่มจาก seed ชุดใหม่ ไม่ได้อัปโหลด `.data/demo.json` จากเครื่องคุณให้อัตโนมัติ
- ข้อมูลที่แก้จะอยู่ใน `/var/data/ktp-table/demo.json` ต้องใช้ persistent disk ตาม Blueprint
- Free/ephemeral filesystem ไม่รักษาข้อมูล JSON ข้าม redeploy/restart การเอา disk ออกจึงเปลี่ยนพฤติกรรมการเก็บข้อมูล [Render disks](https://render.com/docs/disks)
- staff login sessions ยังอยู่ในหน่วยความจำ ต้อง login ใหม่เมื่อบริการ restart
- เมื่อ push branch ที่เชื่อมไว้ Render ตั้งให้ redeploy ตาม commit ส่วน Pages frontend ต้อง build/deploy แยกตามวิธี B
- อย่าเพิ่มหลาย instance จนกว่าจะย้าย JSON และ sessions ไป datastore ที่รองรับหลาย process

หากใช้เฉพาะวิธี A สามารถ Disable workflow `Deploy frontend to GitHub Pages` ใน GitHub Actions ได้ โดยไม่กระทบ Render

## B. เปิดหน้าเว็บผ่าน `github.io`

เผยแพร่ Mockup ได้แม้ยังไม่มี Backend ตามขั้นตอนด้านบน เมื่อต้องการเชื่อมข้อมูลระหว่างเครื่อง ให้ทำวิธี A ให้ Backend Live แล้วตั้งค่าเพิ่มตามนี้

### 1. ตั้ง URL API ใน GitHub

ไปที่ repository → **Settings → Secrets and variables → Actions → Variables → New repository variable**

| Name | Value ตัวอย่าง |
| --- | --- |
| `VITE_API_BASE_URL` | `https://ชื่อบริการจริง.onrender.com/api` |

ใช้ URL จริงของ Backend และลงท้าย `/api` ไม่ใช้ localhost หรือ IP ใน Wi-Fi ตัวแปรนี้ไม่ใช่ secret เพราะถูกฝังใน JavaScript ที่ browser ดาวน์โหลด ห้ามใส่ token/PIN ลงในตัวแปร `VITE_`

### 2. ตรวจ CORS ฝั่ง Render

ใน Render Environment ให้กำหนด:

```text
CORS_ALLOWED_ORIGINS=https://ktppuz.github.io
```

Origin ต้องมีแค่ scheme + hostname + port ถ้ามี **ไม่ใส่ `/ktppos-food/`** ถ้าใช้ GitHub account หรือโดเมนอื่น ให้แก้ให้ตรงกับ Origin ของหน้าเว็บจริง หลาย origin ใช้ comma คั่นได้

API ตรวจ CORS เฉพาะ origin ที่อนุญาต พร้อมรองรับ preflight ของ Authorization/Content-Type โดยยังตรวจ session/permission ตามเดิม CORS ไม่ใช่ตัวแทน authentication

### 3. เปิด Pages

- Repository → **Settings → Pages**
- Build and deployment → Source เลือก **GitHub Actions**
- ไปที่ Actions → **Deploy frontend to GitHub Pages** → **Run workflow**
- หรือ push การแก้ไขเข้า `main` เพื่อให้ workflow ทำงาน

Workflow จะตรวจ `VITE_API_BASE_URL`, ติดตั้ง Node/dependencies, รัน API tests, build ด้วย base path ที่ GitHub Pages รายงาน, upload เฉพาะ `dist` แล้ว deploy ไม่อัปโหลดทั้ง repository ตาม template static เดิม [Vite deployment](https://v6.vite.dev/guide/static-deploy#github-pages)

ถ้ายังไม่ได้ตั้ง URL API workflow จะเผยแพร่โหมด Mockup ที่เก็บข้อมูลในเบราว์เซอร์ เมื่อใส่ URL จริงแล้ว Run workflow อีกครั้งจะใช้ข้อมูลจาก Backend หากใส่ URL ผิดรูปแบบ เช่น ไม่ใช่ HTTPS หรือไม่ลงท้าย /api workflow ยังหยุดเพื่อให้แก้ค่า

### 4. เปิดเว็บและออก QR ใหม่

URL ของ repository ตัวอย่าง:

```text
https://ktppuz.github.io/ktppos-food/
```

สถานะ deploy และ URL จริงดูที่ GitHub Actions/Settings → Pages หลัง workflow สำเร็จ URL นี้ยังไม่ถือว่าเปิดใช้จนกว่า deploy ในบัญชีคุณเสร็จ

เข้า Medium/Enterprise → QR สั่งอาหาร → เปิด QR โต๊ะหนึ่ง หน้าสร้าง QR จะใช้ URL ของ frontend ที่เปิดอยู่เป็นค่าเริ่มต้น เช่น:

```text
https://ktppuz.github.io/ktppos-food/#/order/TOKEN
```

ส่วน `#/order/...` ไม่ถูกส่งไปขอไฟล์จาก Pages จึงเปิดจาก QR และรีเฟรชได้โดยไม่ต้องสร้างไฟล์ `/order/TOKEN` หรือ 404 rewrite หากตั้ง API แล้ว ข้อมูลเมนูและการสั่งจะเรียก Render API; หากไม่ตั้ง จะใช้ข้อมูลจำลองในเบราว์เซอร์

ลิงก์เดิม `/order/TOKEN` ยังใช้กับ Node/Render ที่มี SPA fallback ได้ แต่ลิงก์ GitHub Pages ควรออกใหม่เป็นแบบ hash และมี path repository ครบ

## Environment variables

| ตัวแปร | อ่านเมื่อ | หน้าที่ |
| --- | --- | --- |
| PORT | Server startup | พอร์ตที่โฮสต์ให้มา; local default 5173 |
| HOST | Server startup | IP ที่ bind; default 0.0.0.0 |
| DATA_DIR | Server startup | ตำแหน่งข้อมูล JSON แบบถาวร |
| TRUST_PROXY | Server startup | จำนวน reverse-proxy hops ที่เชื่อถือ; local default 0 |
| CORS_ALLOWED_ORIGINS | Server startup | Frontend origins ที่เรียก API ข้ามโดเมนได้ |
| CUSTOMER_BASE_URL | Server startup | URL frontend สำหรับ QR แบบกำหนดเอง รวม repository path ได้ |
| RENDER_EXTERNAL_URL | Render กำหนดให้ | URL สาธารณะของบริการ เมื่อไม่ได้ตั้ง CUSTOMER_BASE_URL |
| VITE_API_BASE_URL | Frontend build | API prefix เช่น `https://service.onrender.com/api`; ไม่ตั้งจะใช้ `/api` ในโดเมนเดิม |
| VITE_DEPLOY_TARGET | Frontend build | workflow กำหนดเป็น pages เพื่อเปิดโหมด Mockup เมื่อยังไม่มี API; ไม่ใช้กับ local/Render |
| VITE_BASE_PATH | Frontend build | `/` สำหรับ Render หรือ `/ktppos-food/` สำหรับ Pages; workflow คำนวณให้ |

ดูตัวอย่างที่ `.env.example` สำหรับ local frontend สามารถสร้าง `.env.local` ให้ Vite อ่าน `VITE_` ได้ ส่วนค่าของ Node server ให้ export ใน shell หรือกำหนดใน Environment ของโฮสต์ ไฟล์ `.env.example` ไม่ถูกโหลดเข้า Node process เอง

เปลี่ยน `VITE_` แล้วต้อง build/deploy frontend ใหม่ เปลี่ยน server variables แล้วต้อง restart/redeploy Backend ด้วย

## ตรวจหลัง deploy แบบเชื่อม Backend

1. เปิด Backend `/healthz` ได้ 200 และ JSON status ok
2. เปิดหน้า login แล้วมีบัญชี Demo ใน dropdown ไม่มีข้อผิดพลาด fetch/CORS
3. Login แล้วเลือกเมนู/ส่วนลด ส่งครัว รับเงิน และดูรายงานได้
4. ออก QR ใหม่ เปิดใน browser อีกเครื่อง รีเฟรชหน้านั้นแล้วไม่ติด 404
5. ลูกค้าสองเครื่องสั่งเข้าบิลเดียวกันได้ สถานะครัวอัปเดต
6. ชำระครบแล้ว QR เดิมหยุดรับรายการ
7. Restart บริการ ตรวจว่าข้อมูลยอดขายยังอยู่ และสามารถ login ใหม่ได้

## แก้ปัญหาที่พบบ่อย

| อาการ | ตรวจอะไร |
| --- | --- |
| หน้า Pages ขาว / assets 404 | ใช้ workflow ใหม่ อัปโหลด dist และให้ Vite base ตรง repository path |
| Login ไม่ได้ / API 404 | VITE_API_BASE_URL ต้องเป็น Backend ที่ Live และมี `/api`; เปลี่ยนแล้วต้อง build ใหม่ |
| Browser แจ้ง CORS | CORS_ALLOWED_ORIGINS ต้องตรง frontend origin ไม่ใส่ path; redeploy Backend |
| QR เปิดหน้า login แทนเมนู | QR ของ Pages ต้องมี `#/order/` และใช้ frontend build รุ่นใหม่ |
| QR ชี้ localhost หรือ IP ภายในโฮสต์ | เปิดจาก HTTPS URL จริง ตั้ง CUSTOMER_BASE_URL หรือใช้ RENDER_EXTERNAL_URL |
| ข้อมูลหายหลัง restart | DATA_DIR ต้องอยู่ใน persistent disk และรัน instance เดียว |
| Workflow เก่าหยุดที่ Check backend URL | Push workflow รุ่นใหม่แล้ว Run workflow ใหม่; รุ่นใหม่เผยแพร่ Mockup ได้เมื่อยังไม่มี API |
| QR เก่าหมดอายุ / ส่งรายการไม่ได้หลัง restart | ดูอายุ/สถานะรอบบริการ; QR ต้องเป็นรอบที่ยังเปิดและกะขายยังเปิด |

## สิ่งที่ตรวจจากเครื่องพัฒนา

- API tests: health, proxy HTTPS, CORS/preflight, authentication และฟังก์ชันขายเดิม
- Chrome: build หน้าเว็บแบบ `/ktppos-food/` บน static server ที่ไม่มี SPA fallback แล้วแยก API เป็นอีก origin จริง
- ทดสอบ login, QR/hash route, reload, สั่งเข้าครัว และชำระเงินในสภาพแวดล้อมแยกดังกล่าว
- Chrome: static build ที่ไม่มี API สามารถ login → ส่งครัว → ชำระเงิน → reload → ทดลอง QR ในอีกแท็บ และรีเซ็ต โดยไม่มี API request
- ตรวจผล deploy ล่าสุดใน GitHub Actions และเปิด URL สาธารณะหลัง push ทุกครั้ง

## ใช้ PostgreSQL แทน JSON demo

Blueprint `render.yaml` ด้านบนยังเป็นทางเลือก JSON demo เดิม สำหรับ PostgreSQL ให้ทำตาม [คู่มือฐานข้อมูล](DATABASE.md): สร้าง PostgreSQL, ตั้ง `STORAGE_DRIVER=postgres` และ `DATABASE_URL` เป็น server secret, รัน `npm run db:generate` ระหว่าง build และ `npm run db:migrate` ก่อนเริ่มเซิร์ฟเวอร์ นำเข้า JSON ที่หยุดรับการแก้ไขแล้วด้วย `npm run db:import -- /path/to/demo.json` เพียงครั้งเดียว ไม่ต้องใช้ DATA_DIR หรือ disk สำหรับโหมดนี้ Session พนักงานเก็บในฐานข้อมูลแล้ว แต่ยังใช้ PIN demo และล็อกกลางตามข้อจำกัดในคู่มือ
