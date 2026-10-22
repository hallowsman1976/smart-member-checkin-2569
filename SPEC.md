# SPEC — Smart Member Check-in 2569

ข้อกำหนดถาวรของระบบ ใช้คู่กับ [GLOSSARY.md](GLOSSARY.md) (นิยามศัพท์) และ [docs/adr/](docs/adr/) (เหตุผลของการตัดสินใจหลัก) หากข้อความในเอกสารนี้ขัดกับ GLOSSARY หรือ ADR ให้หยุดและถามก่อนเขียนโค้ด

## 1. เป้าหมาย

ระบบลงทะเบียนเข้าประชุมใหญ่สามัญประจำปี 2569 ของสหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด
- รองรับ Member ประมาณ 1,500 คน และ Staff ใช้ Notebook 8 เครื่อง (Station 01–08) พร้อมกัน
- Staff ค้นหาจาก MemberID หรือชื่อ ทำ Identity Verification แล้วกดยืนยัน Check-in
- **แต่ละคู่ Event+Member มี Check-in ที่มีผลได้ไม่เกิน 1 รายการ** แม้หลายเครื่องจะกดพร้อมกันหรือเครือข่ายหลุดแล้วส่งซ้ำ

**นอกขอบเขต:** การมอบฉันทะ (ADR 0003), การลงคะแนนเสียง, Offline multi-master, การบันทึกเลขหรือภาพบัตรประชาชน, ขั้นตอนรับของที่ระลึกแยกต่างหาก (Check-in นับเป็นการรับของแล้ว)

## 2. สถาปัตยกรรม

```
Browser (React SPA) ──/api──▶ Cloudflare Pages Function ──POST──▶ Apps Script doPost ──▶ Google Sheets
     same-origin                (เก็บ APPS_SCRIPT_URL, PROXY_KEY)      (ตรวจ proxyKey + token)
```

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React + Vite + TypeScript (strict), Tailwind CSS + shadcn/ui + Lucide, ฟอนต์ Noto Sans Thai, ธีมฟ้า-ขาวแบบ minimal, ออกแบบสำหรับ 1366×768 ก่อนแต่ responsive |
| Hosting | Cloudflare Pages |
| Proxy | Cloudflare Pages Functions ที่ `functions/api/[[path]].ts` (ADR 0004) |
| Backend | Google Apps Script (V8) เขียนเป็น JavaScript + JSDoc แล้ว push ด้วย `clasp` deploy เป็น Web App แบบ **Execute as: Me / Access: Anyone** |
| Database | Google Sheets สเปรดชีตเดียว อ่านคอลัมน์ด้วย Header Mapping ไม่ผูกกับเลข column |
| ห้ามใช้ | Supabase, Firebase, MySQL, Node backend, `google.script.run`, การให้ Browser เรียก `/exec` ตรง ๆ |

### กติกาของ Proxy
- รับเฉพาะ `POST /api` ที่ body เป็น JSON แล้วเติม `proxyKey` จาก env ก่อนส่งต่อ
- ส่งต่อด้วย `Content-Type: text/plain` และตาม redirect ของ Apps Script ไปจนได้ผล
- Timeout 25 วินาที ถ้าหมดเวลาหรือ Apps Script ตอบไม่ใช่ JSON ให้ตอบ `{success:false, code:"UNKNOWN"}`
- ห้าม log body ที่มี PIN หรือ token
- Apps Script ตอบ HTTP 200 เสมอ (Web App ตั้ง status code เองไม่ได้) ผลลัพธ์จริงดูจาก `code` ใน body

### Script Properties
`SPREADSHEET_ID`, `BACKUP_SPREADSHEET_ID`, `PROXY_KEY` ห้ามฝังค่าเหล่านี้ในโค้ด และให้มีไฟล์ตัวอย่าง config ที่ไม่มีค่าจริง

## 3. Database — สเปรดชีตเดียว 6 ชีต

แถวแรกของทุกชีตคือ header คอลัมน์ ID ทุกตัวตั้ง number format เป็น Plain text (`@`) **MemberID เป็น string เสมอ** เพื่อไม่ให้ศูนย์นำหน้าหาย เวลาทั้งหมดเก็บเป็น ISO 8601 เขตเวลา Asia/Bangkok

| ชีต | คอลัมน์ |
|---|---|
| **Members** | `MemberID, FullName, Office, MemberType, Active, UpdatedAt, UpdatedBy` |
| **Checkins** | `CheckinID, EventID, MemberID, Status, Source, CheckinTime, StationID, StaffID, RequestID, UpdatedAt, UpdatedBy` |
| **Users** | `UserID, Username, FullName, Role, DefaultStationID, PinHash, PinSalt, MustChangePin, FailedAttempts, LockedUntil, Active` |
| **Stations** | `StationID, StationName, Active` |
| **Events** | `EventID, EventName, EventDate, Status, QuorumThreshold, OpenedAt, ClosedAt` |
| **AuditLogs** | `LogID, Timestamp, UserID, Action, EntityType, EntityID, Reason, Details` |

**ค่าที่ใช้ได้ในแต่ละคอลัมน์**
- `MemberType`: `ORDINARY` (สามัญ), `ASSOCIATE` (สมทบ)
- `Checkins.Status`: `REGISTERED`, `CANCELLED`
- `Source`: `STATION`, `PAPER`
- `Role`: `ADMIN`, `SUPERVISOR`, `STAFF`
- `Events.Status`: `DRAFT`, `OPEN`, `CLOSED`
- `Details`: JSON ที่ไม่มีข้อมูลอ่อนไหว

**กฎข้อมูล**
- หนึ่งแถว Checkins ต่อคู่ `EventID+MemberID` ตลอดไป (ADR 0002) Cancellation และ Re-check-in แก้แถวเดิม ส่วนประวัติอยู่ใน AuditLogs
- ในเวลาเดียวกันมี `Events.Status = OPEN` ได้ไม่เกิน 1 แถว
- `QuorumThreshold` เป็นจำนวน Ordinary Member ที่ Admin ตั้งต่อ Event
- ต้องมีฟังก์ชัน `initializeSheets()` ที่สร้างชีตและ header ที่ขาด ตั้ง format และ data validation ของคอลัมน์ enum โดยไม่ลบข้อมูลเดิม (idempotent) และสร้าง Admin คนแรกพร้อม `MustChangePin = TRUE`

## 4. API Contract

**Request** `POST /api`
```json
{ "action": "checkin.create", "token": "…", "requestId": "uuid", "payload": { } }
```
**Response** (ใช้รูปแบบเดียวกันทุก action)
```json
{ "success": true, "code": "REGISTERED", "message": "ข้อความภาษาไทยสำหรับผู้ใช้", "data": { } }
```

ใช้ชื่อ action และ type ชุดเดียวกันทั้ง Frontend และ Backend โดยประกาศ type ไว้ที่ `web/src/types/api.ts` และ backend มีตาราง router ที่ map action ไปยังฟังก์ชัน

### Codes
| Code | ความหมาย / พฤติกรรม UI |
|---|---|
| `OK` | สำเร็จ (action ทั่วไป) |
| `REGISTERED` | Check-in สำเร็จ แสดงเครื่องหมายถูกสีเขียว ชื่อ MemberID เวลา และปุ่ม "รายถัดไป" |
| `ALREADY_REGISTERED` | Member นี้ลงทะเบียนไปแล้ว แสดงเวลาและ Station ของครั้งแรก |
| `MEMBER_NOT_FOUND` | ไม่พบ Member แนะนำให้ติดต่อ Admin (กรณี Walk-in Member) |
| `MEMBER_INACTIVE` | Member ไม่มีสิทธิ์ |
| `EVENT_CLOSED` | ไม่มี Open Event หรืองานปิดรับลงทะเบียนแล้ว |
| `UNAUTHORIZED` | ไม่มี token, token หมดอายุ หรือ `proxyKey` ผิด ให้กลับไปหน้า Login |
| `FORBIDDEN` | Role ไม่มีสิทธิ์ทำ action นี้ |
| `MUST_CHANGE_PIN` | ต้องเปลี่ยน PIN ก่อนใช้งานต่อ |
| `PIN_LOCKED` | กรอก PIN ผิดเกินจำนวนครั้ง แสดงเวลาที่ปลดล็อก |
| `INVALID_INPUT` | ข้อมูลไม่ถูกต้อง แจ้งช่องที่ผิด |
| `BUSY` | รอ Lock ไม่ทัน ระบบยังไม่ได้เขียนอะไร ให้กดลองใหม่ได้ด้วย RequestID เดิม |
| `UNKNOWN` | ไม่รู้ผลลัพธ์ (เช่น timeout) ให้เรียก `checkin.status` ก่อนลองใหม่ (ดูหัวข้อ 6) |

### Actions และสิทธิ์ (S = Staff, V = Supervisor, A = Admin)
| Action | สิทธิ์ | หมายเหตุ |
|---|---|---|
| `auth.login` | ทุกคน | payload `{username, pin, stationId}` ใช้ `stationId` เฉพาะ Staff ซึ่งต้องเป็น Station ที่ Active |
| `stations.list` | ทุกคน | Station ที่ Active (`stationId, stationName`) สำหรับหน้า Login |
| `auth.changePin`, `auth.logout`, `session.me` | S V A | |
| `members.list` | S V A | คืนเฉพาะ `MemberID, FullName, Office, MemberType` ของ Member ที่ Active |
| `checkin.status` | S V A | payload `{memberId}` หรือ `{requestId}` อ่านจากชีตโดยตรง ห้ามใช้ cache |
| `checkin.create` | S | payload `{memberId}` |
| `checkin.history` | S V A | Staff เห็นเฉพาะ Station ตัวเองใน Open Event ส่วน V/A เห็นทั้งหมด |
| `dashboard.summary`, `display.summary` | V A | `display` ไม่มีชื่อ Member |
| `events.list` | V A | ทุก Event (ใช้เลือกงานในรายงาน/ประวัติ) |
| `admin.members.list` | A | สมาชิกทั้งหมดรวมที่ไม่ Active |
| `admin.members.add` | A | เพิ่ม Walk-in Member ทีละรายพร้อม `reason` ทำได้ขณะ Event เปิดอยู่ |
| `admin.members.update` | A | แก้ชื่อ/หน่วยงาน/ประเภท/Active ต้องมี `reason` |
| `admin.members.importBatch` | A | ทำได้เฉพาะตอนที่ไม่มี Open Event; MemberID ที่มีอยู่ = ปรับปรุง, ที่ไม่มี = เพิ่ม |
| `admin.users.list/create/update` | A | `update` รองรับ `resetPin`, `unlock`; ปิด/ลดสิทธิ์ Admin คนสุดท้ายไม่ได้ |
| `admin.stations.list/upsert` | A | |
| `admin.events.upsert/open/close` | A | `open` ปฏิเสธถ้ามีงานอื่นเปิดอยู่ และต้องมี `reason` ถ้าเปิดงานที่ปิดแล้ว; `close` สำรองผลสุดท้ายเป็นชีต `FINAL_<EventID>` |
| `admin.checkins.cancel` | A | ต้องมี `reason` |
| `admin.checkins.paper` | A | payload `{memberId, checkinTime, stationId, reason}` บันทึกเป็น `Source=PAPER` ใช้กฎกันซ้ำเหมือน `checkin.create` |
| `reports.export` | V A | |
| `audit.list` | A | |

## 5. Authentication & Session (ADR 0001)

- เข้าระบบด้วย Username + PIN 6 หลัก
  - เก็บ `PinHash = SHA-256(salt + pin)` ด้วย `Utilities.computeDigest` และ salt สุ่มแยกต่อ User
  - Admin ตั้ง PIN เริ่มต้นให้ และ User ต้องเปลี่ยน PIN เมื่อเข้าระบบครั้งแรก
- กรอก PIN ผิด 5 ครั้งติดกันจะถูกล็อก 15 นาที Admin ปลดล็อกหรือรีเซ็ต PIN ได้ บันทึก Login ที่สำเร็จและล้มเหลวลง AuditLogs ห้ามบันทึกค่า PIN
- `auth.login` สร้าง token สุ่ม แล้วเก็บ `{userId, role, stationId}` ไว้ใน `CacheService.getScriptCache()`
  - อายุ 2 ชม. แบบ **sliding**: ต่ออายุทุกครั้งที่มีคำสั่งเข้ามา
  - ถ้าหาไม่เจอให้ตอบ `UNAUTHORIZED`
- **ทุก action** ต้อง resolve User จาก token แล้วตรวจกับชีต Users ทุกครั้งว่า User ยัง Active และมี Role ตามสิทธิ์ ส่วน Staff ต้องตรวจว่า Station ยัง Active ด้วย
  - ห้ามเชื่อ `UserID`, `Role`, `StationID` หรือ `EventID` ที่ Client ส่งมา
  - Event ที่ใช้คือ Open Event ที่ server หาเอง
- Client เก็บ token ใน `sessionStorage` (แยกตามแท็บ) ห้ามเก็บ PIN ทุกที่ และห้ามใช้ localStorage กับข้อมูลอ่อนไหว

## 6. Check-in — Critical Section

**ฝั่ง Client**
1. แสดง dialog ทวนข้อมูลก่อนยืนยัน
2. เมื่อกดยืนยัน ให้ disable ปุ่ม แสดง loading และสร้าง `requestId` (UUID) **หนึ่งครั้งต่อความตั้งใจลงทะเบียนหนึ่งครั้ง**
3. ถ้าได้ `UNKNOWN` หรือ network error ให้เรียก `checkin.status {requestId}`
   - ถ้าพบว่าบันทึกแล้ว ให้แสดงผลตามที่พบ
   - ถ้าไม่พบ ให้ผู้ใช้กด "ลองใหม่" ด้วย **requestId เดิม**
4. ห้ามแสดงว่าสำเร็จจนกว่าจะได้ `REGISTERED` หรือ `ALREADY_REGISTERED` จาก server

**ฝั่ง Server (`checkin.create`)**
1. **นอก Lock**:
   - resolve session แล้วตรวจ User/Role/Station
   - หา Open Event ถ้าไม่มีให้ตอบ `EVENT_CLOSED`
   - ตรวจว่า Member มีอยู่และ Active ถ้าไม่ผ่านให้ตอบ `MEMBER_NOT_FOUND` หรือ `MEMBER_INACTIVE`
2. `LockService.getScriptLock().tryLock(10000)` ถ้าไม่ได้ Lock ให้ตอบ `BUSY` โดยไม่เขียนอะไร
3. **ภายใน Lock** (ทำงานให้น้อยที่สุด):
   1. อ่านคอลัมน์ `EventID, MemberID, Status, RequestID, CheckinTime, StationID` ของ Checkins ด้วย batch read จากชีตจริง ห้ามใช้ cache
   2. ถ้ามีแถวที่ `RequestID` เดียวกัน ให้คืนผลเดิม (`REGISTERED`)
   3. ถ้าแถวของ Event+Member นี้มีสถานะ `REGISTERED` ให้ตอบ `ALREADY_REGISTERED` พร้อมเวลาและ Station ของครั้งแรก
   4. ถ้าแถวมีสถานะ `CANCELLED` ให้ทำ Re-check-in โดยแก้แถวเดิม
   5. ถ้ายังไม่มีแถว ให้ `appendRow` แถวใหม่
   6. `SpreadsheetApp.flush()`
4. ปลด Lock ใน `finally` แล้วจึงเขียน AuditLogs **นอก Lock**
5. ทุก Station เรียกฟังก์ชันเดียวกัน ส่วน `admin.checkins.paper`, `admin.checkins.cancel` และ `admin.members.add` ใช้ Lock เดียวกันนี้

## 7. Member Search (ฝั่ง Client)

- หลัง Login ให้โหลด `members.list` เก็บใน memory เท่านั้น
  - รีเฟรชอัตโนมัติทุก 5 นาที และมีปุ่ม "รีเฟรชรายชื่อ" (สำหรับกรณีที่ Admin เพิ่ม Walk-in Member)
- ค้นหาทันทีขณะพิมพ์ (debounce ~250ms) และแสดงผลไม่เกิน 20 รายการ
- **Normalize** ข้อความทั้งสองฝั่งก่อนเทียบ
  - ตัดคำนำหน้า (นาย, นาง, นางสาว, น.ส., ดร., ว่าที่ร้อยตรี/ว่าที่ ร.ต., ยศทหาร/ตำรวจที่พบบ่อย)
  - รวมช่องว่างที่ติดกันให้เหลือช่องเดียว
  - ใช้ Unicode NFC
  - ค้นแบบ "มีคำนี้อยู่ในชื่อ"
- ถ้าพิมพ์ตัวเลขล้วน ให้เทียบ MemberID ทั้งแบบตรงตัวและแบบตัดศูนย์นำหน้า แล้วเรียงให้ผลที่ตรงตัวขึ้นก่อน
- ชื่อซ้ำกันให้แสดงทุกรายการ พร้อม Office และ MemberType ช่วยแยก
- เมื่อเลือก Member ให้เรียก `checkin.status` จาก server ก่อนแสดงปุ่มยืนยัน
- **Cache ใช้สำหรับค้นหาเท่านั้น ห้ามใช้ตัดสินว่าลงทะเบียนซ้ำหรือไม่**

## 8. หน้าจอ (แสดงตาม Role)

| หน้าจอ | Role | รายละเอียด |
|---|---|---|
| Login | — | Username, PIN, เลือก Station (Staff) |
| Change PIN | ทุก Role | |
| **Check-in** | S | ค้นหา → เลือก → Member Card → ตรวจบัตร → ยืนยัน → ผลลัพธ์ → รายถัดไป ทำได้ครบ**ในหน้าเดียว** แถบบนแสดงชื่อ Staff, Station, Event และสถานะการเชื่อมต่อ |
| History | S V A | |
| Dashboard | V A | ยอดรวม / ลงทะเบียนแล้ว / ยังไม่ลงทะเบียน / % / Quorum (นับเฉพาะ ORDINARY ที่ REGISTERED เทียบกับ `QuorumThreshold`) แยกตาม Station, MemberType, Office พร้อมรายการล่าสุด |
| Display | V A | สำหรับฉายในห้องประชุม ตัวอักษรใหญ่ ไม่แสดงชื่อ Member |
| Members / Users / Stations / Events | A | รวมการนำเข้าไฟล์ การเพิ่ม Walk-in และการเปิด/ปิดงาน |
| Checkins admin | A | Cancellation และ Paper Check-in |
| Reports | V A | Export |
| Audit Logs | A | |

**Member Card และการตรวจบัตร**
- Member Card แสดงชื่อ, MemberID, Office, MemberType และสถานะ Check-in ล่าสุดที่ได้จาก server
- ต้องมีปุ่ม "ข้อมูลไม่ตรง" ซึ่งหยุดขั้นตอนลงทะเบียนและแจ้งให้ติดต่อ Admin โดยไม่บันทึกอะไรลงระบบ

**ข้อกำหนด UX**
- ใช้งานด้วยคีย์บอร์ดเป็นหลัก: ↑/↓ เลือกรายการ, Enter เลือก, Enter ในหน้า dialog เพื่อยืนยัน, Esc ยกเลิก หลัง Check-in สำเร็จ focus กลับไปที่ช่องค้นหา
- ปุ่มใหญ่ สีบอกสถานะชัดเจน (เขียว = สำเร็จ, เหลือง = ซ้ำ, แดง = ผิดพลาด) และมีข้อความกำกับเสมอ ไม่ใช้สีอย่างเดียว
- ทุกหน้าต้องมีสถานะ Loading, Empty, Success, Duplicate, Error และ Offline (`navigator.onLine` + ผลของ request ล่าสุด)
- ห้ามใช้ mock data ใน production build
- **Polling**:
  - Dashboard และ Display ทุก 10 วินาที แสดง "อัปเดตล่าสุด" และหยุด poll เมื่อแท็บถูกซ่อน
  - Server cache ผลสรุปไว้ 5 วินาที นับจากชีต Checkins จริง ไม่ได้นับจาก event ฝั่ง Client

## 9. Import / Export

- **นำเข้าไฟล์** .xlsx หรือ .csv ทำใน Browser ด้วย SheetJS (`xlsx`)
  1. แสดงหน้าจับคู่คอลัมน์ (ชื่อคอลัมน์ของไฟล์ → `MemberID, FullName, Office, MemberType`) พร้อม map ค่า "สามัญ/สมทบ"
  2. แสดงตัวอย่างข้อมูลและรายการที่มีปัญหา: MemberID ซ้ำ, MemberID ว่าง, MemberID ที่ดูเหมือนศูนย์นำหน้าหายไป (ความยาวไม่เท่ากับรายการส่วนใหญ่)
  3. ยืนยันแล้วส่งเป็น batch ละ ≤ 500 แถว
  4. Server ตรวจข้อมูลซ้ำอีกรอบ แล้วเขียนด้วย `setValues` ครั้งเดียวต่อ batch
- **Export** ผล Check-in เป็น CSV (UTF-8 + BOM เพื่อให้ Excel แสดงภาษาไทยถูกต้อง) และ .xlsx
  - ป้องกัน CSV/Formula Injection: ใส่ `'` นำหน้าเซลล์ที่ขึ้นต้นด้วย `= + - @` หรือ tab/CR
  - กฎเดียวกันนี้ใช้ตอนเขียนข้อความจากผู้ใช้ลงชีตด้วย

## 10. Backup และแผนสำรอง

- Time-driven trigger ทุก 15 นาที: ถ้ามี Open Event ให้คัดลอกชีต Checkins ไปไว้ใน `BACKUP_SPREADSHEET_ID` (ตั้งชื่อชีตตามเวลา และเก็บไว้ 20 ชุดล่าสุด)
- เมื่อปิด Event ให้ export ผลสุดท้ายอีกครั้งโดยอัตโนมัติ
- ก่อนวันงาน พิมพ์รายชื่อ Member เรียงตาม MemberID แยกตาม Station เตรียมไว้เป็นแบบฟอร์ม Paper Check-in ถ้าเครือข่ายใช้งานไม่ได้ ให้จดลงกระดาษพร้อมเวลา แล้ว Admin นำเข้าผ่าน `admin.checkins.paper`

## 11. Security & Performance

- Staff ไม่มีสิทธิ์เข้าถึงสเปรดชีตโดยตรง ข้อมูลทั้งหมดเขียนผ่าน backend เท่านั้น
- ป้องกัน HTML injection: React escape ให้แล้ว ห้ามใช้ `dangerouslySetInnerHTML` กับข้อมูลจากผู้ใช้
- ไม่ส่งข้อมูลให้ Client เกินกว่าที่หน้าจอใช้
- ข้อความ error ใน UI เป็นภาษาไทยที่ผู้ใช้เข้าใจได้ ไม่แสดง stack trace ส่วน log ฝั่ง server ห้ามมี PIN หรือ token
- อ่าน/เขียนชีตแบบ batch และสร้าง header map ครั้งเดียวต่อ request
- ใช้ `CacheService` กับข้อมูลที่อ่านอย่างเดียวได้ (members list, summary) และล้าง cache เมื่อมีการแก้ไขข้อมูลที่เกี่ยวข้อง
- อยู่ในโควตาของ Apps Script: Web App ที่ Execute as Me ทำงานพร้อมกันได้ประมาณ 30 executions ต่อผู้ใช้ ซึ่งพอสำหรับ 8 Station + Dashboard

## 12. Acceptance Criteria

1. ค้นหา Member 1,500 คนได้ถูกต้อง รวมถึง MemberID ที่มีศูนย์นำหน้า ชื่อซ้ำ และชื่อที่มีคำนำหน้าหรือช่องว่างเกิน
2. 8 คำขอ `checkin.create` ด้วย MemberID เดียวกันพร้อมกัน ได้ `REGISTERED` 1 รายการ ที่เหลือได้ `ALREADY_REGISTERED` และในชีตมี 1 แถว
3. ส่ง RequestID เดิม 10 ครั้ง ได้แถวใหม่ 1 แถว และทุกครั้งได้ผลเดียวกัน
4. 8 คำขอพร้อมกันด้วย MemberID ต่างกัน สำเร็จทั้งหมด (`BUSY` ลองใหม่แล้วผ่าน) บันทึกค่า p95 latency ไว้ใน TEST_PLAN
5. เมื่อ timeout หรือเน็ตหลุด UI ไม่แสดงว่าสำเร็จ และตรวจสถานะด้วย RequestID ก่อนลองใหม่
6. สิทธิ์ตาม Role ถูกบังคับที่ backend: เรียก action ข้าม Role ได้ `FORBIDDEN`, token ปลอม/หมดอายุ หรือ `proxyKey` ผิดได้ `UNAUTHORIZED`
7. ยอดบน Dashboard และไฟล์ Export ตรงกับจำนวนแถว `REGISTERED` ในชีต Checkins และ Quorum คำนวณจาก ORDINARY เท่านั้น
8. Cancellation → Re-check-in → Paper Check-in ทำงานถูกต้อง และมี Audit Log ครบทุกขั้น
9. ผ่านกรณี double click, หลายแท็บ, session หมดอายุ และ PIN ผิดจนถูกล็อก
10. มีคู่มือ deploy (clasp + Cloudflare), การตั้งค่า backup และแผนซ้อมหน้างานด้วย Notebook จริง 8 เครื่อง

## 13. โครงสร้าง Repo

```
/GLOSSARY.md  /SPEC.md  /docs/adr/  /prompts/
/gas/            .clasp.json.example (rootDir=src), src/appsscript.json, src/*.js (router, auth, checkin, members, admin, dashboard, sheets, audit, backup, tests)
/web/            Vite React app; src/{components,features,services,types,lib}
/web/functions/  api/[[path]].ts  (Cloudflare Pages Function)
/tests/gas-harness/  mock ของ Apps Script สำหรับรันชุดทดสอบใน gas/src/tests.js บน Node (`npm run test:gas`)
/tests/load/     สคริปต์ Node สำหรับทดสอบ concurrency (ยิงผ่าน proxy บน staging)
/README.md  /DEPLOYMENT.md  /TEST_PLAN.md
```

## 14. กติกาการทำงานสำหรับ Claude

- อ่าน GLOSSARY.md, SPEC.md และ ADR ก่อนเริ่มทุก phase และใช้ศัพท์ตาม GLOSSARY ทั้งในโค้ดและ UI
- ตรวจโค้ดเดิมก่อนแก้ ห้ามสร้างไฟล์ซ้ำ และห้ามเขียนทับส่วนที่ทำงานอยู่แล้วโดยไม่จำเป็น
- ถ้าต้องตัดสินใจเรื่องใหม่ที่ SPEC ไม่ได้ครอบคลุม ให้ถามก่อน ถ้าการตัดสินใจนั้นย้อนกลับยาก ให้เสนอเขียน ADR
- ตอบสั้น เน้นโค้ด, path และวิธีทดสอบ ถ้าติดข้อจำกัดของแพลตฟอร์ม ให้บอกสั้น ๆ พร้อมทางเลือกที่ทำได้จริง
- จบแต่ละ phase ด้วยรายการว่าทำอะไรไปแล้ว ทดสอบอย่างไร และสิ่งที่ยังไม่ได้ทดสอบ
