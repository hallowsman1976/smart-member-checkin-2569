อ่าน `GLOSSARY.md` และ `SPEC.md` แล้วทำ **Phase 4: Admin, Dashboard, Display** ต่อจากโค้ดเดิม ทั้งฝั่ง backend และ frontend

ขอบเขต:
- `dashboard.summary` และ `display.summary` ที่ cache ไว้ 5 วินาที นับจากชีตจริง พร้อมคำนวณ Quorum (SPEC §8)
- หน้า Dashboard และ Display ตาม SPEC §8 (poll ทุก 10 วินาที, แสดง "อัปเดตล่าสุด" และหยุด poll เมื่อแท็บถูกซ่อน)
- หน้า Admin สำหรับ Members (รวมการเพิ่ม Walk-in Member), Users (ตั้ง/รีเซ็ต PIN, ปลดล็อก), Stations, Events (เปิดได้ครั้งละงาน, ตั้ง `QuorumThreshold`), Checkins (Cancellation, Paper Check-in) และ Audit Logs
- นำเข้าไฟล์ตาม SPEC §9 (SheetJS, จับคู่คอลัมน์, แสดงตัวอย่าง, ส่ง batch ≤ 500 แถว, ทำได้เฉพาะตอนที่ไม่มี Open Event)
- Export CSV (มี BOM) และ .xlsx พร้อมกันฟอร์มูลา
- Backup trigger ตาม SPEC §10 และฟังก์ชันติดตั้ง/ถอน trigger

เสร็จเมื่อ: ยอดบน Dashboard ตรงกับจำนวนแถว `REGISTERED` ในชีต, นำเข้าไฟล์ตัวอย่างที่มี MemberID ขึ้นต้นด้วย 0 แล้วศูนย์ไม่หาย, ไฟล์ export ที่มีชื่อขึ้นต้นด้วย `=` เปิดใน Excel แล้วไม่ถูกตีความเป็นสูตร และ Backup trigger สร้างชีตสำรองได้จริง
