# วิธีใช้ Phase Prompts

ไฟล์ข้อกำหนดถาวรมีสามส่วน: [SPEC.md](../SPEC.md), [GLOSSARY.md](../GLOSSARY.md) และ [docs/adr/](../docs/adr/) ทุก phase อ้างถึงไฟล์เหล่านี้แทนการวางข้อกำหนดซ้ำ จึงประหยัด token

1. เปิด Claude Code ที่ root ของ repo นี้
2. วาง prompt ทีละ phase ตามลำดับ และเริ่ม phase ถัดไปเมื่อเงื่อนไข "เสร็จเมื่อ" ของ phase ก่อนผ่านครบแล้ว
3. ควรเริ่ม session ใหม่ (หรือ `/clear`) เมื่อขึ้น phase ใหม่ เพราะสถานะงานอยู่ในโค้ดและไฟล์แล้ว
4. ถ้าระหว่างทางมีการตัดสินใจใหม่ ให้อัปเดต SPEC/GLOSSARY/ADR ก่อน แล้วจึงแก้โค้ด

| Phase | ไฟล์ | ผลลัพธ์ |
|---|---|---|
| 1 | [01-foundation.md](01-foundation.md) | โครง repo, Sheet schema, `initializeSheets`, router, auth |
| 2 | [02-checkin-backend.md](02-checkin-backend.md) | `checkin.*`, `members.list`, Lock, idempotency |
| 3 | [03-proxy-and-checkin-ui.md](03-proxy-and-checkin-ui.md) | Pages Function proxy, Login, หน้า Check-in |
| 4 | [04-admin-dashboard.md](04-admin-dashboard.md) | Admin, Dashboard, Display, Import/Export, Backup |
| 5 | [05-tests-and-deploy.md](05-tests-and-deploy.md) | Load test, TEST_PLAN, DEPLOYMENT, README |
