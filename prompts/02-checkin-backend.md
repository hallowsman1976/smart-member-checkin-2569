อ่าน `GLOSSARY.md`, `SPEC.md` และ ADR 0002 แล้วทำ **Phase 2: Check-in Backend** ต่อจากโค้ดใน `gas/`

ขอบเขต:
- `members.list` (SPEC §4, §7: ส่งแค่ 4 ฟิลด์ของ Member ที่ Active และ cache ฝั่ง server ได้)
- `checkin.create` ตาม SPEC §6 **ทุกขั้นตอน**: ตรวจนอก Lock → `tryLock(10000)` → อ่านจากชีตจริง → ตรวจ RequestID → ตรวจคู่ Event+Member → append หรือ Re-check-in ในแถวเดิม → `flush` → ปลด Lock ใน `finally` → เขียน Audit นอก Lock
- `checkin.status` (ค้นด้วย `memberId` หรือ `requestId` อ่านจากชีตเท่านั้น) และ `checkin.history` พร้อมการกรองตาม Role
- `admin.checkins.cancel`, `admin.checkins.paper`, `admin.members.add` ที่ใช้ Lock และกฎกันซ้ำชุดเดียวกัน
- หา Open Event จากฝั่ง server เท่านั้น

เสร็จเมื่อ: มีฟังก์ชันทดสอบใน GAS ที่ครอบคลุมทุกกรณีและผ่านครบ ได้แก่ ลงทะเบียนใหม่, ซ้ำด้วย RequestID เดิม, ซ้ำด้วย RequestID ใหม่, Member ไม่ Active, ไม่มี Open Event, ยกเลิกแล้วลงทะเบียนใหม่ (ได้แถวเดิม), Paper Check-in ของ Member ที่ลงทะเบียนแล้ว (ได้ `ALREADY_REGISTERED`) และหลังทุกกรณีต้องมี 1 แถวต่อ Event+Member

ส่วนการทดสอบ concurrency จริงไว้ทำใน Phase 5
