อ่าน `GLOSSARY.md`, `SPEC.md` และ ADR 0004 แล้วทำ **Phase 3: Proxy + Check-in UI** ใน `web/`

ขอบเขต:
- `web/functions/api/[[path]].ts` ตาม "กติกาของ Proxy" ใน SPEC §2 และ `wrangler.toml` / `.dev.vars.example` สำหรับ `APPS_SCRIPT_URL` และ `PROXY_KEY`
- `web/src/types/api.ts`: type ของทุก action และ code ให้ตรงกับ backend; `services/api.ts`: client ตัวเดียวที่แนบ token และจัดการ `UNAUTHORIZED` (กลับไปหน้า Login)
- หน้า Login (เลือก Station), Change PIN และแถบบนของแอป
- หน้า **Check-in** ทำได้ครบในหน้าเดียวตาม SPEC §6 (ฝั่ง Client), §7 และ §8:
  - ค้นหาแบบ normalize
  - Member Card
  - dialog ทวนข้อมูล
  - ป้องกัน double click
  - จัดการ `UNKNOWN` ด้วย `checkin.status {requestId}`
  - ทุก state ครบ และใช้คีย์บอร์ดได้ทั้งหมด
- ฟังก์ชัน normalize ต้องมี unit test (Vitest) ครอบคลุมคำนำหน้า, ช่องว่างซ้ำ, ศูนย์นำหน้า และชื่อซ้ำ

เสร็จเมื่อ:
- `npm run build` และ unit test ผ่าน
- `wrangler pages dev` ทำงานต่อกับ Apps Script บน staging ได้จริง
- ทดสอบด้วยมือผ่านครบ: Check-in ปกติ, ซ้ำ, ไม่พบ Member, ปิด Wi-Fi ระหว่างกดยืนยัน (ต้องไม่แสดงว่าสำเร็จ) และเปิดสองแท็บ
