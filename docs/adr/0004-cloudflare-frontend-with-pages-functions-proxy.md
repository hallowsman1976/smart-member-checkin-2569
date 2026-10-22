# Frontend บน Cloudflare Pages โดยมี Pages Functions เป็น proxy ไป Apps Script

Frontend (React) โฮสต์บน Cloudflare Pages ไม่ได้เสิร์ฟผ่าน Apps Script HTML Service ดังนั้นจึงใช้ `google.script.run` ไม่ได้ Browser เรียกเฉพาะ `/api/*` ซึ่งเป็น origin เดียวกัน แล้ว Pages Function ส่งต่อไปยัง `doPost` ของ Apps Script ทำให้ไม่มีปัญหา CORS หรือการ redirect ฝั่ง Browser และ URL `/exec` ถูกเก็บเป็น secret ของ Cloudflare Function ยังแนบ `proxyKey` ไปใน body ทุกครั้ง (เพราะ `doPost` อ่าน HTTP header ไม่ได้) เพื่อให้ Apps Script ปฏิเสธคำขอที่ไม่ได้ผ่าน proxy

## Considered Options

- **Apps Script HTML Service + `google.script.run`**: ไม่มีปัญหา CORS โดยธรรมชาติ แต่ไม่ได้เลือก เพราะต้องการให้ frontend อยู่บน Cloudflare
- **Browser เรียก `/exec` ตรง ๆ ด้วย POST `text/plain`**: ใช้งานได้ แต่เปิดเผย URL ของ backend และการ redirect ทำให้ debug ปัญหาเครือข่ายหน้างานยาก

## Consequences

- Apps Script ส่งผลกลับผ่าน redirect ไปยัง `script.googleusercontent.com/macros/echo` proxy จึงต้องจัดการ redirect เอง: 301/302/303 ดึงผลด้วย GET, 307/308 ส่ง POST ซ้ำ, และถ้า echo ยังไม่พร้อม (Google redirect กลับไป `/exec`) ให้ดึง echo URL เดิมซ้ำ ห้ามตามกลับไป `/exec` เพราะจะไปตกที่ `doGet`
- **ยอมรับความหน่วงเป็นช่วง ๆ (2026-10-23):** ทดสอบจังหวะหน้างานบน staging ได้ p50 5.8 วินาที แต่มีช่วงราว 1 นาทีที่ Google ไม่ตอบภายใน 25 วินาที ทำให้ ~11% ของรายรอ 30–80 วินาที ความถูกต้องไม่เสีย (requestId + ตรวจผลก่อนส่งซ้ำ) จึงใช้สถาปัตยกรรมนี้ต่อ และรับมือด้วยคำแนะนำเจ้าหน้าที่ + ใบกระดาษใน DEPLOYMENT.md แทนการย้ายไป HTML Service ยังไม่ได้พิสูจน์ว่าการค้างนี้เกิดเฉพาะเส้นทางผ่าน Cloudflare — ถ้าปัญหารุนแรงขึ้นในการซ้อมหน้างาน ให้ทดสอบยิงตรงไป Apps Script เปรียบเทียบก่อนพิจารณาเปลี่ยน
