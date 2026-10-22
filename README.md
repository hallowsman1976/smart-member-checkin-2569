# Smart Member Check-in 2569

ระบบลงทะเบียนเข้าประชุมใหญ่สามัญประจำปี 2569 ของ **สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด** สำหรับสมาชิกประมาณ 1,500 คน ใช้ Notebook 8 จุดลงทะเบียนพร้อมกัน ระบบกันการลงทะเบียนซ้ำแม้กดพร้อมกันหรือเครือข่ายหลุด

```
Browser (React) ──/api──▶ Cloudflare Pages Function (proxy) ──▶ Google Apps Script ──▶ Google Sheets
```

| เอกสาร | เนื้อหา |
|---|---|
| [SPEC.md](SPEC.md) | ข้อกำหนดทั้งหมด: schema, API contract, critical section, หน้าจอ, acceptance criteria |
| [GLOSSARY.md](GLOSSARY.md) | ศัพท์ของระบบ (Check-in, Cancellation, Paper Check-in, Quorum, …) |
| [docs/adr/](docs/adr/) | เหตุผลของการตัดสินใจหลัก (PIN auth, 1 แถวต่อ Event+Member, ไม่รองรับการมอบฉันทะ, Cloudflare proxy) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | ติดตั้ง staging/production, backup และ checklist วันงาน |
| [TEST_PLAN.md](TEST_PLAN.md) | แผนทดสอบตาม acceptance criteria และแผนซ้อมหน้างาน |
| [prompts/](prompts/README.md) | prompt ที่ใช้พัฒนาทีละ phase |

## โครงสร้าง

```
gas/src/            Apps Script backend (router, auth, checkin, members, admin, dashboard, reports, backup, tests*)
web/src/            React app (features/checkin, dashboard, admin, history)
web/functions/      Cloudflare Pages Function: /api proxy
tests/gas-harness/  mock ของ Apps Script สำหรับรัน backend บน Node + mock /exec server
tests/load/         load test ยิงผ่าน proxy
```

## รันบนเครื่อง

ต้องมี Node.js ≥ 22 ติดตั้ง dependency ครั้งแรก:

```bash
cd web && npm install && cp .dev.vars.example .dev.vars
```

เปิด 2 terminal (คำสั่งละ terminal) แล้วเปิด http://localhost:8788

```bash
npm run mock:gas
```

```bash
cd web && npm run build && npm run pages:dev
```

`mock:gas` รันโค้ดใน `gas/src` จริงบน Node พร้อมสมาชิกทดสอบ 1,500 คน (ข้อมูลอยู่ใน memory หายเมื่อปิด) บัญชีและ PIN ทดสอบอยู่ใน [tests/gas-harness/seed.mjs](tests/gas-harness/seed.mjs) ตั้ง `MOCK_SEED_CHECKINS=600` ถ้าต้องการให้มีผู้ลงทะเบียนล่วงหน้า (ดู Dashboard)

ระหว่างแก้ UI ใช้ `cd web && npm run dev` (Vite, พอร์ต 5173) ซึ่ง proxy `/api` ไปที่ `pages:dev` (ต้องรันค้างไว้)

## ทดสอบ

```bash
npm run test:gas
```

```bash
cd web && npm test && npm run typecheck
```

load test (ต้องมีระบบรันอยู่ และใช้กับ dev/staging เท่านั้น) — ดู [TEST_PLAN.md](TEST_PLAN.md)

```bash
LOAD_BASE_URL=http://127.0.0.1:8788 LOAD_PIN=482916 LOAD_CONFIRM=yes npm run test:load
```

## Role

| Role | ใช้ทำอะไร |
|---|---|
| เจ้าหน้าที่ลงทะเบียน (Staff) | ค้นหา → ตรวจบัตร → ยืนยัน ที่จุดของตัวเอง, ดูประวัติจุดตัวเอง |
| ผู้ควบคุม (Supervisor) | Dashboard, จอแสดงยอด, ประวัติทุกจุด, รายงาน |
| ผู้ดูแลระบบ (Admin) | ทั้งหมด + สมาชิก, นำเข้าไฟล์, ยกเลิก/ใบกระดาษ, งานประชุม, ผู้ใช้, จุด, Audit Log |
