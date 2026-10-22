อ่าน `GLOSSARY.md`, `SPEC.md` และ `docs/adr/*` ให้ครบก่อน แล้วทำ **Phase 1: Foundation** ตาม SPEC หัวข้อ 2, 3, 4 (router และรูปแบบ response), 5 และ 13

ขอบเขต:
- โครง repo ตาม SPEC §13 และ `gas/` ที่ push ด้วย clasp ได้ โดยใส่ `.clasp.json.example` แทนไฟล์จริง
- `sheets.js`: header map, batch read/write, ฟังก์ชัน sanitize ป้องกัน formula injection
- `initializeSheets()` ที่ idempotent ตาม SPEC §3 และสร้าง Admin คนแรก
- `doPost` → ตรวจ `proxyKey` → router ตาม action → response contract (SPEC §4) พร้อม try/catch ที่ไม่ส่ง stack trace ออกไป
- `auth.login`, `auth.changePin`, `auth.logout`, `session.me` และ middleware ตรวจ session/Role/Active/Station ทุก action ตาม SPEC §5
- `audit.js` สำหรับเขียน AuditLogs

ยังไม่ต้องทำ: Check-in, UI และ proxy

เสร็จเมื่อ: รัน `initializeSheets()` ซ้ำ 2 ครั้งแล้วข้อมูลไม่เสียหาย และทดสอบผ่าน (ใช้ฟังก์ชันทดสอบใน GAS หรือ curl ไปที่ `/exec`) ครบทุกกรณี: login ถูก/ผิด, ถูกล็อกหลังผิด 5 ครั้ง, บังคับเปลี่ยน PIN, token หมดอายุ, Role ผิดได้ `FORBIDDEN`, `proxyKey` ผิดได้ `UNAUTHORIZED` สรุปวิธีทดสอบและผลไว้สั้น ๆ
