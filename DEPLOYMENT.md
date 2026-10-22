# DEPLOYMENT — Smart Member Check-in 2569

```
Browser ──/api──▶ Cloudflare Pages (React + Pages Function proxy) ──POST──▶ Apps Script Web App ──▶ Google Sheets
```

ทำ **2 ชุดแยกกันทั้งหมด**: `staging` (ทดสอบ/ซ้อม) และ `production` (วันงานจริง) แต่ละชุดมีสเปรดชีตหลัก, สเปรดชีตสำรอง, Apps Script project และ Cloudflare Pages project ของตัวเอง ห้ามชี้ staging ไปที่สเปรดชีตจริง

ตัวอย่างคำสั่งด้านล่างเขียนแบบ bash ถ้าใช้ PowerShell ให้ตั้งตัวแปรด้วย `$env:NAME='value'`

## 0. สิ่งที่ต้องมี

- Node.js ≥ 22 และ `npm install` แล้วใน `web/`
- บัญชี Google ของสหกรณ์ (เจ้าของสเปรดชีตและสคริปต์ — Web App รันในนามบัญชีนี้)
- เปิด Apps Script API ที่ https://script.google.com/home/usersettings
- `clasp` 3.x (`npm install -g @google/clasp`) แล้ว `clasp login`
- บัญชี Cloudflare แล้ว `npx wrangler login` (รันใน `web/`)

## 1. สเปรดชีต

1. สร้าง Google Sheets ใหม่ 2 ไฟล์ เช่น `SMC2569-staging` และ `SMC2569-staging-backup`
2. จด ID จาก URL (`https://docs.google.com/spreadsheets/d/<ID>/edit`)
3. **ห้ามแชร์สิทธิ์แก้ไข** ให้ Staff — ทุกการเขียนผ่าน backend เท่านั้น (แชร์ให้ Admin ดูได้ถ้าต้องการ)

## 2. Apps Script

```bash
cd gas
clasp create-script --type standalone --title "SMC2569 staging" --rootDir src
```

คำสั่งนี้สร้าง `gas/.clasp.json` (ไม่ถูก commit) ถ้ามี project อยู่แล้ว ให้คัดลอก `.clasp.json.example` เป็น `.clasp.json` แล้วใส่ `scriptId`

> ⚠️ `create-script` จะ**เขียนทับ** `gas/src/appsscript.json` ด้วย manifest ค่าเริ่มต้น (timezone America/New_York และไม่มีส่วน `webapp`) ให้คืนไฟล์จาก git (`git checkout gas/src/appsscript.json`) หรือแก้กลับให้เป็น `Asia/Bangkok` + `webapp` + `oauthScopes` ก่อน push

```bash
clasp push --force
```

`--force` ใช้เขียนทับ manifest บน server จากนั้นเปิด editor ด้วย `clasp open-script` แล้ว:

1. **Project Settings → Script Properties** เพิ่ม
   | Key | Value |
   |---|---|
   | `SPREADSHEET_ID` | ID สเปรดชีตหลัก |
   | `BACKUP_SPREADSHEET_ID` | ID สเปรดชีตสำรอง |
   | `TEST_MODE` | `true` **เฉพาะ staging** (production ห้ามตั้ง) |
2. dropdown ข้างปุ่ม Run แสดงเฉพาะฟังก์ชันของไฟล์ที่เปิดอยู่ ให้คลิกไฟล์ก่อน แล้วรันตามลำดับ (ครั้งแรกจะขออนุญาตสิทธิ์ Sheets และ Triggers ให้กดยอมรับ):
   1. ไฟล์ `init.js` → `initializeSheets` → สร้าง 6 ชีต, Station 01–08, Admin คนแรก และ `PROXY_KEY`
      - **จด username/PIN ของ Admin** และ**คัดลอกค่า `PROXY_KEY=…`** จาก Execution log (ใช้ในขั้นที่ 3) ระบบจะบังคับเปลี่ยน PIN เมื่อ login ครั้งแรก
      - ถ้าต้องการดู `PROXY_KEY` อีกครั้งภายหลัง ให้รัน `generateProxyKey` หรือดูที่ Script Properties
      - production: ลบ execution log นั้นทิ้งหลังจดแล้ว
   2. staging เท่านั้น: ไฟล์ `tests.js` → `runAllTests` → ทุกชุดต้องผ่าน
3. Deploy เป็น Web App:
   ```bash
   clasp create-deployment --description "staging v1"
   ```
   ค่าใน manifest กำหนดไว้แล้ว: **Execute as: Me**, **Who has access: Anyone** (จำเป็นเพราะ proxy เรียกแบบไม่ login; ความปลอดภัยมาจาก `PROXY_KEY` + session token)
   จด **Deployment ID** แล้วได้ URL `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`

### อัปเดตโค้ดโดยไม่เปลี่ยน URL

```bash
clasp push
```

```bash
clasp update-deployment <DEPLOYMENT_ID> --description "staging v2"
```

ดู Deployment ID ที่มีอยู่ด้วย `clasp list-deployments` — อย่าใช้ `create-deployment` ซ้ำ เพราะจะได้ URL ใหม่และต้องแก้ secret ใน Cloudflare

## 3. Cloudflare Pages

สร้าง project ครั้งแรก (ชื่อแยก staging/production):

```bash
cd web
npx wrangler pages project create smc2569-staging --production-branch main
```

ตั้ง secret (ระบบจะถามค่า ให้วาง URL `/exec` และ `PROXY_KEY` จากขั้นที่ 2):

```bash
npx wrangler pages secret put APPS_SCRIPT_URL --project-name smc2569-staging
```

```bash
npx wrangler pages secret put PROXY_KEY --project-name smc2569-staging
```

Build และ deploy:

```bash
npm run build && npx wrangler pages deploy dist --project-name smc2569-staging --branch main
```

ได้ URL `https://smc2569-staging.pages.dev` — เปิดแล้วต้องเห็นหน้า Login พร้อมรายการจุดลงทะเบียน (แปลว่า proxy → Apps Script ทำงาน)

ถ้าหน้า Login ขึ้นว่าโหลดรายการจุดไม่สำเร็จ ให้ตรวจ:
- `APPS_SCRIPT_URL` ลงท้ายด้วย `/exec` และเป็น deployment ล่าสุด
- `PROXY_KEY` ตรงกับ Script Property (ไม่มีช่องว่างเกิน)
- Web App ตั้ง "Anyone" แล้ว (ถ้าเป็น "Anyone with Google account" proxy จะได้หน้า login ของ Google → `UNKNOWN`)

## 4. Backup trigger

ใน Apps Script editor รัน `installBackupTrigger` (ติดตั้งซ้ำได้ ไม่ซ้อน) ระบบจะคัดลอกชีต Checkins ไปสเปรดชีตสำรองทุก 15 นาที **เฉพาะตอนมี Open Event** เก็บ 20 ชุดล่าสุด และเมื่อปิดงานจะสร้างชีต `FINAL_<EventID>` ให้อัตโนมัติ

หลังงานเสร็จ รัน `removeBackupTrigger`

## 5. Production

ทำซ้ำขั้นที่ 1–4 ด้วยชื่อ `production` (สเปรดชีตใหม่, Apps Script ใหม่, `smc2569-prod`) แล้ว:

- [ ] **ไม่ตั้ง** `TEST_MODE` และไม่รัน `runAllTests` บน production
- [ ] Login ด้วย Admin คนแรก → เปลี่ยน PIN → สร้าง Admin สำรองอีก 1 คน
- [ ] เมนู "จุดลงทะเบียน": ตั้งชื่อจุด 01–08 ให้ตรงกับป้ายหน้างาน
- [ ] เมนู "ผู้ใช้": สร้าง Staff/Supervisor (PIN เริ่มต้นแจกตัวต่อตัว ไม่ส่งในกลุ่มแชต)
- [ ] เมนู "สมาชิก" → "นำเข้าไฟล์" (ต้องไม่มีงานเปิดอยู่) แล้วตรวจจำนวนกับทะเบียน
- [ ] เมนู "งานประชุม": สร้างงานจริง ตั้งเกณฑ์องค์ประชุมตามข้อบังคับ (**ยังไม่เปิด**)
- [ ] รัน `installBackupTrigger`
- [ ] ซ้อมหน้างานตาม [TEST_PLAN.md](TEST_PLAN.md) หัวข้อ C ด้วยงาน "zz_test ซ้อม" แล้ว**ปิดงานซ้อม**

## 6. Checklist วันงาน

**ก่อนเปิดลงทะเบียน (≥ 30 นาที)**
- [ ] Notebook 8 เครื่อง: เปิด `https://smc2569-prod.pages.dev` ด้วย Chrome/Edge, ปิดโหมดประหยัดพลังงาน/sleep, เสียบสายชาร์จ
- [ ] Staff แต่ละคน login เลือกจุดของตัวเอง (header ต้องแสดงชื่อจุดถูกต้องและ "เชื่อมต่อแล้ว")
- [ ] Admin เปิดงานจริงที่เมนู "งานประชุม" → ทุกเครื่องเห็นชื่องานใน header ภายใน 1 นาที (หรือรีเฟรช)
- [ ] เปิด "จอแสดงยอด" บนเครื่องที่ต่อโปรเจกเตอร์ (บัญชี Supervisor) กด "เต็มจอ"
- [ ] วางแบบฟอร์มใบลงทะเบียนกระดาษไว้ทุกจุด

**ระหว่างงาน**
- Admin เฝ้า Dashboard; สมาชิกที่ "ไม่พบ" หรือ "ไม่มีสิทธิ์" ให้ส่งมาที่ Admin
  - สมาชิกตัวจริงที่ไม่มีชื่อ → "สมาชิก" → "เพิ่มสมาชิก (Walk-in)" แล้วให้จุดนั้นกด "รีเฟรชรายชื่อ"
  - เจ้าหน้าที่กดผิดคน → "ยกเลิก / ใบกระดาษ" → ยกเลิกพร้อมเหตุผล
- หน้าจอขึ้น "ไม่ทราบผล" → **อย่าให้สมาชิกออกจากจุด** กด "ตรวจสอบผลอีกครั้ง" หรือ "ส่งอีกครั้ง" (ปลอดภัย ไม่ซ้ำ)

**คำแนะนำสำหรับเจ้าหน้าที่ลงทะเบียน** (อธิบายก่อนเปิดงาน — อิงผลทดสอบจังหวะหน้างานบน staging ใน [TEST_PLAN.md](TEST_PLAN.md))

| สิ่งที่เห็นบนจอ | ความหมาย | ทำอย่างไร |
|---|---|---|
| "กำลังบันทึกการลงทะเบียน…" ไม่เกิน ~10 วินาที | ปกติ (ส่วนใหญ่ 4–8 วินาที) | รอ ระหว่างนั้นคุยกับสมาชิกได้ ไม่ต้องกดซ้ำ |
| "กำลังบันทึก…" / "กำลังตรวจสอบผล…" นาน 30 วินาที – 1 นาที | Google ตอบช้าเป็นช่วง ๆ (ในการทดสอบเกิดราว 1 นาทีใน 5 นาที) | **รอต่อ** ให้สมาชิกยืนรอที่จุด ระบบจะตรวจผลเองและไม่บันทึกซ้ำ |
| "ไม่ทราบผลการลงทะเบียน" | ยังยืนยันกับเซิร์ฟเวอร์ไม่ได้ | กด "ตรวจสอบผลอีกครั้ง" ก่อน ถ้าขึ้น "ยังไม่ได้บันทึก" จึงกด "ส่งอีกครั้ง" |
| ค้างหรือ "ไม่ทราบผล" ติดกันนานเกิน **2 นาที** หรือหลายจุดพร้อมกัน | ระบบ/เครือข่ายมีปัญหา | แจ้ง Admin แล้ว**เปลี่ยนไปใช้ใบลงทะเบียนกระดาษ**ทันที (เขียนเวลาให้ชัด) — รายที่ค้างอยู่ให้จดลงกระดาษด้วย ถ้าระบบบันทึกไปแล้ว ตอนนำเข้าจะแจ้ง "ลงทะเบียนแล้ว" และไม่ซ้ำ |
| "สมาชิกรายนี้ลงทะเบียนแล้ว" | มีบันทึกอยู่แล้ว (อาจเป็นอีกจุด หรือรายการที่ค้างเมื่อครู่) | ดูเวลา/จุดบนจอ ถ้าเป็นคนเดียวกันที่เพิ่งค้าง ให้ถือว่าเสร็จ ไปรายถัดไป |

- **ห้ามรีเฟรชหน้าเว็บหรือปิดแท็บระหว่าง "กำลังบันทึก…"** เพราะหน้าจอจะลืมรหัสคำขอเดิม (ข้อมูลไม่เสีย แต่ต้องค้นหาสมาชิกใหม่เพื่อตรวจสถานะ)
- Admin ควรเปิด Dashboard ไว้ตลอด ถ้าตัวเลข "อัปเดตล่าสุด" ไม่ขยับเกิน 1 นาทีพร้อมกับหลายจุดแจ้งว่าค้าง ให้ประกาศเปลี่ยนเป็นกระดาษทุกจุด

**ถ้าเครือข่ายใช้งานไม่ได้ (> 2–3 นาที)**
1. ทุกจุดเปลี่ยนไปจดใบกระดาษ: เลขสมาชิก, ชื่อ, **เวลา**, ลายมือชื่อ
2. เมื่อเครือข่ายกลับมา ใช้ระบบตามปกติต่อ
3. Admin นำเข้าใบกระดาษที่ "ยกเลิก / ใบกระดาษ" → "นำเข้าใบลงทะเบียนกระดาษ" (ใส่เวลาตามใบ) — ถ้าคนนั้นลงทะเบียนในระบบไปแล้ว ระบบจะแจ้ง "ลงทะเบียนแล้ว" และไม่บันทึกซ้ำ
4. นำเข้าย้อนหลังหลังปิดงานได้ โดยเลือกงานในช่อง "งานประชุม"

**ปิดงาน**
- [ ] Admin กด "ปิดรับลงทะเบียน" → ข้อความต้องระบุชีตสำรอง `FINAL_…`
- [ ] นำเข้าใบกระดาษที่เหลือ (ถ้ามี)
- [ ] "รายงาน" → ดาวน์โหลด Excel และ CSV เก็บไว้ 2 ที่
- [ ] รัน `removeBackupTrigger`; ทุกเครื่อง Logout

## 7. ข้อจำกัดของแพลตฟอร์มที่ควรรู้

- ผลวัดบน staging (8 จุด ทุก 15–20 วินาที): ลงทะเบียนได้ ≈ 17 ราย/นาที (1,500 คน ≈ 90 นาที), เจ้าหน้าที่รอ p50 5.8 วินาที แต่ p95 46 วินาที เพราะมีช่วงที่ Google ไม่ตอบราว 1 นาที — ความถูกต้องไม่ได้รับผลกระทบ (ดู [ADR 0004](docs/adr/0004-cloudflare-frontend-with-pages-functions-proxy.md))
- Apps Script ประมวลผลการลงทะเบียน p50 3 วินาที; อีก 2–4 วินาทีเป็นการ redirect ของ Google ซึ่งควบคุมไม่ได้
- Session เก็บใน CacheService ซึ่ง Google อาจล้างก่อนหมดอายุได้ (ไม่บ่อย) → ผู้ใช้แค่ login ใหม่ ไม่มีข้อมูลหาย
- Web App ที่ Execute as Me ใช้ quota ของบัญชีเจ้าของ (เช่น เวลาประมวลผลรวมต่อวันและจำนวน execution พร้อมกัน ~30) ซึ่งเพียงพอสำหรับ 8 จุด + Dashboard 2–3 จอ แต่ไม่ควรเปิด Dashboard ทิ้งไว้หลายสิบแท็บ
- แก้โค้ดแล้วต้อง `clasp push` + `clasp update-deployment` ทุกครั้ง — Web App จะไม่เห็นโค้ดใหม่จนกว่าจะอัปเดต deployment
