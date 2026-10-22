อ่าน `SPEC.md` (§10, §12) แล้วทำ **Phase 5: Tests + Deploy**

ขอบเขต:
- `tests/load/` สคริปต์ Node ที่ยิงคำขอผ่าน proxy ใน staging โดยรับ URL และ token ผ่าน env ครอบคลุม 3 กรณี
  1. 8 คำขอพร้อมกันด้วย MemberID เดียวกัน
  2. RequestID เดิม 10 ครั้ง
  3. 8 คำขอพร้อมกันด้วย MemberID ต่างกัน
  
  ตรวจผลกับชีตจริงหลังรัน และรายงาน p95 latency กับจำนวนครั้งที่ได้ `BUSY`
- `TEST_PLAN.md`: ไล่ตาม Acceptance Criteria ใน SPEC §12 ทีละข้อ ระบุวิธีทดสอบ ผลที่คาด และช่องให้บันทึกผลจริง พร้อมแผนซ้อมกับ Notebook จริง 8 เครื่องในวันก่อนงาน
- `DEPLOYMENT.md`:
  - clasp login/push/deploy (Execute as Me, Anyone) และวิธีอัปเดต deployment เดิมโดยไม่เปลี่ยน URL
  - การตั้ง Script Properties
  - Cloudflare Pages build และ env secrets
  - การแยก staging กับ production
  - ติดตั้ง backup trigger
  - checklist ของวันงาน และขั้นตอนเมื่อเครือข่ายใช้งานไม่ได้ (Paper Check-in)
- `README.md`: ภาพรวมระบบ, โครง repo และวิธีรันบนเครื่อง (สั้น ๆ แล้วลิงก์ไปยังไฟล์อื่น)

เสร็จเมื่อ: รัน load test ทั้ง 3 กรณีบน staging แล้วผ่านตาม SPEC §12 ข้อ 2–4 และบันทึกผลจริงลง TEST_PLAN.md แล้ว
